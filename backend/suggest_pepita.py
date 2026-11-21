#!/usr/bin/env python3
"""Pepite per Tutti: receives "Suggerisci una pepita" submissions and emails them.

The web app (app.js, openSuggestPepita) POSTs the form as JSON to this script, which
validates it and sends a plain-text email over SMTP to the curator. Standard library
only — nothing to pip install.

It runs as:
  * a WSGI app (``application``): cPanel "Setup Python App" / Passenger, gunicorn,
    uWSGI, mod_wsgi …
  * a CGI script: executed by the web server with GATEWAY_INTERFACE set
  * a local dev server: ``python3 suggest_pepita.py [port]`` (default 8001)

Configuration comes from environment variables (see README.md). An INI file can be
used instead by pointing SUGGEST_CONFIG at it — keep it outside the web root, it holds
the SMTP password. Set SUGGEST_DRY_RUN=1 to print the email instead of sending it.
"""

import configparser
import json
import os
import re
import smtplib
import ssl
import sys
import tempfile
import time
from email.message import EmailMessage
from email.utils import formataddr, formatdate, make_msgid

# ── Limits ──────────────────────────────────────────────────────────────────────
MAX_BODY_BYTES = 16 * 1024
FIELD_LIMITS = {          # name → (required, max length)
    'nome':      (True,  120),
    'quartiere': (False, 60),
    'perche':    (True,  1500),
    'link':      (False, 300),
    'autore':    (False, 80),
}
MIN_FILL_SECONDS = 3      # faster than this is a bot
RATE_LIMIT = 5            # submissions …
RATE_WINDOW = 3600        # … per IP per hour

_CONTROL = re.compile(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]')


# ── Configuration ───────────────────────────────────────────────────────────────
def load_config(environ=None):
    env = dict(os.environ)
    if environ:
        # Under CGI/WSGI the server may pass settings (e.g. Apache SetEnv) in environ
        env.update({k: v for k, v in environ.items() if isinstance(v, str)})
    cfg = {}
    path = env.get('SUGGEST_CONFIG')
    if path and os.path.exists(path):
        parser = configparser.ConfigParser()
        parser.read(path, encoding='utf-8')
        if parser.has_section('suggest'):
            cfg.update({k.upper(): v for k, v in parser.items('suggest')})
    for key in ('SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURITY', 'SMTP_USER', 'SMTP_PASSWORD',
                'MAIL_FROM', 'MAIL_TO', 'ALLOWED_ORIGINS', 'TRUST_PROXY',
                'SUGGEST_DRY_RUN', 'SUGGEST_RATE_FILE'):
        if env.get(key):
            cfg[key] = env[key]
    security = cfg.get('SMTP_SECURITY', 'starttls').lower()
    return {
        'smtp_host': cfg.get('SMTP_HOST', ''),
        'smtp_port': int(cfg.get('SMTP_PORT') or (465 if security == 'ssl' else 587)),
        'smtp_security': security,                      # starttls | ssl | none
        'smtp_user': cfg.get('SMTP_USER', ''),
        'smtp_password': cfg.get('SMTP_PASSWORD', ''),
        'mail_from': cfg.get('MAIL_FROM', '') or cfg.get('SMTP_USER', ''),
        'mail_to': [a.strip() for a in cfg.get('MAIL_TO', '').split(',') if a.strip()],
        'allowed_origins': [o.strip().rstrip('/') for o in cfg.get(
            'ALLOWED_ORIGINS', 'https://ilariavita.com,https://www.ilariavita.com').split(',') if o.strip()],
        'trust_proxy': cfg.get('TRUST_PROXY', '') in ('1', 'true', 'yes'),
        'dry_run': cfg.get('SUGGEST_DRY_RUN', '') in ('1', 'true', 'yes'),
        'rate_file': cfg.get('SUGGEST_RATE_FILE') or os.path.join(tempfile.gettempdir(), 'pepite_suggest_rate.json'),
    }


# ── Validation ──────────────────────────────────────────────────────────────────
class InvalidSubmission(ValueError):
    pass


def clean(value, max_len, single_line):
    if not isinstance(value, str):
        value = '' if value is None else str(value)
    value = _CONTROL.sub('', value.replace('\r\n', '\n').replace('\r', '\n'))
    if single_line:
        value = ' '.join(value.split())
    else:
        value = re.sub(r'\n{3,}', '\n\n', value)
    return value.strip()[:max_len]


def validate(data):
    """Returns the cleaned submission, or raises InvalidSubmission (code, message)."""
    if not isinstance(data, dict):
        raise InvalidSubmission('bad_request')
    # Honeypot: a field hidden from people, which bots fill in
    if str(data.get('website') or '').strip():
        raise InvalidSubmission('spam')
    try:
        elapsed = float(data.get('elapsed', 0)) / 1000
    except (TypeError, ValueError):
        elapsed = 0
    if elapsed < MIN_FILL_SECONDS:
        raise InvalidSubmission('too_fast')
    out = {}
    for name, (required, max_len) in FIELD_LIMITS.items():
        out[name] = clean(data.get(name), max_len, single_line=(name != 'perche'))
        if required and not out[name]:
            raise InvalidSubmission('missing_' + name)
    lang = str(data.get('lang') or 'it').lower()
    out['lang'] = lang if lang in ('it', 'en') else 'it'
    return out


# ── Rate limiting (per IP, file-based so it also works under CGI) ───────────────
def rate_limited(ip, path, now=None):
    now = now or time.time()
    try:
        with open(path, 'r', encoding='utf-8') as f:
            hits = json.load(f)
    except (OSError, ValueError):
        hits = {}
    hits = {k: [t for t in v if now - t < RATE_WINDOW] for k, v in hits.items()}
    hits = {k: v for k, v in hits.items() if v}
    mine = hits.setdefault(ip, [])
    if len(mine) >= RATE_LIMIT:
        return True
    mine.append(now)
    try:
        tmp = path + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(hits, f)
        os.replace(tmp, path)
    except OSError:
        pass  # never block a submission because the counter can't be written
    return False


# ── Email ───────────────────────────────────────────────────────────────────────
def build_email(s, cfg, ip=''):
    msg = EmailMessage()
    msg['Subject'] = 'Nuova pepita: ' + s['nome']
    msg['From'] = formataddr(('Pepite per Tutti', cfg['mail_from']))
    msg['To'] = ', '.join(cfg['mail_to'])
    msg['Date'] = formatdate(localtime=True)
    msg['Message-ID'] = make_msgid(domain=cfg['mail_from'].split('@')[-1] or None)
    lines = ['Nome: ' + s['nome']]
    if s['quartiere']:
        lines.append('Quartiere: ' + s['quartiere'])
    lines += ['', 'Perché è una pepita:', s['perche'], '']
    if s['link']:
        lines.append('Link: ' + s['link'])
    if s['autore']:
        lines.append('Segnalata da: ' + s['autore'])
    lines.append('(inviata dall\'app, lingua %s%s)' % (s['lang'].upper(), ', IP ' + ip if ip else ''))
    msg.set_content('\n'.join(lines))
    return msg


def send_email(msg, cfg):
    if cfg['dry_run']:
        sys.stderr.write('[suggest_pepita] DRY RUN — not sent:\n%s\n' % msg.as_string())
        return
    context = ssl.create_default_context()
    if cfg['smtp_security'] == 'ssl':
        server = smtplib.SMTP_SSL(cfg['smtp_host'], cfg['smtp_port'], timeout=20, context=context)
    else:
        server = smtplib.SMTP(cfg['smtp_host'], cfg['smtp_port'], timeout=20)
    with server:
        if cfg['smtp_security'] == 'starttls':
            server.starttls(context=context)
        if cfg['smtp_user']:
            server.login(cfg['smtp_user'], cfg['smtp_password'])
        server.send_message(msg)


# ── WSGI app ────────────────────────────────────────────────────────────────────
def _json(start_response, status, payload, origin_headers):
    body = json.dumps(payload).encode('utf-8')
    start_response(status, [('Content-Type', 'application/json; charset=utf-8'),
                            ('Content-Length', str(len(body))),
                            ('Cache-Control', 'no-store')] + origin_headers)
    return [body]


def _client_ip(environ, cfg):
    if cfg['trust_proxy']:
        fwd = environ.get('HTTP_X_FORWARDED_FOR', '')
        if fwd:
            return fwd.split(',')[0].strip()
    return environ.get('REMOTE_ADDR', '')


def application(environ, start_response):
    cfg = load_config(environ)
    origin = (environ.get('HTTP_ORIGIN') or '').rstrip('/')
    allowed = origin in cfg['allowed_origins']
    cors = [('Access-Control-Allow-Origin', origin), ('Vary', 'Origin')] if allowed else [('Vary', 'Origin')]
    method = environ.get('REQUEST_METHOD', 'GET').upper()

    if method == 'OPTIONS':  # CORS preflight
        start_response('204 No Content', cors + [
            ('Access-Control-Allow-Methods', 'POST, OPTIONS'),
            ('Access-Control-Allow-Headers', 'Content-Type'),
            ('Access-Control-Max-Age', '86400')])
        return [b'']
    if method != 'POST':
        return _json(start_response, '405 Method Not Allowed', {'ok': False, 'error': 'method'}, cors)
    # Browsers always send Origin on a cross-site POST; refuse other sites (not a
    # security boundary — curl can fake it — just keeps other pages from using it)
    if origin and not allowed:
        return _json(start_response, '403 Forbidden', {'ok': False, 'error': 'origin'}, cors)
    if not cfg['mail_to'] or not cfg['mail_from'] or (not cfg['smtp_host'] and not cfg['dry_run']):
        sys.stderr.write('[suggest_pepita] not configured: set SMTP_HOST, MAIL_FROM and MAIL_TO\n')
        return _json(start_response, '503 Service Unavailable', {'ok': False, 'error': 'not_configured'}, cors)

    try:
        length = int(environ.get('CONTENT_LENGTH') or 0)
    except ValueError:
        length = 0
    if length <= 0 or length > MAX_BODY_BYTES:
        return _json(start_response, '413 Payload Too Large' if length > 0 else '400 Bad Request',
                     {'ok': False, 'error': 'size'}, cors)
    try:
        data = json.loads(environ['wsgi.input'].read(length).decode('utf-8'))
        submission = validate(data)
    except InvalidSubmission as e:
        code = str(e)
        if code in ('spam', 'too_fast'):
            # Pretend it worked: don't teach bots what tripped them
            return _json(start_response, '200 OK', {'ok': True}, cors)
        return _json(start_response, '400 Bad Request', {'ok': False, 'error': code}, cors)
    except (ValueError, UnicodeDecodeError):
        return _json(start_response, '400 Bad Request', {'ok': False, 'error': 'bad_request'}, cors)

    ip = _client_ip(environ, cfg)
    if rate_limited(ip or 'unknown', cfg['rate_file']):
        return _json(start_response, '429 Too Many Requests', {'ok': False, 'error': 'rate_limited'}, cors)

    try:
        send_email(build_email(submission, cfg, ip), cfg)
    except (smtplib.SMTPException, OSError) as e:
        sys.stderr.write('[suggest_pepita] send failed: %r\n' % (e,))
        return _json(start_response, '502 Bad Gateway', {'ok': False, 'error': 'send_failed'}, cors)
    return _json(start_response, '200 OK', {'ok': True}, cors)


if __name__ == '__main__':
    if 'GATEWAY_INTERFACE' in os.environ:
        from wsgiref.handlers import CGIHandler
        CGIHandler().run(application)
    else:
        from wsgiref.simple_server import make_server
        port = int(sys.argv[1]) if len(sys.argv) > 1 else 8001
        print('suggest_pepita listening on http://127.0.0.1:%d/' % port)
        make_server('127.0.0.1', port, application).serve_forever()
