/* Le bon geste : contenu publié depuis l'appli de gestion.
   Chantiers ajoutés, bandeau d'absence, photos remplacées. Si rien n'est publié, rien ne change. */
(function () {
  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }
  function photo(base, alt) {
    return '<img src="' + base + '-m" srcset="' + base + '-s 480w, ' + base + '-m 960w, ' + base + '-l 1600w" sizes="(min-width:900px) 40vw, 100vw" alt="' + esc(alt) + '" loading="lazy" decoding="async">';
  }
  function chantierHTML(c) {
    var lieu = [c.prestationNom, c.commune ? 'à ' + c.commune : ''].filter(Boolean).join(', ');
    var figs = (c.avant ? '<figure>' + photo(c.avant, 'Avant : ' + c.titre) + '<figcaption>Avant</figcaption></figure>' : '') +
      '<figure class="n-cd-apres">' + photo(c.apres, (c.avant ? 'Après : ' : '') + c.titre) + '<figcaption>' + (c.avant ? 'Après' : 'Le travail fini') + '</figcaption></figure>';
    return '<article class="n-cd' + (c.avant ? '' : ' n-cd-seule') + '" id="chantier-' + esc(c.id) + '">' +
      '<div class="n-cd-txt"><h2>' + esc(c.titre) + '</h2>' + (lieu ? '<p class="n-cd-lieu">' + esc(lieu) + '</p>' : '') + (c.texte ? '<p>' + esc(c.texte) + '</p>' : '') + '</div>' +
      '<div class="n-cd-photos">' + figs + '</div></article>';
  }
  function dateFr(iso) {
    try { return new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }); } catch (e) { return iso; }
  }
  function remplacer(img, base) {
    var pic = img.parentElement;
    if (pic && pic.tagName === 'PICTURE') pic.querySelectorAll('source').forEach(function (s) { s.remove(); });
    img.removeAttribute('srcset');
    img.srcset = base + '-s 480w, ' + base + '-m 960w, ' + base + '-l 1600w';
    img.src = base + '-m';
  }

  fetch('/api/contenu', { credentials: 'omit' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
    if (!d) return;

    // chantiers
    var zone = document.querySelector('[data-chantiers-dyn]');
    if (zone && zone.getAttribute('data-rendu') !== 'serveur' && d.chantiers && d.chantiers.length) {
      zone.innerHTML = d.chantiers.map(chantierHTML).join('');
    }

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

    // photos remplacées depuis l'appli
    var emp = d.emplacements || {};
    Object.keys(emp).forEach(function (cle) {
      document.querySelectorAll('img[data-slot="' + cle + '"]').forEach(function (img) { remplacer(img, emp[cle]); });
    });

    // bandeau d'absence
    if (d.absence && !document.querySelector('.n-absence')) {
      var b = document.createElement('div');
      b.className = 'n-absence';
      b.setAttribute('role', 'status');
      var txt = 'Je suis absent' + (d.absence.jusqu ? ' jusqu’au ' + dateFr(d.absence.jusqu) : '') + '.';
      b.innerHTML = '<strong>' + esc(txt) + '</strong> ' + esc(d.absence.message || 'Laissez-moi un message, je vous rappelle à mon retour.');
      var tete = document.getElementById('header');
      if (tete && tete.parentNode) tete.parentNode.insertBefore(b, tete.nextSibling); else document.body.prepend(b);
    }
  }).catch(function () {});
})();
