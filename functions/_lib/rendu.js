// Rendu HTML d'un chantier publié depuis l'appli, avec la même présentation que les anciens chantiers
// de la page Réalisations : une seule photo et les boutons Avant / Après sur téléphone, côte à côte sur ordinateur.

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function image(base, alt, eager) {
  return `<img src="${base}-m" srcset="${base}-s 480w, ${base}-m 960w, ${base}-l 1600w" sizes="(min-width: 900px) 36rem, 100vw" alt="${esc(alt)}" loading="${eager ? 'eager' : 'lazy'}" decoding="async">`;
}

export function chantierHTML(c, i) {
  const portrait = c.portrait ? ' is-portrait' : '';
  const meta = [
    c.prestationNom ? `<div><dt>Prestation</dt><dd>${esc(c.prestationNom)}</dd></div>` : '',
    c.commune ? `<div><dt>Commune</dt><dd>${esc(c.commune)}</dd></div>` : '',
  ].join('');
  let photos;
  if (c.avant) {
    photos = `<div class="lb-ba${portrait}" data-ba data-state="avant">
<div class="lb-ba-stage">
<div class="lb-ba-frames" data-ba-frames>
<figure class="lb-ba-fig is-avant">${image(c.avant, 'Avant : ' + c.titre, i === 0)}<figcaption>Avant</figcaption></figure>
<figure class="lb-ba-fig is-apres">${image(c.apres, 'Après : ' + c.titre, false)}<figcaption>Après</figcaption></figure>
</div>
<div class="lb-ba-switch" role="group" aria-label="Photo affichée"><button type="button" data-ba-show="avant" aria-pressed="true">Avant</button><button type="button" data-ba-show="apres" aria-pressed="false">Après</button></div>
</div>
</div>`;
  } else {
    photos = `<div class="lb-ba lb-ba-seule${portrait}"><figure class="lb-ba-fig is-apres">${image(c.apres, c.titre, i === 0)}<figcaption>Le travail fini</figcaption></figure></div>`;
  }
  return `<article class="lb-chantier" id="chantier-${esc(c.id)}">
<div class="lb-chantier-head">
<div><h2 class="lb-h2">${esc(c.titre)}</h2>${c.texte ? `<p class="lb-body">${esc(c.texte)}</p>` : ''}</div>
${meta ? `<dl class="lb-chantier-meta">${meta}</dl>` : ''}
</div>
${photos}
</article>`;
}
