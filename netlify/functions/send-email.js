// netlify/functions/send-email.js
// Gère TOUT l'OTP : génération, stockage en mémoire, envoi Brevo, vérification
// Aucune dépendance Firestore = aucun problème de règles Firebase

// Stockage OTP en mémoire (durée de vie de la Function instance ~15min)
const otpStore = new Map();

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function cleanExpired() {
  const now = Date.now();
  for (const [key, val] of otpStore.entries()) {
    if (val.expires < now) otpStore.delete(key);
  }
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON invalide' }) }; }

  const { action } = body;

  // ── ACTION : send_otp ─────────────────────────────────────────
  if (action === 'send_otp') {
    const { email, name } = body;
    if (!email || !name) return { statusCode: 400, headers, body: JSON.stringify({ error: 'email et name requis' }) };

    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) {
      console.error('[OTP] BREVO_API_KEY manquante dans les variables Netlify');
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Configuration serveur manquante. Contacte le support.' }) };
    }

    cleanExpired();

    // Anti-spam : max 3 envois par email en 10 min
    const existing = otpStore.get(email.toLowerCase());
    if (existing && existing.sendCount >= 3 && existing.expires > Date.now()) {
      return { statusCode: 429, headers, body: JSON.stringify({ error: 'Trop de tentatives. Attends 10 minutes.' }) };
    }

    const code    = generateOTP();
    const expires = Date.now() + 10 * 60 * 1000;
    otpStore.set(email.toLowerCase(), {
      code,
      expires,
      attempts:  0,
      sendCount: (existing?.sendCount || 0) + 1,
    });

    const htmlContent = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Code de vérification Brumerie</title>
</head>
<body style="margin:0;padding:0;background-color:#f0fdf4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;padding:32px 16px">
    <tr><td align="center">
    <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:28px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.10)">
      <tr><td style="background:linear-gradient(150deg,#16A34A 0%,#0f5c2e 100%);padding:40px 32px;text-align:center">
        <div style="display:inline-block;background:rgba(255,255,255,0.18);border-radius:20px;padding:16px 28px;margin-bottom:18px">
          <span style="font-size:28px;font-weight:900;color:#ffffff;letter-spacing:-1px;font-family:Georgia,serif">
            🛍 Brumerie
          </span>
        </div>
        <p style="color:rgba(255,255,255,0.75);font-size:11px;margin:0;text-transform:uppercase;letter-spacing:3px;font-weight:600">
          Vérification Email
        </p>
      </td></tr>
      <tr><td style="padding:40px 32px 32px">
        <h2 style="color:#0f172a;font-size:22px;font-weight:900;margin:0 0 10px;line-height:1.2">
          Bienvenue, ${name} 👋
        </h2>
        <p style="color:#64748b;font-size:14px;line-height:1.65;margin:0 0 30px">
          Ton inscription sur Brumerie est presque terminée !<br>
          Copie ce code dans l'application pour confirmer ton email.
        </p>
        <div style="background:#f8fafc;border:2px dashed #d1fae5;border-radius:20px;padding:30px 24px;text-align:center;margin:0 0 24px">
          <p style="font-size:13px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:3px;margin:0 0 14px">
            Ton code de vérification
          </p>
          <div style="background:#0f172a;border-radius:16px;padding:18px 24px;display:inline-block;margin:0 0 12px">
            <span style="font-size:52px;font-weight:900;letter-spacing:0.5em;color:#ffffff;font-family:'Courier New',monospace">
              ${code}
            </span>
          </div>
          <p style="color:#94a3b8;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:2px;margin:0">
            ⏱&nbsp; Expire dans 10 minutes
          </p>
        </div>
        <div style="background:#fef2f2;border-left:4px solid #fca5a5;border-radius:0 12px 12px 0;padding:12px 16px;margin:0 0 24px">
          <p style="color:#991b1b;font-size:12px;font-weight:700;margin:0">
            🔐 &nbsp;Ne partage jamais ce code. Brumerie ne te le demandera jamais par téléphone.
          </p>
        </div>
        <p style="color:#94a3b8;font-size:12px;text-align:center;margin:0">
          Si tu n'es pas à l'origine de cette inscription, ignore ce message.
        </p>
      </td></tr>
      <tr><td style="background:#f8fafc;padding:20px 32px;text-align:center;border-top:2px solid #f0fdf4">
        <p style="color:#94a3b8;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;margin:0 0 8px">
          Brumerie &bull; Le commerce de quartier &bull; Abidjan 🇨🇮
        </p>
        <p style="color:#cbd5e1;font-size:10px;margin:0">
          📬 &nbsp;Email introuvable ? Vérifie ton dossier <strong>Spam</strong> ou <strong>Courrier indésirable</strong>
        </p>
      </td></tr>
    </table>
    </td></tr>
  </table>
</body>
</html>`;

    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method:  'POST',
        headers: {
          'accept':       'application/json',
          'api-key':      apiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sender:      { name: "Brumerie côte d'ivoire", email: 'contact.brumerie@gmail.com' },
          to:          [{ email, name }],
          subject:     `${code} — Ton code de vérification Brumerie`,
          htmlContent,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // ── Diagnostic détaillé de l'erreur Brevo ──────────────
        const brevoError = data.message || data.error || JSON.stringify(data);
        console.error(`[OTP] Brevo a refusé l'envoi vers ${email}`);
        console.error(`[OTP] Status: ${res.status} | Erreur: ${brevoError}`);
        console.error(`[OTP] Sender: ${process.env.BREVO_SENDER_EMAIL || 'non configuré'}`);
        console.error(`[OTP] Clé API (premiers chars): ${apiKey.substring(0, 12)}...`);

        // Diagnostic de la cause probable
        let hint = '';
        if (res.status === 401) hint = 'Clé API Brevo invalide ou révoquée';
        if (res.status === 400 && brevoError.includes('sender')) hint = 'Email sender non vérifié dans Brevo';
        if (res.status === 403) hint = 'Compte Brevo suspendu ou quota dépassé';
        console.error(`[OTP] Cause probable: ${hint || 'Voir détail ci-dessus'}`);

        return {
          statusCode: 502,
          headers,
          body: JSON.stringify({
            error: 'Erreur envoi email',
            detail: brevoError,
            hint,
            status: res.status,
          }),
        };
      }

      console.log(`[OTP] ✅ Code envoyé à ${email} — messageId: ${data.messageId}`);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };

    } catch (err) {
      console.error('[OTP] Erreur réseau Brevo:', err.message);
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Erreur réseau lors de l\'envoi' }) };
    }
  }

  // ── ACTION : verify_otp ───────────────────────────────────────
  if (action === 'verify_otp') {
    const { email, code } = body;
    if (!email || !code) return { statusCode: 400, headers, body: JSON.stringify({ error: 'email et code requis' }) };

    const entry = otpStore.get(email.toLowerCase());

    if (!entry) return { statusCode: 200, headers, body: JSON.stringify({ result: 'invalid' }) };
    if (entry.expires < Date.now()) {
      otpStore.delete(email.toLowerCase());
      return { statusCode: 200, headers, body: JSON.stringify({ result: 'expired' }) };
    }

    entry.attempts = (entry.attempts || 0) + 1;
    if (entry.attempts > 5) {
      otpStore.delete(email.toLowerCase());
      return { statusCode: 200, headers, body: JSON.stringify({ result: 'invalid', reason: 'too_many_attempts' }) };
    }

    if (entry.code !== code.trim()) return { statusCode: 200, headers, body: JSON.stringify({ result: 'invalid' }) };

    otpStore.delete(email.toLowerCase());
    return { statusCode: 200, headers, body: JSON.stringify({ result: 'valid' }) };
  }

  // ── ACTION : welcome ──────────────────────────────────────────
  if (action === 'welcome') {
    const { email, name } = body;
    if (!email || !process.env.BREVO_API_KEY) return { statusCode: 200, headers, body: JSON.stringify({ skipped: true }) };

    const htmlWelcome = `
<!DOCTYPE html><html lang="fr"><body style="margin:0;padding:0;background:#f8fafc;font-family:sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px">
<tr><td align="center"><table width="100%" style="max-width:480px;background:#fff;border-radius:24px;overflow:hidden">
<tr><td style="background:linear-gradient(135deg,#16A34A,#115E2E);padding:40px;text-align:center">
  <h1 style="color:#fff;font-size:26px;font-weight:900;margin:0">🎉 Bienvenue sur Brumerie !</h1>
</td></tr>
<tr><td style="padding:40px">
  <p style="color:#0f172a;font-size:16px;font-weight:700;margin:0 0 12px">Salut ${name || ''} 👋</p>
  <p style="color:#64748b;font-size:14px;line-height:1.6;margin:0 0 24px">
    Ton compte est créé et vérifié. Explore les articles près de chez toi, achète, vends et rejoins la communauté Brumerie d'Abidjan !
  </p>
  <a href="https://brumerie.netlify.app" style="display:inline-block;background:linear-gradient(135deg,#115E2E,#16A34A);color:#fff;font-weight:900;font-size:13px;text-transform:uppercase;letter-spacing:1px;padding:16px 32px;border-radius:16px;text-decoration:none">
    Ouvrir Brumerie →
  </a>
</td></tr>
<tr><td style="padding:20px;text-align:center;background:#f8fafc;border-top:1px solid #f1f5f9">
  <p style="color:#cbd5e1;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:2px;margin:0">Brumerie · Abidjan 🇨🇮</p>
</td></tr>
</table></td></tr></table>
</body></html>`;

    fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'accept': 'application/json', 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({
        sender: { name: "Brumerie côte d'ivoire", email: 'contact.brumerie@gmail.com' },
        to: [{ email, name: name || email }],
        subject: `Bienvenue sur Brumerie, ${name || ''} 🎉`,
        htmlContent: htmlWelcome,
      }),
    }).catch(console.warn);

    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
  }

  return { statusCode: 400, headers, body: JSON.stringify({ error: `Action inconnue: ${action}` }) };
};
