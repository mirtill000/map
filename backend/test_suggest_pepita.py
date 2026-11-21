"""Tests for suggest_pepita.py — run with:  python3 -m unittest discover backend"""

import io
import json
import os
import socketserver
import sys
import tempfile
import threading
import unittest
from email import message_from_bytes, policy

sys.path.insert(0, os.path.dirname(__file__))
import suggest_pepita as sp  # noqa: E402

ORIGIN = 'https://ilariavita.com'
GOOD = {'nome': 'Bar Test', 'quartiere': 'Isola', 'perche': 'Caffè ottimo.\nCortile nascosto.',
        'link': 'instagram.com/bartest', 'autore': '', 'lang': 'it', 'website': '', 'elapsed': 8000}


class FakeSMTPHandler(socketserver.StreamRequestHandler):
    """Just enough SMTP (no TLS, no auth) to receive one message."""
    def handle(self):
        w = lambda s: self.wfile.write((s + '\r\n').encode())
        w('220 fake ESMTP')
        data, in_data = [], False
        for raw in self.rfile:
            line = raw.decode('utf-8', 'replace').rstrip('\r\n')
            if in_data:
                if line == '.':
                    self.server.messages.append('\r\n'.join(data).encode())
                    in_data, data = False, []
                    w('250 queued')
                else:
                    data.append(line[1:] if line.startswith('..') else line)
                continue
            cmd = line[:4].upper()
            if cmd == 'EHLO':
                w('250-fake'); w('250 8BITMIME')
            elif cmd == 'DATA':
                in_data = True; w('354 go ahead')
            elif cmd == 'QUIT':
                w('221 bye'); break
            else:
                w('250 ok')


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.env = {'MAIL_TO': 'curatrice@example.com', 'MAIL_FROM': 'app@example.com',
                    'SUGGEST_RATE_FILE': os.path.join(self.tmp, 'rate.json'),
                    'SUGGEST_DRY_RUN': '1'}
        self._saved = {k: os.environ.get(k) for k in list(self.env) + ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURITY']}
        for k in self._saved:
            os.environ.pop(k, None)
        os.environ.update(self.env)
        self._stderr, sys.stderr = sys.stderr, io.StringIO()  # dry-run / failure logs

    def tearDown(self):
        sys.stderr = self._stderr
        for k, v in self._saved.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v

    def call(self, method='POST', body=None, origin=ORIGIN, ip='1.2.3.4', raw=None):
        payload = raw if raw is not None else json.dumps(body if body is not None else GOOD).encode()
        environ = {'REQUEST_METHOD': method, 'CONTENT_LENGTH': str(len(payload)),
                   'wsgi.input': io.BytesIO(payload), 'REMOTE_ADDR': ip}
        if origin:
            environ['HTTP_ORIGIN'] = origin
        result = {}
        def start_response(status, headers):
            result['status'], result['headers'] = status, dict(headers)
        out = b''.join(sp.application(environ, start_response))
        result['json'] = json.loads(out) if out else None
        return result


class ValidationTests(Base):
    def test_ok(self):
        r = self.call()
        self.assertEqual(r['status'], '200 OK')
        self.assertEqual(r['json'], {'ok': True})
        self.assertEqual(r['headers']['Access-Control-Allow-Origin'], ORIGIN)

    def test_missing_required(self):
        r = self.call(body=dict(GOOD, perche='   '))
        self.assertEqual(r['status'], '400 Bad Request')
        self.assertEqual(r['json']['error'], 'missing_perche')

    def test_honeypot_and_too_fast_look_successful(self):
        self.assertEqual(self.call(body=dict(GOOD, website='http://spam'))['json'], {'ok': True})
        self.assertEqual(self.call(body=dict(GOOD, elapsed=500))['json'], {'ok': True})

    def test_header_injection_and_lengths(self):
        s = sp.validate(dict(GOOD, nome='Bar\r\nBcc: x@evil.com', perche='a' * 5000))
        self.assertNotIn('\n', s['nome'])
        self.assertEqual(len(s['perche']), 1500)
        msg = sp.build_email(s, sp.load_config())
        self.assertEqual(msg['Subject'], 'Nuova pepita: Bar Bcc: x@evil.com')
        self.assertIsNone(msg['Bcc'])

    def test_bad_json_and_size(self):
        self.assertEqual(self.call(raw=b'{nope')['status'], '400 Bad Request')
        self.assertEqual(self.call(raw=b'x' * (sp.MAX_BODY_BYTES + 1))['status'], '413 Payload Too Large')

    def test_methods_and_cors(self):
        pre = self.call(method='OPTIONS', raw=b'')
        self.assertEqual(pre['status'], '204 No Content')
        self.assertEqual(pre['headers']['Access-Control-Allow-Origin'], ORIGIN)
        self.assertEqual(self.call(method='GET')['status'], '405 Method Not Allowed')
        self.assertEqual(self.call(origin='https://evil.example')['status'], '403 Forbidden')

    def test_not_configured(self):
        os.environ.pop('MAIL_TO')
        self.assertEqual(self.call()['status'], '503 Service Unavailable')

    def test_rate_limit(self):
        statuses = [self.call()['status'] for _ in range(sp.RATE_LIMIT + 1)]
        self.assertEqual(statuses[-1], '429 Too Many Requests')
        self.assertEqual(self.call(ip='5.6.7.8')['status'], '200 OK')  # other visitors unaffected

    def test_config_file(self):
        path = os.path.join(self.tmp, 'conf.ini')
        with open(path, 'w') as f:
            f.write('[suggest]\nsmtp_host = smtp.example.com\nsmtp_security = ssl\nmail_to = a@x.it, b@x.it\n')
        os.environ['SUGGEST_CONFIG'] = path
        try:
            cfg = sp.load_config()
        finally:
            os.environ.pop('SUGGEST_CONFIG')
        self.assertEqual(cfg['smtp_port'], 465)
        self.assertEqual(cfg['mail_to'], ['curatrice@example.com'])  # env wins over file


class SMTPRoundTrip(Base):
    def test_sends_real_smtp(self):
        server = socketserver.ThreadingTCPServer(('127.0.0.1', 0), FakeSMTPHandler)
        server.messages = []
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            os.environ.pop('SUGGEST_DRY_RUN')
            os.environ.update({'SMTP_HOST': '127.0.0.1', 'SMTP_PORT': str(server.server_address[1]),
                               'SMTP_SECURITY': 'none'})
            r = self.call(body=dict(GOOD, autore='Ilaria'))
            self.assertEqual(r['json'], {'ok': True})
            self.assertEqual(len(server.messages), 1)
            msg = message_from_bytes(server.messages[0], policy=policy.default)
            self.assertEqual(msg['Subject'], 'Nuova pepita: Bar Test')
            self.assertEqual(msg['To'], 'curatrice@example.com')
            text = msg.get_content().replace('\r\n', '\n')
            self.assertIn('Perché è una pepita:\nCaffè ottimo.\nCortile nascosto.', text)
            self.assertIn('Segnalata da: Ilaria', text)
        finally:
            server.shutdown()
            server.server_close()

    def test_smtp_down(self):
        os.environ.pop('SUGGEST_DRY_RUN')
        os.environ.update({'SMTP_HOST': '127.0.0.1', 'SMTP_PORT': '1', 'SMTP_SECURITY': 'none'})
        self.assertEqual(self.call()['json'], {'ok': False, 'error': 'send_failed'})


if __name__ == '__main__':
    unittest.main()
