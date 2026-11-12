// Mail de confirmation envoyé au client après une demande de rendez-vous.
// Cloudflare Pages Function : POST /api/confirmation
// Variables à définir dans Cloudflare Pages (Paramètres > Variables et secrets) :
//   BREVO_API_KEY        clé API Brevo (secret)
//   BREVO_SENDER_EMAIL   adresse d'expéditeur validée dans Brevo
//   TURNSTILE_SECRET     clé secrète du widget Turnstile (secret)
// Tant qu'une de ces variables manque, la fonction ne fait rien : le formulaire marche comme avant.

const PRESTATIONS = {
  jardin: 'Jardinage et espaces verts',
  bricolage: 'Petit bricolage',
  nettoyage: 'Entretien des terrasses et allées',
  assistance: 'Assistance à domicile',
  autre: 'Autre besoin'
};

const json = (data, status) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function onRequestPost({ request, env }) {
  if (!env.BREVO_API_KEY || !env.BREVO_SENDER_EMAIL || !env.TURNSTILE_SECRET) {
    return json({ ok: false, reason: 'non_configure' }, 503);
  }

  // Uniquement depuis le site lui-même
  const origin = request.headers.get('Origin') || '';
  const host = new URL(request.url).host;
  if (origin && new URL(origin).host !== host) return json({ ok: false }, 403);

  let body;
  try { body = await request.json(); } catch (e) { return json({ ok: false }, 400); }

  const email = String(body.email || '').trim();
  const nom = String(body.nom || '').trim().slice(0, 80);
  const ville = String(body.ville || '').trim().slice(0, 80);
  const prestation = PRESTATIONS[body.prestation] || '';
  const token = String(body.token || '');
  const isContact = body.type === 'contact';

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254 || !token) {
    return json({ ok: false }, 400);
  }

  // Vérification du captcha Turnstile
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET);
  form.append('response', token);
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) form.append('remoteip', ip);
  const check = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  const verdict = await check.json();
  if (!verdict.success) return json({ ok: false }, 403);

  const bonjour = nom ? `Bonjour ${escapeHtml(nom)},` : 'Bonjour,';
  const details = [
    prestation ? `<strong>Prestation :</strong> ${escapeHtml(prestation)}` : '',
    ville ? `<strong>Commune :</strong> ${escapeHtml(ville)}` : ''
  ].filter(Boolean).join('<br>');

  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#f5f7f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7f9;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:24px;overflow:hidden">
<tr><td style="padding:28px 28px 8px"><img src="https://le-bon-geste.fr/assets/img/email-logo.png" width="170" alt="Le bon geste" style="display:block;border:0"></td></tr>
<tr><td style="padding:8px 28px 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td valign="top" style="font-size:16px;line-height:1.6;color:#0f172a">
<p style="margin:0 0 14px">${bonjour}</p>
<p style="margin:0 0 14px">${isContact ? 'Votre message est bien arrivé. Je le lis et je vous réponds <strong>sous 24 à 48 h</strong>.' : 'Votre demande de rendez-vous est bien arrivée. Je la regarde et je vous rappelle <strong>sous 24 à 48 h</strong> pour en parler et prévoir mon passage pour le devis, qui est gratuit.'}</p>
</td>
<td width="110" valign="bottom" align="right"><img src="https://le-bon-geste.fr/assets/img/email-sylvain.png" width="100" alt="" style="display:block;border:0"></td>
</tr></table></td></tr>
${details ? `<tr><td style="padding:6px 28px 0"><div style="background:#e3f2f0;border-radius:16px;padding:14px 18px;font-size:14px;line-height:1.7;color:#0f172a">${details}</div></td></tr>` : ''}
<tr><td style="padding:18px 28px 0;font-size:15px;line-height:1.6;color:#475569">
<p style="margin:0 0 14px">Besoin de me parler avant ? Appelez-moi au <a href="tel:+33610669435" style="color:#007271;font-weight:bold;text-decoration:none">06 10 66 94 35</a>, ou répondez simplement à ce mail.</p>
<p style="margin:0 0 14px">Pour rappel, la facture passe par la coopérative Unipros : vous ne réglez que la moitié du montant.</p>
<p style="margin:0 0 24px;color:#0f172a">À très vite,<br><strong>Sylvain, Le bon geste</strong></p>
</td></tr>
<tr><td style="background:#032a28;padding:18px 28px;font-size:12px;line-height:1.6;color:#9fd3cd">Ce mail automatique fait suite à votre demande sur <a href="https://le-bon-geste.fr/" style="color:#ffffff">le-bon-geste.fr</a>. Jardinage et petits travaux à Mazamet, Aiguefonde et communes voisines.</td></tr>
</table></td></tr></table></body></html>`;

  const text = `${nom ? 'Bonjour ' + nom + ',' : 'Bonjour,'}

${isContact ? 'Votre message est bien arrivé. Je le lis et je vous réponds sous 24 à 48 h.' : 'Votre demande de rendez-vous est bien arrivée. Je la regarde et je vous rappelle sous 24 à 48 h pour en parler et prévoir mon passage pour le devis, qui est gratuit.'}
${prestation ? '\nPrestation : ' + prestation : ''}${ville ? '\nCommune : ' + ville : ''}

Besoin de me parler avant ? Appelez-moi au 06 10 66 94 35, ou répondez simplement à ce mail.

Pour rappel, la facture passe par la coopérative Unipros : vous ne réglez que la moitié du montant.

À très vite,
Sylvain, Le bon geste
https://le-bon-geste.fr/`;

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: 'Sylvain, Le bon geste', email: env.BREVO_SENDER_EMAIL },
      to: [{ email, name: nom || undefined }],
      replyTo: { email: 'contact.lebongeste@gmail.com', name: 'Sylvain, Le bon geste' },
      subject: isContact ? 'Bien reçu ! Je vous réponds sous 24 à 48 h' : 'Bien reçu ! Je vous rappelle sous 24 à 48 h',
      htmlContent: html,
      textContent: text,
      tags: [isContact ? 'confirmation-message' : 'confirmation-rendez-vous']
    })
  });

  return json({ ok: res.ok }, res.ok ? 200 : 502);
}

export const onRequest = () => json({ ok: false }, 405);
