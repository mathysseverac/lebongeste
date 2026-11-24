/* Le bon geste : « Une journée avec Sylvain »
   Calcule l'avancée du scroll (0 à 1) dans chaque chapitre et anime la scène.
   Si l'appareil demande moins d'animations, tout s'affiche à l'état final. */
(function () {
  var root = document.documentElement;
  var calme = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (calme) root.classList.add('calme');

  var chaps = [].slice.call(document.querySelectorAll('[data-chap]'));
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var plage = function (p, a, b) { return clamp((p - a) / (b - a), 0, 1); };
  var doux = function (t) { return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };

  // couleurs du ciel au fil de la journée
  var ciel = [[0, [223, 241, 244]], [.35, [196, 230, 240]], [.62, [214, 236, 240]], [.8, [246, 205, 150]], [.9, [52, 74, 92]], [1, [8, 38, 46]]];
  function couleur(g) {
    for (var i = 1; i < ciel.length; i++) {
      if (g <= ciel[i][0]) {
        var a = ciel[i - 1], b = ciel[i], t = (g - a[0]) / (b[0] - a[0]);
        return 'rgb(' + a[1].map(function (c, k) { return Math.round(c + (b[1][k] - c) * t); }).join(',') + ')';
      }
    }
    return 'rgb(8,38,46)';
  }

  function progression(el) {
    if (calme) return 1;
    var r = el.getBoundingClientRect();
    var course = el.offsetHeight - window.innerHeight;
    if (course <= 0) return clamp(1 - r.top / window.innerHeight, 0, 1);
    return clamp(-r.top / course, 0, 1);
  }

  function anime(chap, p, r) {
    // texte qui arrive au début du chapitre
    var entree = r ? 1 - r.top / window.innerHeight : 1;
    var t = (calme || chap.classList.contains('soir')) ? 1 : plage(entree, .25, .8);
    chap.style.setProperty('--txt-o', t);
    chap.style.setProperty('--txt-y', ((1 - t) * 24) + 'px');

    // Sylvain qui avance + ce qu'il nettoie derrière lui
    chap.querySelectorAll('[data-move]').forEach(function (g) {
      var q = doux(plage(p, .08, .92));
      var from = +g.dataset.from, to = +g.dataset.to;
      var x = from + (to - from) * q;
      g.setAttribute('transform', 'translate(' + x.toFixed(1) + ' 480)');
      var coupe = x + (+g.dataset.off || 0);
      if (g.dataset.cut) {
        var r = document.getElementById(g.dataset.cut);
        if (r) r.setAttribute('x', coupe.toFixed(1));
      }
      if (g.dataset.mousse) {
        chap.querySelectorAll('.mousse').forEach(function (m) {
          m.style.opacity = (1 - clamp((coupe - (+m.dataset.mx)) / 50, 0, 1)) * .9;
        });
      }
    });

    // étapes : glisser, tomber, apparaître, grandir
    chap.querySelectorAll('.etape').forEach(function (e) {
      var q = doux(plage(p, +e.dataset.a, +e.dataset.b));
      var tr = '';
      if (e.dataset.tx) tr += 'translateX(' + ((1 - q) * e.dataset.tx) + 'px) ';
      if (e.dataset.ty) tr += 'translateY(' + ((1 - q) * e.dataset.ty) + 'px) ';
      if (e.dataset.s) tr += 'scale(' + q + ') ';
      e.style.transform = tr;
      if (e.dataset.o || e.dataset.ty || e.dataset.tx || e.dataset.s) e.style.opacity = e.dataset.o ? q : (q > 0 ? 1 : 0);
    });

    // la porte qui s'ouvre, puis on entre
    if (chap.id === 'porte') {
      var ouvre = doux(plage(p, .08, .38)), entre = plage(p, .42, .96);
      var battant = chap.querySelector('.battant'), facade = chap.querySelector('.facade');
      if (battant) battant.style.transform = 'scaleX(' + (1 - .88 * ouvre) + ')';
      if (facade) facade.style.transform = 'scale(' + (1 + 13 * Math.pow(entre, 2.2)) + ')';
      chap.style.setProperty('--fondu', plage(p, .8, .97));
      var part = 1 - plage(p, .4, .52);
      chap.style.setProperty('--txt-o', Math.min(t, part));
    }

    // l'avant / après qui se dévoile
    var ba = chap.querySelector('[data-ba-scroll]');
    if (ba) ba.style.setProperty('--cache', (doux(plage(p, .15, .85)) * 100) + '%');
  }

  var attente = false, minuteur;
  function maj() {
    attente = false;
    var max = document.documentElement.scrollHeight - window.innerHeight;
    var g = calme ? .3 : clamp(window.scrollY / Math.max(1, max), 0, 1);
    root.style.setProperty('--ciel', couleur(g));
    root.style.setProperty('--nuit-op', plage(g, .86, .98));
    // le soleil traverse le ciel puis se couche
    var w = window.innerWidth, h = window.innerHeight;
    var sx = w * (w < 860 ? (.62 + .26 * g) : (.62 + .3 * g));
    var base = w < 860 ? .43 : .3, haut = w < 860 ? .05 : .18;
    var sy = h * (base - Math.sin(Math.PI * Math.min(g, .82) / .82) * haut) + h * Math.max(0, g - .78) * 4;
    root.style.setProperty('--sx', sx.toFixed(0) + 'px');
    root.style.setProperty('--sy', sy.toFixed(0) + 'px');
    chaps.forEach(function (c) {
      var r = c.getBoundingClientRect();
      if (r.bottom < -50 || r.top > h + 50) return;
      anime(c, progression(c), r);
    });
  }
  function auScroll() {
    if (!calme) {
      root.classList.add('bouge');
      clearTimeout(minuteur);
      minuteur = setTimeout(function () { root.classList.remove('bouge'); }, 160);
    }
    if (!attente) { attente = true; requestAnimationFrame(maj); }
  }
  window.addEventListener('scroll', auScroll, { passive: true });
  window.addEventListener('resize', auScroll);
  if (calme) chaps.forEach(function (c) { anime(c, 1); });
  maj();
})();
