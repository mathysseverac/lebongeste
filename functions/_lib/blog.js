// Blog « Conseils » : lecture des articles et rendu HTML pour le site.
import { esc } from './rendu.js';
import { versHTML } from './markdown.js';

export const SITE = 'https://le-bon-geste.fr';

export function dateLongue(ms) {
  const mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const d = new Date(ms);
  const j = d.getUTCDate();
  return (j === 1 ? '1er' : j) + ' ' + mois[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
}

function image(base, alt, sizes, eager) {
  return `<img src="${base}-m" srcset="${base}-s 480w, ${base}-m 960w, ${base}-l 1600w" sizes="${sizes}" alt="${esc(alt)}" loading="${eager ? 'eager' : 'lazy'}" decoding="async">`;
}

export function carteArticle(a) {
  return `<a class="n-art-carte" href="/conseils/${esc(a.slug)}">` +
    (a.photo ? `<span class="n-art-photo">${image(a.photo, '', '(min-width: 900px) 30rem, 100vw', false)}</span>` : '') +
    `<span class="n-art-txt"><span class="n-art-date">${esc(dateLongue(a.publie_le || a.cree))}</span>` +
    `<span class="n-art-titre">${esc(a.titre)}</span>` +
    (a.description ? `<span class="n-art-desc">${esc(a.description)}</span>` : '') +
    `<span class="n-art-lire">Lire le conseil</span></span></a>`;
}

export function pageArticle(a, tel) {
  const telEsp = tel.replace(/(\d{2})(?=\d)/g, '$1 ');
  return `<article class="lb-wrap n-article">
<p class="n-article-fil"><a href="${SITE}/conseils" data-nav="conseils">Tous les conseils</a></p>
<h1 class="lb-h1 lb-h1-page">${esc(a.titre)}</h1>
<p class="n-article-meta">Par Sylvain, jardinier à Mazamet. Publié le ${esc(dateLongue(a.publie_le || a.cree))}.</p>
${a.photo ? `<figure class="n-article-photo">${image(a.photo, a.photo_alt || a.titre, '(min-width: 900px) 46rem, 100vw', true)}</figure>` : ''}
<div class="n-article-corps">${versHTML(a.corps)}</div>
<aside class="n-article-fin">
<h2>Besoin d'un coup de main ?</h2>
<p>Je passe voir chez vous et je fais un devis gratuit. Avec Unipros, vous ne payez que la moitié de la facture.</p>
<div class="n-article-boutons"><a class="n-pilule n-pilule-vert" href="tel:+33${tel.slice(1)}">Appeler le ${telEsp}</a><a class="n-pilule n-pilule-ligne" href="${SITE}/devis" data-nav="devis">Demander un devis</a></div>
</aside>
</article>`;
}

export function schemaArticle(a) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: a.titre,
    description: a.description || undefined,
    datePublished: new Date(a.publie_le || a.cree).toISOString(),
    dateModified: new Date(a.maj || a.publie_le || a.cree).toISOString(),
    inLanguage: 'fr-FR',
    mainEntityOfPage: SITE + '/conseils/' + a.slug,
    image: a.photo ? SITE + a.photo + '-l' : undefined,
    author: { '@type': 'Person', name: 'Sylvain', jobTitle: 'Jardinier', worksFor: { '@type': 'LocalBusiness', name: 'Le bon geste', url: SITE } },
    publisher: { '@type': 'LocalBusiness', name: 'Le bon geste', url: SITE },
  }).replace(/</g, '\\u003c');
}

export async function articlesPublies(env, limite = 60) {
  const { results } = await env.DB.prepare("SELECT id, slug, titre, description, photo, cree, publie_le, maj FROM articles WHERE statut = 'publie' ORDER BY publie_le DESC LIMIT ?").bind(limite).all();
  return results;
}
