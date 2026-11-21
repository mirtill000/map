<?php
// Copy to config.php (same folder) and fill in — config.php is in .gitignore and must
// never be committed. Or put it outside the web root and point the SUGGEST_CONFIG
// environment variable at it. Environment variables (SMTP_HOST, MAIL_TO, …) override
// anything set here.
return [
    // Where suggestions arrive (several: 'a@x.it, b@x.it')
    'mail_to'   => 'ilaria@example.com',
    // Sender — use an address on your own domain, or mail providers may flag it as spam
    'mail_from' => 'pepite@ilariavita.com',

    // Leave smtp_host empty to send with PHP's mail() (fine on most shared hosting).
    // Fill it to send through an SMTP mailbox instead, e.g. Gmail:
    //   smtp.gmail.com, port 587, starttls, your address, an *app password*
    'smtp_host'     => '',
    'smtp_port'     => 587,
    'smtp_security' => 'starttls',   // starttls | ssl (port 465) | none
    'smtp_user'     => '',
    'smtp_password' => '',

    // Sites allowed to post the form (the app's own address)
    'allowed_origins' => 'https://ilariavita.com, https://www.ilariavita.com',

    // Optional
    // 'trust_proxy' => true,                        // read the IP from X-Forwarded-For
    // 'rate_file'   => '/home/USER/tmp/suggest_rate.json',
    // 'dry_run'     => true,                        // log instead of sending (testing)
];
