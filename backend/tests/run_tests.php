<?php
// Tests for suggest_pepita.php — run with:  php backend/tests/run_tests.php
// Plain PHP, no PHPUnit. Exits non-zero if anything fails.
declare(strict_types=1);
define('SUGGEST_PEPITA_LIB', true);
require __DIR__ . '/../suggest_pepita.php';

$failures = 0; $count = 0;
function check(string $name, bool $ok, string $extra = ''): void {
    global $failures, $count;
    $count++;
    if (!$ok) $failures++;
    echo ($ok ? 'PASS ' : 'FAIL ') . $name . ($extra !== '' && !$ok ? "  — $extra" : '') . "\n";
}

$tmp = sys_get_temp_dir() . '/suggest_test_' . bin2hex(random_bytes(4));
mkdir($tmp);
$cfg = [
    'smtp_host' => '', 'smtp_port' => 587, 'smtp_security' => 'none', 'smtp_user' => '', 'smtp_password' => '',
    'mail_from' => 'app@example.com', 'mail_to' => ['curatrice@example.com'],
    'allowed_origins' => ['https://ilariavita.com'], 'trust_proxy' => false, 'dry_run' => false,
    'rate_file' => "$tmp/rate.json",
];
$good = ['nome' => 'Bar Test', 'quartiere' => 'Isola', 'perche' => "Caffè ottimo.\nCortile nascosto.",
         'link' => 'instagram.com/bartest', 'autore' => '', 'lang' => 'it', 'website' => '', 'elapsed' => 8000];
$server = ['REQUEST_METHOD' => 'POST', 'HTTP_ORIGIN' => 'https://ilariavita.com', 'REMOTE_ADDR' => '1.2.3.4'];
$sent = [];
$capture = function (array $mail, array $cfg) use (&$sent) { $sent[] = $mail; };
$call = function (array $body, array $srv = [], array $c = []) use ($server, $cfg, $capture) {
    return suggest_handle(array_merge($server, $srv), json_encode($body), array_merge($cfg, $c), $capture);
};

// ── happy path ──
[$st, $h, $p] = $call($good);
check('valid submission → 200 ok', $st === 200 && $p === ['ok' => true]);
check('CORS header for allowed origin', ($h['Access-Control-Allow-Origin'] ?? '') === 'https://ilariavita.com');
check('email built', count($sent) === 1 && $sent[0]['subject'] === 'Nuova pepita: Bar Test'
    && strpos($sent[0]['text'], "Perché è una pepita:\nCaffè ottimo.\nCortile nascosto.") !== false
    && strpos($sent[0]['text'], 'Segnalata da') === false, json_encode($sent[0] ?? null));

// ── validation ──
[$st, , $p] = $call(array_merge($good, ['perche' => '   ']));
check('missing required → 400', $st === 400 && $p['error'] === 'missing_perche');
$n = count($sent);
[$st, , $p] = $call(array_merge($good, ['website' => 'http://spam']));
check('honeypot → fake ok, nothing sent', $st === 200 && $p['ok'] === true && count($sent) === $n);
[$st, , $p] = $call(array_merge($good, ['elapsed' => 500]));
check('too fast → fake ok, nothing sent', $st === 200 && count($sent) === $n);
[$s] = suggest_validate(array_merge($good, ['nome' => "Bar\r\nBcc: x@evil.com", 'perche' => str_repeat('è', 5000)]));
check('line breaks removed from single-line fields', strpos($s['nome'], "\n") === false && $s['nome'] === 'Bar Bcc: x@evil.com');
check('length capped in characters (UTF-8 safe)', preg_match_all('/./us', $s['perche']) === 1500);
[$st] = suggest_handle($server, '{nope', $cfg, $capture);
check('bad JSON → 400', $st === 400);
[$st] = suggest_handle($server, str_repeat('x', SUGGEST_MAX_BODY + 1), $cfg, $capture);
check('oversized body → 413', $st === 413);

// ── methods / origin / config ──
[$st, $h] = suggest_handle(array_merge($server, ['REQUEST_METHOD' => 'OPTIONS']), '', $cfg, $capture);
check('preflight → 204 with CORS', $st === 204 && ($h['Access-Control-Allow-Methods'] ?? '') === 'POST, OPTIONS');
[$st] = suggest_handle(array_merge($server, ['REQUEST_METHOD' => 'GET']), '', $cfg, $capture);
check('GET → 405', $st === 405);
[$st] = $call($good, ['HTTP_ORIGIN' => 'https://evil.example']);
check('foreign origin → 403', $st === 403);
[$st] = $call($good, [], ['mail_to' => []]);
check('not configured → 503', $st === 503);
[$st, , $p] = suggest_handle($server, json_encode($good), $cfg, function () { throw new RuntimeException('boom'); });
check('send failure → 502', $st === 502 && $p['error'] === 'send_failed');

// ── rate limit ──
@unlink($cfg['rate_file']);
$codes = [];
for ($i = 0; $i <= SUGGEST_RATE_MAX; $i++) { [$codes[]] = $call($good, ['REMOTE_ADDR' => '9.9.9.9']); }
check('6th submission in an hour → 429', end($codes) === 429 && $codes[0] === 200, json_encode($codes));
[$st] = $call($good, ['REMOTE_ADDR' => '8.8.8.8']);
check('other visitors unaffected', $st === 200);

// ── config loading ──
file_put_contents("$tmp/conf.php", "<?php return ['smtp_host' => 'smtp.example.com', 'smtp_security' => 'ssl', 'mail_to' => 'a@x.it, b@x.it', 'mail_from' => 'f@x.it'];");
putenv("SUGGEST_CONFIG=$tmp/conf.php");
putenv('MAIL_TO=env@x.it');
$c = suggest_load_config();
putenv('SUGGEST_CONFIG'); putenv('MAIL_TO');
check('config file read, ssl → port 465', $c['smtp_host'] === 'smtp.example.com' && $c['smtp_port'] === 465);
check('environment overrides the file', $c['mail_to'] === ['env@x.it']);

// ── real SMTP round trip against a throwaway local server ──
$port = 20000 + random_int(0, 20000);
$out = "$tmp/smtp.json";
$proc = proc_open([PHP_BINARY, __DIR__ . '/fake_smtp.php', (string) $port, $out], [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
fgets($pipes[1]); // "ready"
$smtpCfg = array_merge($cfg, ['smtp_host' => '127.0.0.1', 'smtp_port' => $port, 'smtp_security' => 'none',
                              'smtp_user' => 'user@x.it', 'smtp_password' => 'secret']);
$mail = suggest_build_email(array_merge(suggest_validate(array_merge($good, ['autore' => 'Ilaria']))[0]), $smtpCfg, '1.2.3.4');
$err = '';
try { suggest_send($mail, $smtpCfg); } catch (Throwable $e) { $err = $e->getMessage(); }
proc_close($proc);
$got = json_decode((string) @file_get_contents($out), true) ?: ['commands' => [], 'data' => ''];
check('SMTP send succeeds', $err === '', $err);
check('SMTP AUTH LOGIN with credentials', in_array(base64_encode('user@x.it'), $got['commands'], true)
    && in_array(base64_encode('secret'), $got['commands'], true));
check('SMTP envelope', in_array('MAIL FROM:<app@example.com>', $got['commands'], true)
    && in_array('RCPT TO:<curatrice@example.com>', $got['commands'], true));
[$head, $b64] = explode("\r\n\r\n", $got['data'], 2) + ['', ''];
$text = base64_decode(str_replace("\r\n", '', $b64));
check('subject header', strpos($head, 'Subject: Nuova pepita: Bar Test') !== false, $head);
check('body decodes to the text', strpos($text, "Perché è una pepita:\nCaffè ottimo.") !== false
    && strpos($text, 'Segnalata da: Ilaria') !== false, $text);
check('non-ASCII subject encoded', suggest_header_encode('Nuova pepita: Caffè') === '=?UTF-8?B?' . base64_encode('Nuova pepita: Caffè') . '?=');

// ── PHP mail() (the default when smtp_host is empty), with sendmail replaced by a file ──
$mailOut = "$tmp/sendmail.txt";
$script = "$tmp/mailtest.php";
file_put_contents($script, '<?php define("SUGGEST_PEPITA_LIB", true); require ' . var_export(realpath(__DIR__ . '/../suggest_pepita.php'), true) . ';'
    . '$c = ' . var_export($cfg, true) . '; suggest_send(suggest_build_email(' . var_export(suggest_validate($good)[0], true) . ', $c), $c); echo "sent";');
$res = shell_exec(escapeshellarg(PHP_BINARY) . ' -d ' . escapeshellarg('sendmail_path=cat > ' . $mailOut) . ' ' . escapeshellarg($script) . ' 2>&1');
$raw = (string) @file_get_contents($mailOut);
[$mh, $mb] = preg_split("/\r?\n\r?\n/", $raw, 2) + ['', ''];
check('mail() used when no smtp_host', trim((string) $res) === 'sent' && strpos($mh, 'To: curatrice@example.com') !== false
    && strpos($mh, 'From: Pepite per Tutti <app@example.com>') !== false, (string) $res . ' / ' . $mh);
check('mail() body decodes to the text', strpos(base64_decode(preg_replace('/\s+/', '', $mb)), 'Perché è una pepita:') !== false);

// ── SMTP server down ──
$downCfg = array_merge($smtpCfg, ['smtp_port' => 1]);
$err = '';
try { suggest_send($mail, $downCfg); } catch (Throwable $e) { $err = $e->getMessage(); }
check('unreachable SMTP throws (→ 502)', strpos($err, 'connect failed') === 0, $err);

array_map('unlink', glob("$tmp/*") ?: []);
@rmdir($tmp);
echo "\n$count checks, $failures failed\n";
exit($failures ? 1 : 0);
