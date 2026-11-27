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

  function confirmer(titre, texte, oui, doux) {
    return new Promise(function (resoudre) {
      var m = document.createElement('div');
      m.className = 'modale';
      m.innerHTML = '<div class="modale-boite" role="dialog" aria-modal="true" aria-labelledby="mt"><h2 id="mt">' + esc(titre) + '</h2><p>' + esc(texte) + '</p>' +
        '<button type="button" class="bouton ' + (doux ? 'bouton-plein' : 'bouton-danger') + '" data-oui>' + esc(oui) + '</button><button type="button" class="bouton bouton-ligne" data-non>Annuler</button></div>';
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
      var portrait = img.height > img.width;
      return Promise.all([reduire(img, 1600), reduire(img, 960), reduire(img, 480)]).then(function (t) { return { l: t[0], m: t[1], s: t[2], portrait: portrait }; });
    });
  }
  function envoyer(tailles) {
    var fd = new FormData();
    var ext = tailles.l.type === 'image/webp' ? 'webp' : 'jpg';
    fd.append('l', tailles.l, 'l.' + ext); fd.append('m', tailles.m, 'm.' + ext); fd.append('s', tailles.s, 's.' + ext);
    return api('photo', { method: 'POST', body: fd }).then(function (d) { return d.base; });
  }

  /* ---------- écrans ---------- */
  var titres = { accueil: '', nouveau: 'Nouveau chantier', modifier: 'Modifier un chantier', fini: '', chantiers: 'Mes chantiers', site: 'Modifier le site', page: 'Modifier le site', coordonnees: 'Modifier le site', absence: 'Absence', blog: 'Mes conseils', ecrire: 'Mes conseils', article: 'Mes conseils' };
  var modeles = { modifier: 'nouveau' };
  var parents = { page: 'site', coordonnees: 'site', modifier: 'chantiers', ecrire: 'blog', article: 'blog' };

  function afficher(adresse) {
    var morceaux = String(adresse || '').split('/');
    var nom = morceaux[0] || 'accueil';
    var param = decodeURIComponent(morceaux.slice(1).join('/'));
    var modele = modeles[nom] || nom;
    if (!document.getElementById('t-' + modele)) { nom = modele = 'accueil'; }
    ecran.innerHTML = '';
    ecran.appendChild(document.getElementById('t-' + modele).content.cloneNode(true));
    retour.hidden = nom === 'accueil';
    retour.setAttribute('data-aller', parents[nom] || 'accueil');
    titreBarre.textContent = titres[nom] || '';
    window.scrollTo(0, 0);
    ecran.focus({ preventScroll: true });
    (ecrans[nom] || function () {})(param);
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

  var PRESTAS = { haies: 'Taille de haies', tonte: 'Tonte et débroussaillage', terrasses: 'Terrasses et allées', bricolage: 'Petit bricolage', informatique: 'Informatique', autre: 'Autre' };

  function formulaireChantier(existant) {
    var form = ecran.querySelector('[data-form-chantier]');
    var erreur = form.querySelector('[data-erreur]');
    var choix = { avant: null, apres: null };
    var portraits = {};
    var retirerAvant = false;
    var prestation = existant ? existant.prestation : '';
    var puces = form.querySelector('[data-prestations]');
    var liste = infos.prestations && Object.keys(infos.prestations).length ? infos.prestations : PRESTAS;

    if (existant) {
      form.querySelector('[data-form-titre]').textContent = 'Modifier le chantier';
      form.querySelector('[data-envoyer]').textContent = 'Enregistrer les changements';
      form.querySelector('[data-aide-avant]').hidden = true;
      form.titre.value = existant.titre || '';
      form.commune.value = existant.commune || '';
      form.texte.value = existant.texte || '';
      ['avant', 'apres'].forEach(function (cle) {
        if (!existant[cle]) return;
        var zone = form.querySelector('[data-zone="' + cle + '"]');
        var img = zone.querySelector('img');
        img.src = existant[cle] + '-m'; img.hidden = false;
        zone.querySelector('.photo-vide').hidden = true;
        zone.classList.add('rempli');
      });
      var boutonRetirer = form.querySelector('[data-retirer-avant]');
      boutonRetirer.hidden = !existant.avant;
      boutonRetirer.onclick = function () {
        retirerAvant = true; choix.avant = null;
        var zone = form.querySelector('[data-zone="avant"]');
        zone.querySelector('img').hidden = true;
        zone.querySelector('.photo-vide').hidden = false;
        zone.classList.remove('rempli');
        boutonRetirer.hidden = true;
        toast('La photo avant sera retirée quand tu enregistres');
      };
    }

    Object.keys(liste).forEach(function (k) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'puce'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(k === prestation)); b.textContent = liste[k];
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
        var cle = input.getAttribute('data-fichier');
        choix[cle] = f;
        if (cle === 'avant') { retirerAvant = false; var br = form.querySelector('[data-retirer-avant]'); if (existant) br.hidden = false; }
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
      if (!choix.apres && !(existant && existant.apres)) return montrerErreur('Il manque la photo après.');
      if (!titre) { form.titre.focus(); return montrerErreur('Écris un petit titre pour ce chantier.'); }
      var bases = {};
      attendre('Préparation des photos…');
      var suite = Promise.resolve();
      ['avant', 'apres'].forEach(function (cle) {
        if (!choix[cle]) return;
        suite = suite.then(function () {
          voileTexte.textContent = 'Envoi de la photo ' + (cle === 'avant' ? 'avant' : 'après') + '…';
          return preparer(choix[cle]).then(function (t) { portraits[cle] = t.portrait; return envoyer(t); }).then(function (b) { bases[cle] = b; });
        });
      });
      suite.then(function () {
        voileTexte.textContent = existant ? 'Enregistrement…' : 'Publication…';
        var donnees = { titre: titre, commune: form.commune.value.trim(), texte: form.texte.value.trim(), prestation: prestation || 'autre' };
        if (!existant) {
          donnees.avant = bases.avant || ''; donnees.apres = bases.apres; donnees.portrait = Boolean(portraits.apres);
          return api('chantiers', { method: 'POST', json: donnees });
        }
        if (bases.apres) { donnees.apres = bases.apres; donnees.portrait = Boolean(portraits.apres); }
        if (bases.avant) donnees.avant = bases.avant; else if (retirerAvant) donnees.avant = '';
        return api('chantiers/' + encodeURIComponent(existant.id), { method: 'PATCH', json: donnees });
      }).then(function () {
        fini();
        if (existant) { toast('Chantier modifié sur le site'); aller('chantiers'); return; }
        afficher('fini'); history.replaceState(null, '', '#fini');
      }).catch(function (err) { fini(); montrerErreur(err.message); });
    });
    function montrerErreur(t) { erreur.textContent = t; erreur.hidden = false; erreur.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  }

  ecrans.nouveau = function () { formulaireChantier(null); };
  ecrans.modifier = function (id) {
    var form = ecran.querySelector('[data-form-chantier]');
    form.hidden = true;
    attendre('Chargement…');
    api('chantiers').then(function (d) {
      fini();
      var c = d.chantiers.filter(function (x) { return x.id === id; })[0];
      if (!c) { toast('Ce chantier n’existe plus'); aller('chantiers'); return; }
      form.hidden = false;
      formulaireChantier(c);
    }).catch(function (e) { fini(); toast(e.message); aller('chantiers'); });
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
          '<div class="fiche-boutons"><button type="button" class="bouton bouton-plein" data-aller="modifier/' + encodeURIComponent(c.id) + '">Modifier</button>' +
          '<button type="button" class="bouton bouton-ligne" data-basculer>' + (c.publie ? 'Cacher' : 'Remettre') + '</button>' +
          '<button type="button" class="bouton bouton-danger" data-supprimer>Supprimer</button></div></div>';
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

  /* ---------- modifier le site ---------- */
  var site = null;
  function chargerSite() {
    var plan = site ? Promise.resolve(site) : fetch('/admin/site.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (d) { site = d; return d; });
    return Promise.all([plan, api('reglages')]).then(function (r) { return { plan: r[0], reglages: r[1] }; });
  }
  function espaceTel(t) { return String(t || '').replace(/(\d{2})(?=\d)/g, '$1 '); }
  function sansAccent(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  // Une carte de texte : on touche, une fenêtre s'ouvre pour le changer.
  function carteTexte(b, reglages, page, rafraichir) {
    var modifie = Object.prototype.hasOwnProperty.call(reglages.textes, b.cle);
    var actuel = modifie ? reglages.textes[b.cle] : b.defaut;
    var el = document.createElement('button');
    el.type = 'button';
    el.className = 'bloc-texte' + (/titre/i.test(b.libelle) || b.libelle === 'Question' ? ' titre' : '');
    el.innerHTML = (page ? '<span class="bloc-page">' + esc(page.nom) + '</span>' : '') +
      '<span class="bloc-libelle">' + esc(b.libelle) + (modifie ? '<em>Modifié</em>' : '') + '</span>' +
      '<span class="bloc-contenu">' + esc(actuel) + '</span><span class="bloc-modifier">Modifier ce texte</span>';
    el.onclick = function () { editerTexte(b, actuel, modifie, rafraichir); };
    return el;
  }

  function editerTexte(b, actuel, modifie, rafraichir) {
    var m = document.createElement('div');
    m.className = 'modale';
    m.innerHTML = '<form class="modale-boite" role="dialog" aria-modal="true" aria-labelledby="mt" novalidate><h2 id="mt">' + esc(b.libelle) + '</h2>' +
      '<textarea class="champ" rows="' + (b.long ? 6 : 3) + '" maxlength="2000" aria-label="Nouveau texte"></textarea>' +
      (modifie ? '<p class="origine"><b>Texte d’origine&nbsp;:</b> ' + esc(b.defaut) + '</p>' : '') +
      '<p class="erreur" hidden></p>' +
      '<button type="submit" class="bouton bouton-plein">Enregistrer</button>' +
      (modifie ? '<button type="button" class="bouton bouton-ligne" data-origine>Remettre le texte d’origine</button>' : '') +
      '<button type="button" class="bouton bouton-texte" data-non>Annuler</button></form>';
    document.body.appendChild(m);
    var zone = m.querySelector('textarea');
    var err = m.querySelector('.erreur');
    zone.value = actuel;
    var fermer = function () { m.remove(); };
    m.querySelector('[data-non]').onclick = fermer;
    m.addEventListener('click', function (e) { if (e.target === m) fermer(); });
    function envoyerTexte(corps, message) {
      attendre('Enregistrement…');
      api('texte', { method: 'PUT', json: corps }).then(function () { fini(); fermer(); toast(message); rafraichir(); })
        .catch(function (e) { fini(); err.textContent = e.message; err.hidden = false; });
    }
    m.querySelector('form').addEventListener('submit', function (e) {
      e.preventDefault();
      var t = zone.value.replace(/\s+/g, ' ').trim();
      if (!t) { err.textContent = 'Le texte est vide.'; err.hidden = false; return; }
      if (t === actuel) { fermer(); return; }
      envoyerTexte({ cle: b.cle, texte: t }, 'Texte changé sur le site');
    });
    var o = m.querySelector('[data-origine]');
    if (o) o.onclick = function () { envoyerTexte({ cle: b.cle, origine: true }, 'Texte d’origine remis'); };
    zone.focus();
    try { zone.setSelectionRange(zone.value.length, zone.value.length); } catch (e) {}
  }

  function cartePhoto(b, reglages, rafraichir) {
    var actuelle = reglages.emplacements[b.cle];
    var f = document.createElement('article');
    f.className = 'fiche';
    f.innerHTML = '<div class="fiche-photos une' + (b.portrait && !actuelle ? ' portrait' : '') + '"><img src="' + esc(actuelle ? actuelle + '-m' : b.src) + '" alt=""></div>' +
      '<div class="fiche-corps"><span class="bloc-libelle">' + esc(b.libelle) + (actuelle ? '<em>Modifiée</em>' : '') + '</span>' +
      '<label class="bouton bouton-plein">Changer la photo<input type="file" accept="image/*" hidden></label>' +
      (actuelle ? '<button type="button" class="bouton bouton-texte" data-origine>Remettre la photo d’origine</button>' : '') + '</div>';
    f.querySelector('input').addEventListener('change', function () {
      var fichier = this.files && this.files[0];
      if (!fichier) return;
      attendre('Préparation de la photo…');
      preparer(fichier).then(function (t) { voileTexte.textContent = 'Envoi…'; return envoyer(t); })
        .then(function (base) { return api('emplacement', { method: 'PUT', json: { cle: b.cle, base: base } }); })
        .then(function () { fini(); toast('Photo changée sur le site'); rafraichir(); })
        .catch(function (e) { fini(); toast(e.message); });
    });
    var o = f.querySelector('[data-origine]');
    if (o) o.onclick = function () {
      attendre('On remet la photo d’origine…');
      api('emplacement', { method: 'PUT', json: { cle: b.cle, base: '' } })
        .then(function () { fini(); toast('Photo d’origine remise'); rafraichir(); })
        .catch(function (e) { fini(); toast(e.message); });
    };
    return f;
  }

  function carteAncien(b, reglages) {
    var visible = !reglages.caches[b.cle];
    var f = document.createElement('div');
    f.className = 'fiche-ancien';
    f.innerHTML = '<span class="bloc-libelle">Chantier déjà sur le site avant l’appli</span><b>' + esc(b.titre) + '</b>' +
      '<label class="interrupteur"><input type="checkbox"' + (visible ? ' checked' : '') + '><span class="interrupteur-piste" aria-hidden="true"><span></span></span><span data-etat>' + (visible ? 'Visible sur le site' : 'Caché') + '</span></label>';
    var c = f.querySelector('input');
    c.addEventListener('change', function () {
      var v = c.checked;
      api('bloc', { method: 'PUT', json: { cle: b.cle, visible: v } })
        .then(function () { reglages.caches[b.cle] = !v; f.querySelector('[data-etat]').textContent = v ? 'Visible sur le site' : 'Caché'; toast(v ? 'Chantier remis sur le site' : 'Chantier caché du site'); })
        .catch(function (e) { c.checked = !v; toast(e.message); });
    });
    return f;
  }

  ecrans.site = function () {
    var pagesEl = ecran.querySelector('[data-pages]');
    var sommaire = ecran.querySelector('[data-sommaire]');
    var resultats = ecran.querySelector('[data-resultats]');
    var champ = ecran.querySelector('[data-recherche]');
    pagesEl.innerHTML = '<p class="vide">Chargement…</p>';
    var donnees = null;
    function charger() {
      return chargerSite().then(function (d) {
        donnees = d;
        var c = d.reglages.contact || {};
        ecran.querySelector('[data-resume-contact]').textContent = espaceTel(c.tel || '0610669435') + ', ' + (c.mail || 'contact.lebongeste@gmail.com');
        pagesEl.innerHTML = '';
        d.plan.pages.forEach(function (p) {
          var nt = 0, np = 0, nm = 0;
          p.blocs.forEach(function (b) {
            if (b.t === 'texte') { nt++; if (d.reglages.textes[b.cle] != null) nm++; }
            if (b.t === 'photo') { np++; if (d.reglages.emplacements[b.cle]) nm++; }
          });
          var l = document.createElement('button');
          l.type = 'button'; l.className = 'ligne-page'; l.setAttribute('data-aller', 'page/' + p.id);
          l.innerHTML = '<span><b>' + esc(p.nom) + '</b><i>' + nt + ' textes' + (np ? ', ' + np + ' photo' + (np > 1 ? 's' : '') : '') + (nm ? '. ' + nm + ' modifié' + (nm > 1 ? 's' : '') : '') + '</i></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';
          pagesEl.appendChild(l);
        });
        if (champ.value.trim()) chercher();
      }).catch(function (e) { pagesEl.innerHTML = '<p class="vide">' + esc(e.message) + '</p>'; });
    }
    function chercher() {
      var q = sansAccent(champ.value.trim());
      sommaire.hidden = Boolean(q);
      resultats.hidden = !q;
      if (!q || !donnees) return;
      resultats.innerHTML = '';
      var n = 0;
      donnees.plan.pages.forEach(function (p) {
        p.blocs.forEach(function (b) {
          if (b.t !== 'texte' || n >= 40) return;
          var actuel = donnees.reglages.textes[b.cle] != null ? donnees.reglages.textes[b.cle] : b.defaut;
          if (sansAccent(actuel).indexOf(q) === -1) return;
          n++;
          resultats.appendChild(carteTexte(b, donnees.reglages, p, charger));
        });
      });
      if (!n) resultats.innerHTML = '<p class="vide">Aucun texte ne contient ce mot.</p>';
    }
    champ.addEventListener('input', chercher);
    charger();
  };

  ecrans.page = function (id) {
    var zone = ecran.querySelector('[data-blocs]');
    zone.innerHTML = '<p class="vide">Chargement…</p>';
    function charger() {
      var y = window.scrollY;
      return chargerSite().then(function (d) {
        var p = d.plan.pages.filter(function (x) { return x.id === id; })[0];
        if (!p) { aller('site'); return; }
        ecran.querySelector('[data-nom-page]').textContent = p.nom;
        ecran.querySelector('[data-lien-page]').href = p.url;
        zone.innerHTML = '';
        p.blocs.forEach(function (b) {
          if (b.t === 'texte') zone.appendChild(carteTexte(b, d.reglages, null, charger));
          else if (b.t === 'photo') zone.appendChild(cartePhoto(b, d.reglages, charger));
          else if (b.t === 'bloc') zone.appendChild(carteAncien(b, d.reglages));
        });
        window.scrollTo(0, y);
      }).catch(function (e) { zone.innerHTML = '<p class="vide">' + esc(e.message) + '</p>'; });
    }
    charger();
  };

  ecrans.coordonnees = function () {
    var form = ecran.querySelector('[data-form-contact]');
    var erreur = form.querySelector('[data-erreur]');
    api('reglages').then(function (d) {
      var c = d.contact || {};
      if (!form.tel.value) form.tel.value = espaceTel(c.tel || '0610669435');
      if (!form.mail.value) form.mail.value = c.mail || 'contact.lebongeste@gmail.com';
    }).catch(function (e) { erreur.textContent = e.message; erreur.hidden = false; });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      erreur.hidden = true;
      attendre('Enregistrement…');
      api('contact', { method: 'PUT', json: { tel: form.tel.value, mail: form.mail.value.trim() } })
        .then(function () { fini(); toast('Coordonnées changées sur tout le site'); aller('site'); })
        .catch(function (err) { fini(); erreur.textContent = err.message; erreur.hidden = false; });
    });
  };

  /* ---------- conseils (blog) ---------- */
  function enLigne(t) { return esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'); }
  function versHTML(texte) {
    var out = [], para = [], liste = null;
    function finPara() { if (para.length) { out.push('<p>' + enLigne(para.join(' ')) + '</p>'); para = []; } }
    function finListe() { if (liste) { out.push('<ul>' + liste.map(function (l) { return '<li>' + enLigne(l) + '</li>'; }).join('') + '</ul>'); liste = null; } }
    String(texte || '').replace(/\r/g, '').split('\n').forEach(function (brut) {
      var l = brut.trim(), m;
      if (!l) { finPara(); finListe(); return; }
      if ((m = l.match(/^(#{2,3})\s+(.+)$/))) { finPara(); finListe(); out.push('<h2>' + enLigne(m[2]) + '</h2>'); return; }
      if ((m = l.match(/^[-*•]\s+(.+)$/))) { finPara(); (liste = liste || []).push(m[1]); return; }
      finListe(); para.push(l);
    });
    finPara(); finListe();
    return out.join('');
  }
  function dateCourte(ms) { try { return new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return ''; } }

  // Une zone photo réutilisable : montre la photo choisie, garde le fichier.
  function zonePhoto(conteneur, actuelle) {
    var input = conteneur.querySelector('[data-photo-article]');
    var zone = input.closest('.photo-choix');
    var etat = { fichier: null, base: actuelle || '' };
    function montrer(src) {
      var img = zone.querySelector('img');
      if (src) { img.src = src; img.hidden = false; zone.querySelector('.photo-vide').hidden = true; zone.classList.add('rempli'); }
      else { img.hidden = true; zone.querySelector('.photo-vide').hidden = false; zone.classList.remove('rempli'); }
    }
    if (actuelle) montrer(actuelle + '-m');
    input.addEventListener('change', function () {
      var f = input.files && input.files[0];
      if (!f) return;
      etat.fichier = f; montrer(URL.createObjectURL(f));
      if (etat.onChange) etat.onChange();
    });
    etat.vider = function () { etat.fichier = null; etat.base = ''; input.value = ''; montrer(''); };
    etat.envoyerSiBesoin = function () {
      if (!etat.fichier) return Promise.resolve(etat.base);
      voileTexte.textContent = 'Envoi de la photo…';
      return preparer(etat.fichier).then(envoyer).then(function (b) { etat.base = b; etat.fichier = null; return b; });
    };
    return etat;
  }

  ecrans.blog = function () {
    var liste = ecran.querySelector('[data-articles]');
    var alerte = ecran.querySelector('[data-alerte-ia]');
    liste.innerHTML = '<p class="vide">Chargement…</p>';
    api('blog').then(function (d) {
      if (!d.ia.claude) { alerte.textContent = 'La clé Claude n’est pas encore ajoutée dans Cloudflare : l’écriture automatique ne marchera pas avant.'; alerte.hidden = false; }
      if (!d.articles.length) { liste.innerHTML = '<p class="vide">Pas encore de conseil. Le premier, c’est le plus dur&nbsp;!</p>'; return; }
      liste.innerHTML = '';
      d.articles.forEach(function (a) {
        var f = document.createElement('article');
        f.className = 'fiche';
        var publie = a.statut === 'publie';
        f.innerHTML = (a.photo ? '<div class="fiche-photos une"><img src="' + a.photo + '-s" alt=""></div>' : '') +
          '<div class="fiche-corps"><span class="etat' + (publie ? '' : ' etat-brouillon') + '">' + (publie ? 'En ligne depuis le ' + esc(dateCourte(a.publie_le)) : 'Brouillon, pas encore publié') + '</span>' +
          '<h2>' + esc(a.titre) + '</h2>' +
          '<button type="button" class="bouton bouton-plein" data-aller="article/' + encodeURIComponent(a.id) + '">' + (publie ? 'Modifier' : 'Relire et publier') + '</button></div>';
        liste.appendChild(f);
      });
    }).catch(function (e) { liste.innerHTML = '<p class="vide">' + esc(e.message) + '</p>'; });
  };

  ecrans.ecrire = function () {
    var form = ecran.querySelector('[data-form-ecrire]');
    var erreur = form.querySelector('[data-erreur]');
    var listeIdees = form.querySelector('[data-liste-idees]');
    var boutonIdees = form.querySelector('[data-idees]');
    var photo = zonePhoto(form, '');
    var choisie = '';
    function montrerErreur(t) { erreur.textContent = t; erreur.hidden = false; erreur.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    boutonIdees.onclick = function () {
      erreur.hidden = true;
      attendre('Je regarde ce que les gens se demandent en ce moment…');
      api('blog/idees', { method: 'POST', json: {} }).then(function (d) {
        fini();
        listeIdees.innerHTML = '';
        boutonIdees.textContent = 'Proposer d’autres idées';
        d.idees.forEach(function (idee) {
          var b = document.createElement('button');
          b.type = 'button'; b.className = 'idee'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', 'false');
          b.innerHTML = '<b>' + esc(idee.titre) + '</b><i>' + esc(idee.pourquoi) + '</i>';
          b.onclick = function () {
            choisie = idee.titre; form.sujet.value = idee.titre;
            listeIdees.querySelectorAll('.idee').forEach(function (x) { x.setAttribute('aria-checked', String(x === b)); });
          };
          listeIdees.appendChild(b);
        });
      }).catch(function (e) { fini(); montrerErreur(e.message); });
    };
    form.sujet.addEventListener('input', function () {
      if (form.sujet.value !== choisie) listeIdees.querySelectorAll('.idee').forEach(function (x) { x.setAttribute('aria-checked', 'false'); });
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      erreur.hidden = true;
      var sujet = form.sujet.value.trim();
      if (!sujet) { form.sujet.focus(); return montrerErreur('Choisis une idée ou écris ton sujet.'); }
      attendre('Préparation…');
      photo.envoyerSiBesoin().then(function (base) {
        voileTexte.textContent = 'Claude écrit ton brouillon. Ça prend environ une minute, garde l’appli ouverte.';
        return api('blog/rediger', { method: 'POST', json: { sujet: sujet, notes: form.notes.value, photo: base } });
      }).then(function (d) { fini(); location.replace('#article/' + encodeURIComponent(d.id)); })
        .catch(function (err) { fini(); montrerErreur(err.message); });
    });
  };

  ecrans.article = function (id) {
    var form = ecran.querySelector('[data-form-article]');
    var erreur = form.querySelector('[data-erreur]');
    var boutons = form.querySelector('[data-boutons]');
    var apercu = form.querySelector('[data-vue="apercu"]');
    var compte = form.querySelector('[data-compte-desc]');
    form.hidden = true;
    attendre('Chargement…');
    api('blog/' + encodeURIComponent(id)).then(function (d) {
      fini();
      var a = d.article;
      form.hidden = false;
      form.titre.value = a.titre; form.description.value = a.description || ''; form.corps.value = a.corps || '';
      var publie = a.statut === 'publie';
      form.querySelector('[data-etat-article]').textContent = publie ? 'En ligne depuis le ' + dateCourte(a.publie_le) + '. Tes changements s’affichent dès que tu enregistres.' : 'C’est un brouillon. Lis-le, corrige ce qui ne te ressemble pas, puis publie.';
      var photo = zonePhoto(form, a.photo);
      var retirer = form.querySelector('[data-retirer-photo]');
      retirer.hidden = !a.photo;
      photo.onChange = function () { retirer.hidden = false; };
      retirer.onclick = function () { photo.vider(); retirer.hidden = true; };
      function majCompte() { var n = form.description.value.length; compte.textContent = n + ' caractères' + (n < 110 ? ', un peu court' : n > 165 ? ', Google risque de couper la fin' : ', parfait'); }
      form.description.addEventListener('input', majCompte); majCompte();
      form.querySelectorAll('[data-onglet]').forEach(function (o) {
        o.onclick = function () {
          var vue = o.getAttribute('data-onglet');
          form.querySelectorAll('[data-onglet]').forEach(function (x) { x.setAttribute('aria-selected', String(x === o)); });
          form.querySelector('[data-vue="texte"]').hidden = vue !== 'texte';
          apercu.hidden = vue !== 'apercu';
          if (vue === 'apercu') apercu.innerHTML = '<h1>' + esc(form.titre.value) + '</h1>' + versHTML(form.corps.value);
        };
      });
      function enregistrer(statut, message) {
        erreur.hidden = true;
        if (!form.titre.value.trim()) { form.titre.focus(); erreur.textContent = 'Il manque un titre.'; erreur.hidden = false; return; }
        attendre('Enregistrement…');
        photo.envoyerSiBesoin().then(function (base) {
          voileTexte.textContent = 'Enregistrement…';
          return api('blog/' + encodeURIComponent(a.id), { method: 'PATCH', json: { titre: form.titre.value, description: form.description.value, corps: form.corps.value, photo: base, statut: statut } });
        }).then(function (r) {
          fini(); toast(message);
          if (statut === 'publie' && !publie) { afficherPublie(r.slug); return; }
          aller('blog');
        }).catch(function (e) { fini(); erreur.textContent = e.message; erreur.hidden = false; });
      }
      function afficherPublie(slug) {
        ecran.innerHTML = '';
        ecran.appendChild(document.getElementById('t-fini').content.cloneNode(true));
        ecran.querySelector('.sous').textContent = 'Ton conseil est sur la page Conseils du site. Google le découvrira dans les prochains jours.';
        var lien = ecran.querySelector('a.bouton'); lien.href = '/conseils/' + slug; lien.textContent = 'Le voir sur le site';
        var autre = ecran.querySelector('[data-aller="nouveau"]'); autre.setAttribute('data-aller', 'ecrire'); autre.textContent = 'Écrire un autre conseil';
        history.replaceState(null, '', '#fini');
      }
      var html = publie
        ? '<button type="button" class="bouton bouton-plein" data-b="maj">Enregistrer les changements</button><a class="bouton bouton-ligne" href="/conseils/' + esc(a.slug) + '" target="_blank" rel="noopener">Voir sur le site</a><button type="button" class="bouton bouton-ligne" data-b="retirer">Retirer du site</button>'
        : '<button type="button" class="bouton bouton-plein" data-b="publier">Publier sur le site</button><button type="button" class="bouton bouton-ligne" data-b="garder">Garder en brouillon</button>';
      boutons.innerHTML = html + '<button type="button" class="bouton bouton-danger" data-b="supprimer">Supprimer</button>';
      boutons.onclick = function (e) {
        var b = e.target.closest('[data-b]'); if (!b) return;
        var quoi = b.getAttribute('data-b');
        if (quoi === 'maj') enregistrer('publie', 'Conseil mis à jour sur le site');
        if (quoi === 'garder') enregistrer('brouillon', 'Brouillon enregistré');
        if (quoi === 'publier') confirmer('Publier ce conseil ?', 'Il sera visible par tout le monde sur le site. Tu pourras toujours le modifier ou le retirer.', 'Oui, publier', true).then(function (oui) { if (oui) enregistrer('publie', 'Conseil publié'); });
        if (quoi === 'retirer') enregistrer('brouillon', 'Conseil retiré du site, il reste en brouillon');
        if (quoi === 'supprimer') confirmer('Supprimer ce conseil ?', 'Il sera effacé pour de bon, avec sa photo.', 'Oui, supprimer').then(function (oui) {
          if (!oui) return;
          attendre('Suppression…');
          api('blog/' + encodeURIComponent(a.id), { method: 'DELETE' }).then(function () { fini(); toast('Conseil supprimé'); aller('blog'); }).catch(function (e2) { fini(); toast(e2.message); });
        });
      };
    }).catch(function (e) { fini(); toast(e.message); aller('blog'); });
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
