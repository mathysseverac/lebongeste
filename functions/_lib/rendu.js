// Fabrique le HTML d'un chantier publié depuis l'appli.
// Le même rendu est refait côté navigateur par /assets/contenu.js.
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);

function photo(base, alt) {
  return `<img src="${base}-m" srcset="${base}-s 480w, ${base}-m 960w, ${base}-l 1600w" sizes="(min-width:900px) 40vw, 100vw" alt="${esc(alt)}" loading="lazy" decoding="async">`;
}

export function chantierHTML(c) {
  const lieu = [c.prestationNom, c.commune ? 'à ' + c.commune : ''].filter(Boolean).join(', ');
  const figs = (c.avant ? `<figure>${photo(c.avant, 'Avant : ' + c.titre)}<figcaption>Avant</figcaption></figure>` : '')
    + `<figure class="n-cd-apres">${photo(c.apres, (c.avant ? 'Après : ' : '') + c.titre)}<figcaption>${c.avant ? 'Après' : 'Le travail fini'}</figcaption></figure>`;
  return `<article class="n-cd${c.avant ? '' : ' n-cd-seule'}" id="chantier-${esc(c.id)}">
  <div class="n-cd-txt"><h2>${esc(c.titre)}</h2>${lieu ? `<p class="n-cd-lieu">${esc(lieu)}</p>` : ''}${c.texte ? `<p>${esc(c.texte)}</p>` : ''}</div>
  <div class="n-cd-photos">${figs}</div>
</article>`;
}
