/* Nouvel accueil : avant / après, compteur des 50 %, apparitions et léger parallaxe. */
(function () {
  var calme = matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.querySelectorAll('[data-ba]').forEach(function (ba) {
    var r = ba.querySelector('input');
    var maj = function () { ba.style.setProperty('--x', r.value + '%'); };
    r.addEventListener('input', maj); maj();
  });

  if (calme || !('IntersectionObserver' in window)) return;
  document.documentElement.classList.add('js');

  // le 50 compte depuis 0 quand on arrive dessus
  var compte = document.querySelector('[data-compte]');
  if (compte) {
    var vu = false;
    new IntersectionObserver(function (es, o) {
      if (!es[0].isIntersecting || vu) return; vu = true; o.disconnect();
      var fin = +compte.dataset.compte, t0 = performance.now();
      (function pas(t) {
        var k = Math.min(1, (t - t0) / 1100), e = 1 - Math.pow(1 - k, 3);
        compte.textContent = Math.round(fin * e);
        if (k < 1) requestAnimationFrame(pas);
      })(t0);
    }, { threshold: .5 }).observe(compte);
    compte.textContent = '0';
  }

  // les blocs apparaissent doucement
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('vu'); io.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('.bloc-tete, .tuile, .carte, .ba, .moitie, .etapes li, .zone > *').forEach(function (el, i) {
    el.classList.add('apparait'); el.style.transitionDelay = (i % 3) * 80 + 'ms'; io.observe(el);
  });

  // parallaxe léger : la photo du haut et les colonnes de la mosaïque
  var photo = document.querySelector('[data-glisse]');
  var cols = [].slice.call(document.querySelectorAll('[data-vitesse]'));
  var attente = false;
  function maj() {
    attente = false;
    var h = innerHeight;
    if (photo) {
      var r = photo.parentElement.getBoundingClientRect();
      if (r.bottom > 0) photo.style.transform = 'translateY(' + (-Math.min(1, Math.max(0, -r.top / r.height)) * 10) + '%)';
    }
    if (innerWidth >= 800) cols.forEach(function (c) {
      var v = +c.dataset.vitesse; if (!v) return;
      var r = c.getBoundingClientRect();
      var d = Math.max(-45, Math.min(45, (r.top + r.height / 2 - h / 2) * v));
      c.style.transform = 'translateY(' + d.toFixed(1) + 'px)';
    });
  }
  addEventListener('scroll', function () { if (!attente) { attente = true; requestAnimationFrame(maj); } }, { passive: true });
  maj();
})();
