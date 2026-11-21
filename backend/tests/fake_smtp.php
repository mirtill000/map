<?php
// Throwaway SMTP server for the tests: accepts one connection on the port given as
// argv[1] (no TLS, accepts any AUTH), writes the received message to argv[2], exits.
$server = stream_socket_server('tcp://127.0.0.1:' . $argv[1], $errno, $errstr);
if (!$server) { fwrite(STDERR, "listen failed: $errstr\n"); exit(1); }
echo "ready\n";
$c = stream_socket_accept($server, 20);
if (!$c) exit(1);
$w = function ($s) use ($c) { fwrite($c, $s . "\r\n"); };
$w('220 fake ESMTP');
$data = ''; $inData = false; $log = [];
while (($line = fgets($c)) !== false) {
    $line = rtrim($line, "\r\n");
    if ($inData) {
        if ($line === '.') { $inData = false; $w('250 queued'); continue; }
        $data .= (strpos($line, '..') === 0 ? substr($line, 1) : $line) . "\r\n";
        continue;
    }
    $log[] = $line;
    $verb = strtoupper(substr($line, 0, 4));
    if ($verb === 'EHLO') { $w('250-fake'); $w('250 AUTH LOGIN'); }
    elseif ($line === 'AUTH LOGIN') { $w('334 VXNlcm5hbWU6'); $step = 'user'; }
    elseif (isset($step) && $step === 'user') { $w('334 UGFzc3dvcmQ6'); $step = 'pass'; }
    elseif (isset($step) && $step === 'pass') { $w('235 ok'); $step = null; }
    elseif ($verb === 'DATA') { $inData = true; $w('354 go ahead'); }
    elseif ($verb === 'QUIT') { $w('221 bye'); break; }
    else $w('250 ok');
}
file_put_contents($argv[2], json_encode(['commands' => $log, 'data' => $data]));
