/* Le bon geste : contenu publié depuis l'appli de gestion.
   Le serveur applique déjà textes, photos, chantiers et bandeau d'absence dans la page.
   Ici, il reste seulement l'avant / après de l'accueil, qui reprend le dernier chantier ajouté. */
(function () {
  function remplacer(img, base) {
    var pic = img.parentElement;
    if (pic && pic.tagName === 'PICTURE') pic.querySelectorAll('source').forEach(function (s) { s.remove(); });
    img.removeAttribute('srcset');
    img.srcset = base + '-s 480w, ' + base + '-m 960w, ' + base + '-l 1600w';
    img.src = base + '-m';
  }

  fetch('/api/contenu', { credentials: 'omit' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
    if (!d) return;

    // avant / après de l'accueil : le dernier chantier qui a les deux photos
    var cmp = document.querySelector('[data-compare]');
    var dernier = (d.chantiers || []).filter(function (c) { return c.avant && c.apres; })[0];
    if (cmp && dernier) {
      var imgs = cmp.querySelectorAll('img');
      if (imgs.length >= 2) {
        remplacer(imgs[0], dernier.apres); imgs[0].alt = 'Après : ' + dernier.titre;
        remplacer(imgs[1], dernier.avant); imgs[1].alt = 'Avant : ' + dernier.titre;
      }
    }

  }).catch(function () {});
})();
