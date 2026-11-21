# Backend — "Suggerisci una pepita"

`suggest_pepita.php` receives the "Suggerisci una pepita" form from the app and emails it
to the curator. One file, PHP 7.4+, core functions only — no Composer, no extensions to
enable.

```
app.js (openSuggestPepita)  ──POST JSON──▶  backend/suggest_pepita.php  ──mail() or SMTP──▶  your inbox
```

## 1. Configure

Copy `config.example.php` to `config.php` in this folder and fill it in. `config.php` is
in `.gitignore`: **never commit it** — with SMTP it holds a password.

Minimum (sends with PHP's `mail()`, which works out of the box on most shared hosting):

```php
<?php
return [
    'mail_to'   => 'you@example.com',        // where suggestions arrive
    'mail_from' => 'pepite@ilariavita.com',  // an address on your own domain
];
```

To send through an SMTP mailbox instead (Gmail, Aruba, OVH, …) also set `smtp_host`,
`smtp_port`, `smtp_security` (`starttls` on 587, `ssl` on 465), `smtp_user` and
`smtp_password` — for Gmail an *app password*, not the account password. All keys are
described in `config.example.php`.

Other ways to configure (they override `config.php`): a config file outside the web root
named by the `SUGGEST_CONFIG` environment variable, or environment variables
`MAIL_TO`, `MAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURITY`, `SMTP_USER`,
`SMTP_PASSWORD`, `ALLOWED_ORIGINS`, `TRUST_PROXY`, `SUGGEST_RATE_FILE`, `SUGGEST_DRY_RUN`.

## 2. Deploy

Upload the `backend/` folder with the rest of the app (so it ends up at
`https://ilariavita.com/map/backend/`), add your `config.php`, then in `app.js` set

```js
const SUGGEST_ENDPOINT = 'backend/suggest_pepita.php';
```

and bump `app.js?v=N` in `index.html`. While `SUGGEST_ENDPOINT` is empty the form and all
its buttons stay hidden.

`backend/.htaccess` (Apache 2.4) blocks direct access to `config.php`, the example, the
tests and this README. On nginx add an equivalent `deny` rule. Even without it,
requesting `config.php` only *runs* it, which prints nothing.

If the app and the script are on different domains, add the app's address to
`allowed_origins`.

## 3. Check it

```bash
# 28 checks, incl. a real SMTP exchange with a throwaway local server and mail()
php backend/tests/run_tests.php

# whole app + script locally, printing emails instead of sending them
SUGGEST_DRY_RUN=1 MAIL_TO=me@example.com MAIL_FROM=app@example.com \
  ALLOWED_ORIGINS=http://localhost:8000 php -S localhost:8000
# then temporarily set SUGGEST_ENDPOINT = 'backend/suggest_pepita.php' and open
# http://localhost:8000/
```

After deploying, send yourself a test suggestion from the live site. If it doesn't
arrive, check the server's PHP error log: failures are logged with `[suggest_pepita]`.

## What it protects against

- **Spam bots**: a hidden honeypot field and a minimum fill time (3 s); both answer "ok"
  without sending, so bots don't learn what tripped them.
- **Flooding**: 5 suggestions per IP per hour (`429`).
- **Header injection / oversized input**: every field is cleaned (control characters,
  line breaks in single-line fields) and length-capped; the body is limited to 16 KB;
  non-ASCII headers are MIME-encoded.
- **Other sites posting**: requests with a foreign `Origin` get `403` (browsers only —
  it is not authentication).

Responses are JSON: `{"ok": true}` or `{"ok": false, "error": "..."}` with `400`
(invalid), `403`, `405`, `413`, `429`, `502` (sending failed) or `503` (not configured).
