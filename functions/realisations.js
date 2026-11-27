// Page /realisations : on ajoute côté serveur les chantiers publiés depuis l'appli,
// pour que Google les voie directement dans la page (pas seulement après le JavaScript).
import { lireContenu } from './api/contenu.js';
import { chantierHTML } from './_lib/rendu.js';

export async function onRequestGet(context) {
  const { env, request, next } = context;
  const page = await next();
  if (!page.ok || !(page.headers.get('content-type') || '').includes('text/html')) return page;
  let contenu;
  try { contenu = await lireContenu(env); } catch (e) { return page; }
  if (!contenu.chantiers.length) return page;
  const html = contenu.chantiers.map(chantierHTML).join('\n');
  const rep = new HTMLRewriter()
    .on('[data-chantiers-dyn]', { element(el) { el.setInnerContent(html, { html: true }); el.setAttribute('data-rendu', 'serveur'); } })
    .transform(page);
  const h = new Headers(rep.headers);
  h.set('cache-control', 'public, max-age=0, must-revalidate');
  return new Response(rep.body, { status: rep.status, headers: h });
}
