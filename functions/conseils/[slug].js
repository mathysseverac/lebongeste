// Page d'un article du blog : /conseils/<adresse-de-l-article>
// On reprend la page « Conseils » du site (même en-tête, même pied de page) et on y place l'article.
import { configure, prepare } from '../_lib/base.js';
import { pageArticle, schemaArticle, SITE } from '../_lib/blog.js';
import { esc } from '../_lib/rendu.js';

export async function onRequestGet({ request, env, params }) {
  const base = new URL('/conseils', request.url);
  const slug = String(params.slug || '').toLowerCase();
  let a = null;
  if (configure(env) && /^[a-z0-9-]{1,90}$/.test(slug)) {
    await prepare(env);
    a = await env.DB.prepare("SELECT * FROM articles WHERE slug = ? AND statut = 'publie'").bind(slug).first();
  }
  const coquille = await env.ASSETS.fetch(base);
  if (!a) {
    // Article inconnu : la page « Conseils » avec un code 404, pour que Google ne l'indexe pas.
    return new Response(coquille.body, { status: 404, headers: coquille.headers });
  }
  let tel = '0610669435';
  try {
    const l = await env.DB.prepare("SELECT valeur FROM reglages WHERE cle = 'contact'").first();
    if (l && JSON.parse(l.valeur).tel) tel = JSON.parse(l.valeur).tel;
  } catch (e) {}
  const url = SITE + '/conseils/' + a.slug;
  const titre = a.titre + ' | Le bon geste';
  const desc = a.description || '';
  const html = pageArticle(a, tel);
  const rep = new HTMLRewriter()
    .on('title', { element(el) { el.setInnerContent(titre); } })
    .on('#page-description', { element(el) { el.setAttribute('content', desc); } })
    .on('#page-canonical', { element(el) { el.setAttribute('href', url); } })
    .on('#og-title', { element(el) { el.setAttribute('content', titre); } })
    .on('#og-description', { element(el) { el.setAttribute('content', desc); } })
    .on('#og-url', { element(el) { el.setAttribute('content', url); } })
    .on('meta[property="og:image"]', { element(el) { if (a.photo) el.setAttribute('content', SITE + a.photo + '-l'); } })
    .on('meta[property="og:type"]', { element(el) { el.setAttribute('content', 'article'); } })
    .on('head', { element(el) { el.append(`<script type="application/ld+json">${schemaArticle(a)}</script>`, { html: true }); } })
    .on('#page-conseils', { element(el) { el.setAttribute('class', 'page-view relative'); } })
    .on('#page-article', { element(el) { el.setAttribute('class', 'page-view relative active-page'); el.setInnerContent(html, { html: true }); } })
    .on('[data-nav="conseils"].nav-link, [data-nav="conseils"].mobile-link', { element(el) { el.setAttribute('aria-current', 'page'); } })
    .transform(coquille);
  const h = new Headers(rep.headers);
  h.set('cache-control', 'public, max-age=0, must-revalidate');
  return new Response(rep.body, { status: 200, headers: h });
}
