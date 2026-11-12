// Envoi des formulaires du site (rendez-vous et contact) — Cloudflare Pages Function : POST /api/demande
// 1. vérifie le captcha Turnstile côté serveur (impossible à contourner)
// 2. envoie la demande à Sylvain via Brevo (photos jointes, « Répondre » va directement au client)
// 3. envoie le mail de confirmation au client
// Variables Cloudflare Pages : BREVO_API_KEY, BREVO_SENDER_EMAIL, TURNSTILE_SECRET (+ DEST_EMAIL facultatif)
// Si quelque chose manque ou échoue, la fonction répond une erreur et le site repasse par FormSubmit.

const PRESTATIONS = {
  jardin: 'Jardinage et espaces verts',
  bricolage: 'Petit bricolage',
  nettoyage: 'Entretien des terrasses et allées',
  assistance: 'Assistance à domicile',
  autre: 'Autre besoin'
};
const LABELS = {
  nom: 'Nom', tel: 'Téléphone', email: 'Email', ville: 'Commune', prestation: 'Prestation',
  longueur_haie: 'Longueur de haie', hauteur_haie: 'Hauteur de haie', description: 'Description', message: 'Message'
};
const MAX_ATTACHMENT = 3.9 * 1024 * 1024;   // Brevo : moins de 4 Mo par pièce jointe
const MAX_TOTAL = 15 * 1024 * 1024;         // Brevo : 20 Mo par mail, on garde de la marge

const json = (data, status) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

async function brevo(env, payload) {
  return fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(payload)
  });
}

export async function onRequestPost({ request, env }) {
  if (!env.BREVO_API_KEY || !env.BREVO_SENDER_EMAIL || !env.TURNSTILE_SECRET) {
    return json({ ok: false, reason: 'non_configure' }, 503);
  }
  const origin = request.headers.get('Origin') || '';
  if (origin && new URL(origin).host !== new URL(request.url).host) return json({ ok: false }, 403);

  let form;
  try { form = await request.formData(); } catch (e) { return json({ ok: false }, 400); }

  // Champ piège : un robot l'a rempli, on fait comme si tout allait bien
  if (String(form.get('_honey') || '').trim() !== '') return json({ ok: true }, 200);

  // Captcha vérifié côté serveur
  const token = String(form.get('cf-turnstile-response') || '');
  if (!token) return json({ ok: false, reason: 'captcha' }, 403);
  const check = new FormData();
  check.append('secret', env.TURNSTILE_SECRET);
  check.append('response', token);
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) check.append('remoteip', ip);
  const verdict = await (await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: check })).json();
  if (!verdict.success) return json({ ok: false, reason: 'captcha' }, 403);

  const isContact = form.get('type') === 'contact';
  const email = String(form.get('email') || '').trim();
  const nom = String(form.get('nom') || '').trim().slice(0, 80);
  const ville = String(form.get('ville') || '').trim().slice(0, 80);
  const prestation = PRESTATIONS[form.get('prestation')] || '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254 || !nom) {
    return json({ ok: false, reason: 'champs' }, 400);
  }

  // ---------- 1. Le mail pour Sylvain ----------
  const rows = [];
  const attachments = [];
  let total = 0;
  const skipped = [];
  for (const [key, value] of form.entries()) {
    if (key.startsWith('_') || key === 'cf-turnstile-response' || key === 'type') continue;
    if (typeof value === 'object' && value && 'arrayBuffer' in value) {
      if (!value.size) continue;
      if (value.size > MAX_ATTACHMENT || total + value.size > MAX_TOTAL) { skipped.push(value.name); continue; }
      total += value.size;
      attachments.push({ name: value.name || ('photo-' + (attachments.length + 1) + '.jpg'), content: toBase64(await value.arrayBuffer()) });
      continue;
    }
    let text = String(value).trim();
    if (!text) continue;
    if (key === 'prestation') text = PRESTATIONS[text] || text;
    rows.push([LABELS[key] || key, text.slice(0, 2000)]);
  }
  const table = rows.map(([k, v]) =>
    `<tr><td style="padding:8px 12px;background:#e3f2f0;font-weight:bold;color:#032a28;vertical-align:top;white-space:nowrap">${escapeHtml(k)}</td><td style="padding:8px 12px;border-bottom:1px solid #dce8e6;color:#0f172a">${escapeHtml(v).replace(/\n/g, '<br>')}</td></tr>`).join('');
  const photosNote = attachments.length ? `<p style="margin:16px 0 0">Photos en pièce jointe : ${attachments.length}.</p>` : '';
  const skippedNote = skipped.length ? `<p style="margin:8px 0 0;color:#b45309">Photo(s) trop lourde(s), non jointe(s) : ${escapeHtml(skipped.join(', '))}. Demandez-les au client.</p>` : '';
  const titre = isContact ? 'Nouveau message de contact' : 'Nouvelle demande de rendez-vous';
  const pourSylvain = `<!doctype html><html lang="fr"><body style="margin:0;padding:20px;background:#f5f7f9;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5">
<div style="max-width:620px;margin:0 auto;background:#fff;border-radius:16px;padding:24px">
<h1 style="margin:0 0 6px;font-size:20px;color:#032a28">${titre}</h1>
<p style="margin:0 0 18px;color:#475569">Envoyé depuis le-bon-geste.fr. Pour répondre au client, cliquez simplement sur « Répondre ».</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border-radius:12px;overflow:hidden">${table}</table>
${photosNote}${skippedNote}
</div></body></html>`;
  const pourSylvainTexte = `${titre}\n\n` + rows.map(([k, v]) => `${k} : ${v}`).join('\n') + (attachments.length ? `\n\n${attachments.length} photo(s) en pièce jointe.` : '');

  const resSylvain = await brevo(env, {
    sender: { name: 'Site Le bon geste', email: env.BREVO_SENDER_EMAIL },
    to: [{ email: env.DEST_EMAIL || 'contact.lebongeste@gmail.com', name: 'Sylvain' }],
    replyTo: { email, name: nom },
    subject: `${titre} : ${nom}${ville ? ' (' + ville + ')' : ''}`,
    htmlContent: pourSylvain,
    textContent: pourSylvainTexte,
    attachment: attachments.length ? attachments : undefined,
    tags: [isContact ? 'message-contact' : 'demande-rendez-vous']
  });
  if (!resSylvain.ok) return json({ ok: false, reason: 'envoi' }, 502);

  // ---------- 2. La confirmation pour le client (un échec ici ne bloque rien) ----------
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

  try {
    await brevo(env, {
      sender: { name: 'Sylvain, Le bon geste', email: env.BREVO_SENDER_EMAIL },
      to: [{ email, name: nom || undefined }],
      replyTo: { email: env.DEST_EMAIL || 'contact.lebongeste@gmail.com', name: 'Sylvain, Le bon geste' },
      subject: isContact ? 'Bien reçu ! Je vous réponds sous 24 à 48 h' : 'Bien reçu ! Je vous rappelle sous 24 à 48 h',
      htmlContent: html,
      textContent: text,
      tags: [isContact ? 'confirmation-message' : 'confirmation-rendez-vous']
    });
  } catch (e) { /* la demande est déjà arrivée chez Sylvain */ }

  return json({ ok: true }, 200);
}

export const onRequest = () => json({ ok: false }, 405);
