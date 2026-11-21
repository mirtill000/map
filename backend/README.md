# Backend — "Suggerisci una pepita"

`suggest_pepita.py` receives the "Suggerisci una pepita" form from the app and emails it
to the curator over SMTP. One file, Python 3.8+ standard library only — nothing to
`pip install`.

```
app.js (openSuggestPepita)  ──POST JSON──▶  suggest_pepita.py  ──SMTP──▶  your inbox
```

## 1. Configure

All settings are environment variables (or an INI file, see below). **Never commit the
SMTP password**, and never put a config file inside the web root.

| Variable | Required | Example | Notes |
|---|---|---|---|
| `SMTP_HOST` | yes | `smtp.gmail.com` | your mail provider's SMTP server |
| `SMTP_PORT` | no | `587` | default 587 (`starttls`) or 465 (`ssl`) |
| `SMTP_SECURITY` | no | `starttls` | `starttls` (default), `ssl` or `none` |
| `SMTP_USER` | usually | `pepite@example.com` | SMTP login |
| `SMTP_PASSWORD` | usually | — | for Gmail, an *app password*, not the account password |
| `MAIL_FROM` | no | `pepite@example.com` | sender address; defaults to `SMTP_USER` |
| `MAIL_TO` | yes | `ilaria@example.com` | where suggestions arrive; comma-separate several |
| `ALLOWED_ORIGINS` | no | `https://ilariavita.com,https://www.ilariavita.com` | sites allowed to post (this is the default) |
| `TRUST_PROXY` | no | `1` | read the visitor IP from `X-Forwarded-For` (only behind a proxy you control) |
| `SUGGEST_RATE_FILE` | no | `/home/me/tmp/rate.json` | per-IP counter; defaults to the system temp dir |
| `SUGGEST_DRY_RUN` | no | `1` | log the email instead of sending it (for testing) |

Alternatively set only `SUGGEST_CONFIG=/path/outside/webroot/suggest_pepita.ini`:

```ini
[suggest]
smtp_host = smtp.example.com
smtp_user = pepite@example.com
smtp_password = ...
mail_to = ilaria@example.com
```

Environment variables win over the file.

## 2. Deploy (pick what your hosting offers)

**cPanel "Setup Python App" (Passenger)** — create an app whose *Application URL* is e.g.
`/map/api/suggest`, upload `suggest_pepita.py` to the app root, set *Application startup
file* to `suggest_pepita.py` and *Entry point* to `application`, add the variables above
in the panel, restart.

**CGI** (Apache with `mod_cgi`) — upload to a `cgi-bin` (or a folder with
`Options +ExecCGI` / `AddHandler cgi-script .py`), `chmod 755 suggest_pepita.py`, and set
the variables with `SetEnv` in that folder's `.htaccess` (or use `SUGGEST_CONFIG`).

**Any WSGI server** — `gunicorn suggest_pepita:application`, uWSGI, mod_wsgi …

Then point the app at it: in `app.js` set

```js
const SUGGEST_ENDPOINT = '/map/api/suggest';   // the script's URL
```

and bump `app.js?v=N` in `index.html`. While `SUGGEST_ENDPOINT` is empty the form and
all its buttons stay hidden.

If the script lives on a different domain from the app, add the app's origin to
`ALLOWED_ORIGINS`.

## 3. Check it

```bash
# unit + SMTP round-trip tests
python3 -m unittest discover backend

# local server that prints emails instead of sending them
SUGGEST_DRY_RUN=1 MAIL_TO=me@example.com MAIL_FROM=app@example.com \
  ALLOWED_ORIGINS=http://localhost:8000 python3 backend/suggest_pepita.py 8001
```

## What it protects against

- **Spam bots**: a hidden honeypot field and a minimum fill time (3 s); both answer "ok"
  without sending, so bots don't learn what tripped them.
- **Flooding**: 5 suggestions per IP per hour (`429`).
- **Header injection / oversized input**: every field is cleaned (control characters,
  line breaks in single-line fields) and length-capped; the body is limited to 16 KB.
- **Other sites posting**: requests with a foreign `Origin` get `403` (browsers only —
  it is not authentication).

Responses are JSON: `{"ok": true}` or `{"ok": false, "error": "..."}` with `400`
(invalid), `403`, `405`, `413`, `429`, `502` (SMTP failed) or `503` (not configured).
