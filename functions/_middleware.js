// Applique sur chaque page du site ce que Sylvain a modifié dans l'appli :
// textes, photos, coordonnées, chantiers, anciens chantiers cachés, bandeau d'absence.
// Tout est fait côté serveur : Google et les visiteurs voient directement la bonne version.
// Si rien n'a été modifié (ou si la base n'est pas branchée), la page part telle quelle.
import { contenuEnCache } from './api/contenu.js';
import { chantierHTML, esc } from './_lib/rendu.js';

const TEL = '0610669435';
const MAIL = 'contact.lebongeste@gmail.com';

function espace(t) { return t.replace(/(\d{2})(?=\d)/g, '$1 '); }

function dateFr(iso) {
  const mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const [, m, j] = iso.split('-').map(Number);
  return (j === 1 ? '1er' : j) + ' ' + mois[m - 1];
}

function vide(c) {
  return !c.chantiers.length && !c.absence && !Object.keys(c.emplacements).length && !Object.keys(c.textes).length &&
    !c.contact.tel && !c.contact.mail && !Object.keys(c.caches).length;
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.pathname.startsWith('/api/') || url.pathname.startsWith('/media/') || url.pathname.startsWith('/admin')) {
    return next();
  }
  // On redemande toujours la page complète : sinon le navigateur garderait une ancienne version.
  const h = new Headers(request.headers);
  h.delete('if-none-match');
  h.delete('if-modified-since');
  const page = await next(new Request(request, { headers: h }));
  if (!(page.headers.get('content-type') || '').includes('text/html')) return page;

  let c;
  try { c = await contenuEnCache(request, env); } catch (e) { return page; }
  const entetes = new Headers(page.headers);
  entetes.delete('etag');
  entetes.set('cache-control', 'public, max-age=0, must-revalidate');
  if (!c || vide(c)) return new Response(page.body, { status: page.status, headers: entetes });

  // Coordonnées : remplacées partout (liens, texte, données pour Google).
  let corps = page.body;
  const tel = c.contact.tel && c.contact.tel !== TEL ? c.contact.tel : '';
  const mail = c.contact.mail && c.contact.mail !== MAIL ? c.contact.mail : '';
  if (tel || mail) {
    let html = await page.text();
    if (tel) {
      html = html.split(espace(TEL)).join(espace(tel))
        .split('+33' + TEL.slice(1)).join('+33' + tel.slice(1))
        .split(TEL).join(tel);
    }
    if (mail) html = html.split(MAIL).join(mail);
    corps = html;
  }

  const { textes, emplacements, caches } = c;
  let rw = new HTMLRewriter()
    .on('[data-t]', { element(el) { const k = el.getAttribute('data-t'); if (Object.prototype.hasOwnProperty.call(textes, k)) el.setInnerContent(textes[k]); } })
    .on('[data-slot]', {
      element(el) {
        const base = emplacements[el.getAttribute('data-slot')];
        if (!base) return;
        if (el.tagName === 'source') { el.remove(); return; }
        el.setAttribute('src', base + '-m');
        el.setAttribute('srcset', `${base}-s 480w, ${base}-m 960w, ${base}-l 1600w`);
        if (!el.getAttribute('sizes')) el.setAttribute('sizes', '(min-width: 900px) 50vw, 100vw');
      },
    })
    .on('[data-bloc]', { element(el) { if (caches[el.getAttribute('data-bloc')]) el.remove(); } });

  if (c.chantiers.length) {
    const html = c.chantiers.map(chantierHTML).join('\n');
    rw = rw.on('[data-chantiers-dyn]', { element(el) { el.setInnerContent(html, { html: true }); el.setAttribute('data-rendu', 'serveur'); } });
  }
  if (c.absence) {
    const a = c.absence;
    const bandeau = `<div class="n-absence" role="status"><strong>Je suis absent${a.jusqu ? ' jusqu’au ' + dateFr(a.jusqu) : ''}.</strong> ${esc(a.message || 'Laissez-moi un message, je vous rappelle à mon retour.')}</div>`;
    rw = rw.on('#header', { element(el) { el.after(bandeau, { html: true }); } });
  }

  entetes.delete('content-length');
  return rw.transform(new Response(corps, { status: page.status, headers: entetes }));
}
