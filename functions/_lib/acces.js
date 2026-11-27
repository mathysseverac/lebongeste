// Vérifie que la requête vient bien d'une personne connectée par Cloudflare Access.
// Cloudflare Access protège /admin et /api/admin : il ajoute un jeton signé (JWT)
// dans l'en-tête « Cf-Access-Jwt-Assertion ». On vérifie ici sa signature, son
// audience et sa date, pour qu'un faux en-tête ne suffise jamais.
//
// Variables à mettre dans Cloudflare Pages :
//   ACCESS_TEAM_DOMAIN  ex. lebongeste.cloudflareaccess.com
//   ACCESS_AUD          « Application Audience (AUD) Tag » de l'application Access
// Sans elles, l'espace admin reste fermé (réponse 503).
// En local uniquement : ADMIN_DEV=1 dans .dev.vars ouvre l'accès pour tester.

let clesEnCache = null;
let clesDate = 0;

function b64url(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function cles(equipe) {
  if (clesEnCache && Date.now() - clesDate < 3600 * 1000) return clesEnCache;
  const r = await fetch('https://' + equipe + '/cdn-cgi/access/certs');
  if (!r.ok) throw new Error('certs');
  const data = await r.json();
  clesEnCache = data.keys || [];
  clesDate = Date.now();
  return clesEnCache;
}

export async function utilisateur(request, env) {
  if (env.ADMIN_DEV === '1') return { email: 'test@local' };
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return null;
  const jeton = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!jeton) return null;
  const morceaux = jeton.split('.');
  if (morceaux.length !== 3) return null;
  try {
    const entete = JSON.parse(new TextDecoder().decode(b64url(morceaux[0])));
    const contenu = JSON.parse(new TextDecoder().decode(b64url(morceaux[1])));
    if (entete.alg !== 'RS256') return null;
    const liste = await cles(env.ACCESS_TEAM_DOMAIN);
    const jwk = liste.find((k) => k.kid === entete.kid);
    if (!jwk) return null;
    const cle = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cle, b64url(morceaux[2]), new TextEncoder().encode(morceaux[0] + '.' + morceaux[1]));
    if (!ok) return null;
    const aud = Array.isArray(contenu.aud) ? contenu.aud : [contenu.aud];
    if (!aud.includes(env.ACCESS_AUD)) return null;
    const maintenant = Math.floor(Date.now() / 1000);
    if (contenu.exp && contenu.exp < maintenant) return null;
    if (contenu.iss && contenu.iss !== 'https://' + env.ACCESS_TEAM_DOMAIN) return null;
    return { email: contenu.email || '' };
  } catch (e) {
    return null;
  }
}
