/* Le bon geste : appli de gestion.
   Un écran par action. Les photos sont réduites sur le téléphone avant l'envoi :
   trois tailles (1600, 960 et 480 px de large), nettes et légères. */
(function () {
  'use strict';
  var ecran = document.getElementById('ecran');
  var retour = document.querySelector('.retour');
  var titreBarre = document.querySelector('[data-titre]');
  var voile = document.querySelector('[data-voile]');
  var voileTexte = document.querySelector('[data-voile-texte]');
  var toastEl = document.querySelector('[data-toast]');
  var infos = { prestations: {}, emplacements: {} };

  /* ---------- outils ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function attendre(texte) { voileTexte.textContent = texte || 'Un instant…'; voile.hidden = false; }
  function fini() { voile.hidden = true; }
  var toastMinuteur;
  function toast(t) { toastEl.textContent = t; toastEl.hidden = false; clearTimeout(toastMinuteur); toastMinuteur = setTimeout(function () { toastEl.hidden = true; }, 3200); }

  function api(chemin, options) {
    options = options || {};
    var h = options.headers || {};
    if (options.method && options.method !== 'GET') h['X-LBG'] = '1';
    if (options.json !== undefined) { h['content-type'] = 'application/json'; options.body = JSON.stringify(options.json); }
    return fetch('/api/admin/' + chemin, { method: options.method || 'GET', headers: h, body: options.body, credentials: 'same-origin' })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (r.status === 401) throw new Error('Ta connexion a expiré. Ferme l’appli et rouvre-la pour te reconnecter.');
          if (!r.ok) throw new Error(d.erreur || 'Quelque chose n’a pas marché. Réessaie.');
          return d;
        });
      }, function () { throw new Error('Pas de connexion Internet. Réessaie quand tu as du réseau.'); });
  }

  function confirmer(titre, texte, oui) {
    return new Promise(function (resoudre) {
      var m = document.createElement('div');
      m.className = 'modale';
      m.innerHTML = '<div class="modale-boite" role="dialog" aria-modal="true" aria-labelledby="mt"><h2 id="mt">' + esc(titre) + '</h2><p>' + esc(texte) + '</p>' +
        '<button type="button" class="bouton bouton-danger" data-oui>' + esc(oui) + '</button><button type="button" class="bouton bouton-ligne" data-non>Annuler</button></div>';
      document.body.appendChild(m);
      var fermer = function (v) { m.remove(); resoudre(v); };
      m.querySelector('[data-oui]').onclick = function () { fermer(true); };
      m.querySelector('[data-non]').onclick = function () { fermer(false); };
      m.addEventListener('click', function (e) { if (e.target === m) fermer(false); });
      m.querySelector('[data-non]').focus();
    });
  }

  /* ---------- photos : réduire sur le téléphone ---------- */
  function charger(fichier) {
    if (window.createImageBitmap) {
      return createImageBitmap(fichier, { imageOrientation: 'from-image' }).catch(function () { return chargerImg(fichier); });
    }
    return chargerImg(fichier);
  }
  function chargerImg(fichier) {
    return new Promise(function (ok, ko) {
      var url = URL.createObjectURL(fichier);
      var img = new Image();
      img.onload = function () { ok(img); URL.revokeObjectURL(url); };
      img.onerror = function () { ko(new Error('Cette photo ne s’ouvre pas. Essaie une autre photo.')); };
      img.src = url;
    });
  }
  function versBlob(canvas) {
    return new Promise(function (ok) {
      canvas.toBlob(function (b) {
        if (b && b.type === 'image/webp') return ok(b);
        canvas.toBlob(function (j) { ok(j); }, 'image/jpeg', 0.85);
      }, 'image/webp', 0.82);
    });
  }
  function reduire(source, largeur) {
    var w = source.width, h = source.height;
    var ratio = Math.min(1, largeur / Math.max(w, h * 4 / 3));
    var c = document.createElement('canvas');
    c.width = Math.round(w * ratio); c.height = Math.round(h * ratio);
    var ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, c.width, c.height);
    return versBlob(c);
  }
  function preparer(fichier) {
    return charger(fichier).then(function (img) {
      return Promise.all([reduire(img, 1600), reduire(img, 960), reduire(img, 480)]);
    }).then(function (t) { return { l: t[0], m: t[1], s: t[2] }; });
  }
  function envoyer(tailles) {
    var fd = new FormData();
    var ext = tailles.l.type === 'image/webp' ? 'webp' : 'jpg';
    fd.append('l', tailles.l, 'l.' + ext); fd.append('m', tailles.m, 'm.' + ext); fd.append('s', tailles.s, 's.' + ext);
    return api('photo', { method: 'POST', body: fd }).then(function (d) { return d.base; });
  }

  /* ---------- écrans ---------- */
  var titres = { accueil: '', nouveau: 'Nouveau chantier', fini: '', chantiers: 'Mes chantiers', photos: 'Photos du site', absence: 'Absence' };

  function afficher(nom) {
    if (!document.getElementById('t-' + nom)) nom = 'accueil';
    ecran.innerHTML = '';
    ecran.appendChild(document.getElementById('t-' + nom).content.cloneNode(true));
    retour.hidden = nom === 'accueil';
    titreBarre.textContent = titres[nom] || '';
    window.scrollTo(0, 0);
    ecran.focus({ preventScroll: true });
    (ecrans[nom] || function () {})();
  }
  function aller(nom) { if (location.hash === '#' + nom) afficher(nom); else location.hash = nom; }
  window.addEventListener('hashchange', function () { afficher(location.hash.slice(1) || 'accueil'); });
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-aller]');
    if (b) { e.preventDefault(); aller(b.getAttribute('data-aller')); }
  });

  var ecrans = {};

  ecrans.accueil = function () {
    var compte = ecran.querySelector('[data-compte]');
    api('moi').then(function (d) {
      infos = d;
      compte.textContent = d.email ? 'Connecté : ' + d.email : '';
    }).catch(function (e) { compte.textContent = e.message; });
    api('chantiers').then(function (d) {
      var n = d.chantiers.length;
      ecran.querySelector('[data-nb-chantiers]').textContent = n ? n + ' chantier' + (n > 1 ? 's' : '') + ' en ligne ou cachés' : 'Aucun pour l’instant';
    }).catch(function () {});
    api('reglages').then(function (d) {
      var a = d.absence || {};
      var el = ecran.querySelector('[data-etat-absence]');
      if (a.actif) el.textContent = 'Bandeau affiché' + (a.jusqu ? ' jusqu’au ' + dateFr(a.jusqu) : '');
    }).catch(function () {});
  };

  ecrans.nouveau = function () {
    var form = ecran.querySelector('[data-form-chantier]');
    var erreur = form.querySelector('[data-erreur]');
    var choix = { avant: null, apres: null };
    var prestation = '';
    var puces = form.querySelector('[data-prestations]');
    var liste = infos.prestations && Object.keys(infos.prestations).length ? infos.prestations : { haies: 'Taille de haies', tonte: 'Tonte et débroussaillage', terrasses: 'Terrasses et allées', bricolage: 'Petit bricolage', informatique: 'Informatique', autre: 'Autre' };
    Object.keys(liste).forEach(function (k) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'puce'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', 'false'); b.textContent = liste[k];
      b.onclick = function () {
        prestation = k;
        puces.querySelectorAll('.puce').forEach(function (x) { x.setAttribute('aria-checked', String(x === b)); });
        if (!form.titre.value) form.titre.placeholder = 'Par exemple : ' + liste[k] + (form.commune.value ? ' à ' + form.commune.value : '');
      };
      puces.appendChild(b);
    });
    form.querySelectorAll('[data-fichier]').forEach(function (input) {
      input.addEventListener('change', function () {
        var f = input.files && input.files[0];
        var zone = input.closest('.photo-choix');
        if (!f) return;
        choix[input.getAttribute('data-fichier')] = f;
        var img = zone.querySelector('img');
        img.src = URL.createObjectURL(f); img.hidden = false;
        zone.querySelector('.photo-vide').hidden = true;
        zone.classList.add('rempli');
      });
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      erreur.hidden = true;
      var titre = form.titre.value.trim();
      if (!choix.apres) return montrerErreur('Il manque la photo après.');
      if (!titre) { form.titre.focus(); return montrerErreur('Écris un petit titre pour ce chantier.'); }
      var bases = {};
      attendre('Préparation des photos…');
      var suite = Promise.resolve();
      ['avant', 'apres'].forEach(function (cle) {
        if (!choix[cle]) return;
        suite = suite.then(function () {
          voileTexte.textContent = 'Envoi de la photo ' + (cle === 'avant' ? 'avant' : 'après') + '…';
          return preparer(choix[cle]).then(envoyer).then(function (b) { bases[cle] = b; });
        });
      });
      suite.then(function () {
        voileTexte.textContent = 'Publication…';
        return api('chantiers', { method: 'POST', json: { titre: titre, commune: form.commune.value.trim(), texte: form.texte.value.trim(), prestation: prestation || 'autre', avant: bases.avant || '', apres: bases.apres } });
      }).then(function () { fini(); afficher('fini'); history.replaceState(null, '', '#fini'); })
        .catch(function (err) { fini(); montrerErreur(err.message); });
    });
    function montrerErreur(t) { erreur.textContent = t; erreur.hidden = false; erreur.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  };

  ecrans.chantiers = function () {
    var liste = ecran.querySelector('[data-liste]');
    liste.innerHTML = '<p class="vide">Chargement…</p>';
    api('chantiers').then(function (d) {
      if (!d.chantiers.length) { liste.innerHTML = '<p class="vide">Tu n’as pas encore ajouté de chantier.<br><button type="button" class="bouton bouton-plein" data-aller="nouveau">Ajouter un chantier</button></p>'; return; }
      liste.innerHTML = '';
      d.chantiers.forEach(function (c) {
        var f = document.createElement('article');
        f.className = 'fiche' + (c.publie ? '' : ' fiche-cache');
        var photos = (c.avant ? '<img src="' + c.avant + '-s" alt="Avant">' : '') + '<img src="' + c.apres + '-s" alt="Après">';
        f.innerHTML = '<div class="fiche-photos' + (c.avant ? '' : ' une') + '">' + photos + '</div>' +
          '<div class="fiche-corps"><span class="etat' + (c.publie ? '' : ' etat-cache') + '">' + (c.publie ? 'Visible sur le site' : 'Caché') + '</span>' +
          '<h2>' + esc(c.titre) + '</h2><p>' + esc([infos.prestations && infos.prestations[c.prestation], c.commune].filter(Boolean).join(', ')) + '</p>' +
          '<button type="button" class="bouton bouton-ligne" data-basculer>' + (c.publie ? 'Cacher du site' : 'Remettre sur le site') + '</button>' +
          '<button type="button" class="bouton bouton-danger" data-supprimer>Supprimer</button></div>';
        f.querySelector('[data-basculer]').onclick = function () {
          attendre(c.publie ? 'On le cache…' : 'On le remet…');
          api('chantiers/' + encodeURIComponent(c.id), { method: 'PATCH', json: { publie: !c.publie } })
            .then(function () { fini(); toast(c.publie ? 'Chantier caché' : 'Chantier remis sur le site'); ecrans.chantiers(); })
            .catch(function (e) { fini(); toast(e.message); });
        };
        f.querySelector('[data-supprimer]').onclick = function () {
          confirmer('Supprimer ce chantier ?', 'Les photos seront effacées du site. On ne pourra pas revenir en arrière.', 'Oui, supprimer').then(function (oui) {
            if (!oui) return;
            attendre('Suppression…');
            api('chantiers/' + encodeURIComponent(c.id), { method: 'DELETE' })
              .then(function () { fini(); toast('Chantier supprimé'); ecrans.chantiers(); })
              .catch(function (e) { fini(); toast(e.message); });
          });
        };
        liste.appendChild(f);
      });
    }).catch(function (e) { liste.innerHTML = '<p class="vide">' + esc(e.message) + '</p>'; });
  };

  var origines = {
    'accueil-haut': '/assets/realisations/hero-haie-m.webp',
    'presta-haies': '/assets/accueil/0725.webp',
    'presta-tonte': '/assets/accueil/0577.webp',
    'presta-terrasses': '/assets/accueil/arbre-taille.webp'
  };

  ecrans.photos = function () {
    var zone = ecran.querySelector('[data-emplacements]');
    zone.innerHTML = '<p class="vide">Chargement…</p>';
    api('reglages').then(function (d) {
      zone.innerHTML = '';
      Object.keys(d.liste).forEach(function (cle) {
        var actuelle = d.emplacements[cle];
        var f = document.createElement('article');
        f.className = 'fiche';
        f.innerHTML = '<div class="fiche-photos une"><img src="' + (actuelle ? actuelle + '-m' : origines[cle]) + '" alt=""></div>' +
          '<div class="fiche-corps"><h2>' + esc(d.liste[cle]) + '</h2><p>' + (actuelle ? 'Photo changée avec l’appli' : 'Photo d’origine') + '</p>' +
          '<label class="bouton bouton-plein">Changer la photo<input type="file" accept="image/*" hidden></label>' +
          (actuelle ? '<button type="button" class="bouton bouton-texte" data-origine>Remettre la photo d’origine</button>' : '') + '</div>';
        f.querySelector('input').addEventListener('change', function () {
          var fichier = this.files && this.files[0];
          if (!fichier) return;
          attendre('Préparation de la photo…');
          preparer(fichier).then(function (t) { voileTexte.textContent = 'Envoi…'; return envoyer(t); })
            .then(function (base) { return api('emplacement', { method: 'PUT', json: { cle: cle, base: base } }); })
            .then(function () { fini(); toast('Photo changée sur le site'); ecrans.photos(); })
            .catch(function (e) { fini(); toast(e.message); });
        });
        var o = f.querySelector('[data-origine]');
        if (o) o.onclick = function () {
          attendre('On remet la photo d’origine…');
          api('emplacement', { method: 'PUT', json: { cle: cle, base: '' } })
            .then(function () { fini(); toast('Photo d’origine remise'); ecrans.photos(); })
            .catch(function (e) { fini(); toast(e.message); });
        };
        zone.appendChild(f);
      });
    }).catch(function (e) { zone.innerHTML = '<p class="vide">' + esc(e.message) + '</p>'; });
  };

  function dateFr(iso) { try { return new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }); } catch (e) { return iso; } }

  ecrans.absence = function () {
    var form = ecran.querySelector('[data-form-absence]');
    var apercu = form.querySelector('[data-apercu]');
    var erreur = form.querySelector('[data-erreur]');
    form.jusqu.min = new Date().toISOString().slice(0, 10);
    function majApercu() {
      if (!form.actif.checked) { apercu.textContent = ''; return; }
      apercu.innerHTML = '<strong>Je suis absent' + (form.jusqu.value ? ' jusqu’au ' + esc(dateFr(form.jusqu.value)) : '') + '.</strong> ' + esc(form.message.value.trim() || 'Laissez-moi un message, je vous rappelle à mon retour.');
    }
    ['change', 'input'].forEach(function (ev) { form.addEventListener(ev, majApercu); });
    api('reglages').then(function (d) {
      var a = d.absence || {};
      form.actif.checked = Boolean(a.actif); form.jusqu.value = a.jusqu || ''; form.message.value = a.message || '';
      majApercu();
    }).catch(function (e) { erreur.textContent = e.message; erreur.hidden = false; });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      erreur.hidden = true;
      if (form.actif.checked && !form.jusqu.value) { erreur.textContent = 'Indique la date de ton retour, pour que le bandeau s’enlève tout seul.'; erreur.hidden = false; return; }
      attendre('Enregistrement…');
      api('absence', { method: 'PUT', json: { actif: form.actif.checked, jusqu: form.jusqu.value, message: form.message.value.trim() } })
        .then(function () { fini(); toast(form.actif.checked ? 'Bandeau affiché sur le site' : 'Bandeau retiré du site'); aller('accueil'); })
        .catch(function (err) { fini(); erreur.textContent = err.message; erreur.hidden = false; });
    });
  };

  api('moi').then(function (d) { infos = d; }).catch(function () {});
  afficher(location.hash.slice(1) || 'accueil');
})();
