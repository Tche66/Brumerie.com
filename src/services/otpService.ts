// src/services/otpService.ts — OTP 100% via Netlify Function (sans Firestore)
// La Function gère : génération, stockage mémoire, envoi Brevo, vérification

const FUNCTION_URL = '/.netlify/functions/send-email';

// ── Demander l'envoi d'un OTP ──────────────────────────────────
// Retourne { success: true } ou { devCode: string } si Function non déployée
export async function sendOTPEmail(
  email: string, name: string
): Promise<{ success: boolean; devCode?: string; error?: string }> {
  try {
    const res = await fetch(FUNCTION_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'send_otp', email, name }),
    });

    const data = await res.json().catch(() => ({})) as any;

    if (res.status === 429) throw new Error(data.error || 'Trop de tentatives');
    if (res.ok && data.success) return { success: true };

    console.error('[OTP send] Brevo error:', data);
    throw new Error(data.error || `Erreur ${res.status}`);

  } catch (err: any) {
    // Function pas déployée (réseau/404) → mode dev
    if (err.message?.includes('Failed to fetch') || err.message?.includes('404')) {
      console.warn('[OTP DEV] Function non disponible');
      return { success: false, devCode: 'MODE_DEV' };
    }
    throw err;
  }
}

// ── Vérifier un code OTP ───────────────────────────────────────
export async function verifyOTPRemote(
  email: string, code: string
): Promise<'valid' | 'expired' | 'invalid'> {
  try {
    const res = await fetch(FUNCTION_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'verify_otp', email, code }),
    });
    const data = await res.json().catch(() => ({ result: 'invalid' })) as any;
    return data.result || 'invalid';
  } catch {
    // Réseau KO → invalide par défaut (sécurité)
    return 'invalid';
  }
}

// ── Email de bienvenue (non-bloquant) ─────────────────────────
export async function sendWelcomeEmail(email: string, name: string): Promise<void> {
  fetch(FUNCTION_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'welcome', email, name }),
  }).catch(console.warn);
}
