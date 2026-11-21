<?php
/**
 * Pepite per Tutti — receives "Suggerisci una pepita" submissions and emails them.
 *
 * The web app (app.js, openSuggestPepita) POSTs the form as JSON here; this script
 * validates it and emails the curator. PHP 7.4+, core functions only — no Composer
 * packages or extra extensions.
 *
 * Sending: with no `smtp_host` configured it uses PHP's mail() (works out of the box on
 * most shared hosting); with `smtp_host` set it talks SMTP itself (STARTTLS / SSL / plain,
 * AUTH LOGIN), e.g. for Gmail or a mailbox on another provider.
 *
 * Configuration: see config.example.php and README.md. Settings are read, in order of
 * precedence, from environment variables, the file named by the SUGGEST_CONFIG
 * environment variable, and config.php next to this script.
 */

declare(strict_types=1);

const SUGGEST_MAX_BODY  = 16384;
const SUGGEST_MIN_FILL  = 3;      // seconds — anything faster is a bot
const SUGGEST_RATE_MAX  = 5;      // submissions …
const SUGGEST_RATE_WIN  = 3600;   // … per IP per hour
const SUGGEST_FIELDS = [          // name => [required, max length]
    'nome'      => [true,  120],
    'quartiere' => [false, 60],
    'perche'    => [true,  1500],
    'link'      => [false, 300],
    'autore'    => [false, 80],
];

// ── Configuration ────────────────────────────────────────────────────────────
function suggest_load_config(): array
{
    $cfg = [];
    $files = [__DIR__ . '/config.php'];
    if (getenv('SUGGEST_CONFIG')) array_unshift($files, (string) getenv('SUGGEST_CONFIG'));
    foreach (array_reverse($files) as $f) {             // SUGGEST_CONFIG wins over config.php
        if (is_file($f)) {
            $loaded = include $f;
            if (is_array($loaded)) $cfg = array_merge($cfg, $loaded);
        }
    }
    $env = [
        'smtp_host' => 'SMTP_HOST', 'smtp_port' => 'SMTP_PORT', 'smtp_security' => 'SMTP_SECURITY',
        'smtp_user' => 'SMTP_USER', 'smtp_password' => 'SMTP_PASSWORD', 'mail_from' => 'MAIL_FROM',
        'mail_to' => 'MAIL_TO', 'allowed_origins' => 'ALLOWED_ORIGINS', 'trust_proxy' => 'TRUST_PROXY',
        'dry_run' => 'SUGGEST_DRY_RUN', 'rate_file' => 'SUGGEST_RATE_FILE',
    ];
    foreach ($env as $key => $var) {
        $v = getenv($var);
        if ($v !== false && $v !== '') $cfg[$key] = $v;
    }
    $list = function ($v): array {
        $items = is_array($v) ? $v : explode(',', (string) $v);
        return array_values(array_filter(array_map('trim', $items), 'strlen'));
    };
    $bool = function ($v): bool { return in_array(strtolower((string) $v), ['1', 'true', 'yes', 'on'], true) || $v === true; };
    $security = strtolower((string) ($cfg['smtp_security'] ?? 'starttls'));
    return [
        'smtp_host'       => (string) ($cfg['smtp_host'] ?? ''),
        'smtp_port'       => (int) ($cfg['smtp_port'] ?? ($security === 'ssl' ? 465 : 587)),
        'smtp_security'   => $security,                       // starttls | ssl | none
        'smtp_user'       => (string) ($cfg['smtp_user'] ?? ''),
        'smtp_password'   => (string) ($cfg['smtp_password'] ?? ''),
        'mail_from'       => (string) (($cfg['mail_from'] ?? '') ?: ($cfg['smtp_user'] ?? '')),
        'mail_to'         => $list($cfg['mail_to'] ?? ''),
        'allowed_origins' => array_map(function ($o) { return rtrim($o, '/'); },
                                $list($cfg['allowed_origins'] ?? 'https://ilariavita.com,https://www.ilariavita.com')),
        'trust_proxy'     => $bool($cfg['trust_proxy'] ?? false),
        'dry_run'         => $bool($cfg['dry_run'] ?? false),
        'rate_file'       => (string) (($cfg['rate_file'] ?? '') ?: sys_get_temp_dir() . '/pepite_suggest_rate.json'),
    ];
}

// ── Validation ───────────────────────────────────────────────────────────────
function suggest_clean($value, int $max, bool $singleLine): string
{
    // Strings come from json_decode, which already rejects invalid UTF-8
    $value = is_scalar($value) ? (string) $value : '';
    $value = str_replace(["\r\n", "\r"], "\n", $value);
    $value = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $value) ?? '';
    $value = $singleLine
        ? (preg_replace('/\s+/u', ' ', $value) ?? '')
        : (preg_replace("/\n{3,}/", "\n\n", $value) ?? '');
    preg_match('/^.{0,' . $max . '}/us', trim($value), $m);   // cut at $max characters, not bytes
    return $m[0] ?? '';
}

/** Returns [cleaned submission, null] or [null, error code]. */
function suggest_validate($data): array
{
    if (!is_array($data)) return [null, 'bad_request'];
    if (trim((string) ($data['website'] ?? '')) !== '') return [null, 'spam'];   // honeypot
    $elapsed = is_numeric($data['elapsed'] ?? null) ? ((float) $data['elapsed']) / 1000 : 0;
    if ($elapsed < SUGGEST_MIN_FILL) return [null, 'too_fast'];
    $out = [];
    foreach (SUGGEST_FIELDS as $name => [$required, $max]) {
        $out[$name] = suggest_clean($data[$name] ?? '', $max, $name !== 'perche');
        if ($required && $out[$name] === '') return [null, 'missing_' . $name];
    }
    $lang = strtolower((string) ($data['lang'] ?? 'it'));
    $out['lang'] = in_array($lang, ['it', 'en'], true) ? $lang : 'it';
    return [$out, null];
}

// ── Rate limiting (per IP, file-based, locked) ───────────────────────────────
function suggest_rate_limited(string $ip, string $path, ?float $now = null): bool
{
    $now = $now ?? microtime(true);
    $fp = @fopen($path, 'c+');
    if (!$fp) return false;                 // never block a submission over a counter
    try {
        flock($fp, LOCK_EX);
        $hits = json_decode((string) stream_get_contents($fp), true);
        $hits = is_array($hits) ? $hits : [];
        foreach ($hits as $k => $times) {
            $hits[$k] = array_values(array_filter((array) $times, function ($t) use ($now) {
                return $now - (float) $t < SUGGEST_RATE_WIN;
            }));
            if (!$hits[$k]) unset($hits[$k]);
        }
        if (count($hits[$ip] ?? []) >= SUGGEST_RATE_MAX) return true;
        $hits[$ip][] = $now;
        ftruncate($fp, 0);
        rewind($fp);
        fwrite($fp, (string) json_encode($hits));
        return false;
    } finally {
        flock($fp, LOCK_UN);
        fclose($fp);
    }
}

// ── Email ────────────────────────────────────────────────────────────────────
function suggest_header_encode(string $s): string
{
    return preg_match('/[^\x20-\x7E]/', $s) ? '=?UTF-8?B?' . base64_encode($s) . '?=' : $s;
}

/** Returns ['subject' => …, 'text' => …, 'headers' => [name => value]]. */
function suggest_build_email(array $s, array $cfg, string $ip = ''): array
{
    $lines = ['Nome: ' . $s['nome']];
    if ($s['quartiere'] !== '') $lines[] = 'Quartiere: ' . $s['quartiere'];
    array_push($lines, '', 'Perché è una pepita:', $s['perche'], '');
    if ($s['link'] !== '') $lines[] = 'Link: ' . $s['link'];
    if ($s['autore'] !== '') $lines[] = 'Segnalata da: ' . $s['autore'];
    $lines[] = sprintf("(inviata dall'app, lingua %s%s)", strtoupper($s['lang']), $ip !== '' ? ', IP ' . $ip : '');
    $domain = substr(strrchr($cfg['mail_from'], '@') ?: '@localhost', 1);
    return [
        'subject' => 'Nuova pepita: ' . $s['nome'],
        'text'    => implode("\n", $lines),
        'headers' => [
            'From'                      => suggest_header_encode('Pepite per Tutti') . ' <' . $cfg['mail_from'] . '>',
            'Date'                      => date(DATE_RFC2822),
            'Message-ID'                => '<' . bin2hex(random_bytes(12)) . '@' . $domain . '>',
            'MIME-Version'              => '1.0',
            'Content-Type'              => 'text/plain; charset=UTF-8',
            'Content-Transfer-Encoding' => 'base64',
        ],
    ];
}

function suggest_send(array $mail, array $cfg): void
{
    $subject = suggest_header_encode($mail['subject']);
    $body    = rtrim(chunk_split(base64_encode($mail['text']), 76, "\r\n"));
    $to      = implode(', ', $cfg['mail_to']);
    if ($cfg['dry_run']) {
        error_log("[suggest_pepita] DRY RUN — not sent\nTo: $to\nSubject: {$mail['subject']}\n\n{$mail['text']}");
        return;
    }
    if ($cfg['smtp_host'] === '') {
        $headers = [];
        foreach ($mail['headers'] as $k => $v) {
            if ($k !== 'Date') $headers[] = "$k: $v";   // mail() adds Date itself
        }
        if (!mail($to, $subject, $body, implode("\r\n", $headers))) {
            throw new RuntimeException('mail() returned false');
        }
        return;
    }
    $data = "To: $to\r\nSubject: $subject\r\n";
    foreach ($mail['headers'] as $k => $v) $data .= "$k: $v\r\n";
    suggest_smtp($cfg, $data . "\r\n" . $body);
}

/** Minimal SMTP client: EHLO, STARTTLS/SSL, AUTH LOGIN, one message. Throws on failure. */
function suggest_smtp(array $cfg, string $data): void
{
    $ssl = $cfg['smtp_security'] === 'ssl';
    $fp = @stream_socket_client(($ssl ? 'ssl://' : 'tcp://') . $cfg['smtp_host'] . ':' . $cfg['smtp_port'],
        $errno, $errstr, 20, STREAM_CLIENT_CONNECT,
        stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true]]));
    if (!$fp) throw new RuntimeException("connect failed: $errstr ($errno)");
    stream_set_timeout($fp, 20);
    $expect = function (array $codes) use ($fp): string {
        $resp = '';
        while (($line = fgets($fp, 1024)) !== false) {
            $resp .= $line;
            if (strlen($line) < 4 || $line[3] !== '-') break;   // last line of a multi-line reply
        }
        if (!in_array((int) substr($resp, 0, 3), $codes, true)) {
            throw new RuntimeException('SMTP: ' . trim($resp));
        }
        return $resp;
    };
    $cmd = function (string $c, array $codes) use ($fp, $expect): string {
        fwrite($fp, $c . "\r\n");
        return $expect($codes);
    };
    try {
        $host = gethostname() ?: 'localhost';
        $expect([220]);
        $ehlo = $cmd("EHLO $host", [250]);
        if ($cfg['smtp_security'] === 'starttls') {
            $cmd('STARTTLS', [220]);
            if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                throw new RuntimeException('STARTTLS failed');
            }
            $ehlo = $cmd("EHLO $host", [250]);
        }
        if ($cfg['smtp_user'] !== '') {
            $cmd('AUTH LOGIN', [334]);
            $cmd(base64_encode($cfg['smtp_user']), [334]);
            $cmd(base64_encode($cfg['smtp_password']), [235]);
        }
        $cmd('MAIL FROM:<' . $cfg['mail_from'] . '>', [250]);
        foreach ($cfg['mail_to'] as $rcpt) $cmd("RCPT TO:<$rcpt>", [250, 251]);
        $cmd('DATA', [354]);
        $data = preg_replace('/^\./m', '..', str_replace(["\r\n", "\n"], ["\n", "\r\n"], $data));  // dot-stuffing
        $cmd($data . "\r\n.", [250]);
        $cmd('QUIT', [221]);
    } finally {
        fclose($fp);
    }
}

// ── Request handling ─────────────────────────────────────────────────────────
/**
 * Pure request → response function (testable without a web server).
 * Returns [HTTP status, headers [name => value], JSON payload array|null].
 */
function suggest_handle(array $server, string $rawBody, array $cfg, ?callable $send = null): array
{
    $send = $send ?? 'suggest_send';
    $origin  = rtrim((string) ($server['HTTP_ORIGIN'] ?? ''), '/');
    $allowed = $origin !== '' && in_array($origin, $cfg['allowed_origins'], true);
    $headers = ['Vary' => 'Origin'];
    if ($allowed) $headers['Access-Control-Allow-Origin'] = $origin;
    $method = strtoupper((string) ($server['REQUEST_METHOD'] ?? 'GET'));

    if ($method === 'OPTIONS') {
        return [204, $headers + [
            'Access-Control-Allow-Methods' => 'POST, OPTIONS',
            'Access-Control-Allow-Headers' => 'Content-Type',
            'Access-Control-Max-Age'       => '86400',
        ], null];
    }
    if ($method !== 'POST') return [405, $headers, ['ok' => false, 'error' => 'method']];
    // Browsers always send Origin on a POST from a page: refuse other sites (not
    // authentication — curl can fake it — it just keeps other pages from using this)
    if ($origin !== '' && !$allowed) return [403, $headers, ['ok' => false, 'error' => 'origin']];
    if (!$cfg['mail_to'] || $cfg['mail_from'] === '') {
        error_log('[suggest_pepita] not configured: set mail_to and mail_from (see config.example.php)');
        return [503, $headers, ['ok' => false, 'error' => 'not_configured']];
    }
    if ($rawBody === '') return [400, $headers, ['ok' => false, 'error' => 'size']];
    if (strlen($rawBody) > SUGGEST_MAX_BODY) return [413, $headers, ['ok' => false, 'error' => 'size']];

    [$submission, $error] = suggest_validate(json_decode($rawBody, true));
    if ($error === 'spam' || $error === 'too_fast') {
        return [200, $headers, ['ok' => true]];   // pretend it worked: don't teach bots
    }
    if ($error !== null) return [400, $headers, ['ok' => false, 'error' => $error]];

    $ip = (string) ($server['REMOTE_ADDR'] ?? '');
    if ($cfg['trust_proxy'] && !empty($server['HTTP_X_FORWARDED_FOR'])) {
        $ip = trim(explode(',', (string) $server['HTTP_X_FORWARDED_FOR'])[0]);
    }
    if (suggest_rate_limited($ip !== '' ? $ip : 'unknown', $cfg['rate_file'])) {
        return [429, $headers, ['ok' => false, 'error' => 'rate_limited']];
    }
    try {
        $send(suggest_build_email($submission, $cfg, $ip), $cfg);
    } catch (Throwable $e) {
        error_log('[suggest_pepita] send failed: ' . $e->getMessage());
        return [502, $headers, ['ok' => false, 'error' => 'send_failed']];
    }
    return [200, $headers, ['ok' => true]];
}

// Run as an endpoint unless included by the tests
if (!defined('SUGGEST_PEPITA_LIB')) {
    $raw = (string) file_get_contents('php://input', false, null, 0, SUGGEST_MAX_BODY + 1);
    [$status, $headers, $payload] = suggest_handle($_SERVER, $raw, suggest_load_config());
    http_response_code($status);
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    foreach ($headers as $k => $v) header("$k: $v");
    if ($payload !== null) {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($payload);
    }
}
