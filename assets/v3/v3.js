/* Accueil v3 : parallaxe léger, photos qui se dévoilent, avant / après à glisser. */
(function () {
  var calme = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var doc = document.documentElement;

  // avant / après : le curseur suit le doigt ou la souris
  document.querySelectorAll('[data-ba]').forEach(function (ba) {
    var r = ba.querySelector('input');
    var maj = function () { ba.style.setProperty('--x', r.value + '%'); };
    r.addEventListener('input', maj); maj();
  });

  if (calme) return;
  doc.classList.add('js');

  // les photos se dévoilent quand on arrive dessus
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('vu'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -10% 0px' });
    document.querySelectorAll('.tuile, .bande li, .ba').forEach(function (el, i) {
      el.classList.add('revele'); el.style.transitionDelay = (i % 3) * 90 + 'ms'; io.observe(el);
    });
  }

  // parallaxe : chaque bloc glisse un peu moins vite que la page
  var px = [].slice.call(document.querySelectorAll('[data-px]'));
  var attente = false;
  function maj() {
    attente = false;
    var h = innerHeight;
    px.forEach(function (el) {
      var v = parseFloat(el.dataset.px); if (!v) return;
      if (el.classList.contains('col') && innerWidth < 800) { el.style.transform = ''; return; }
      var r = el.parentElement.getBoundingClientRect();
      if (r.bottom < -h || r.top > 2 * h) return;
      var centre = (r.top + r.height / 2 - h / 2) / h;
      if (el.classList.contains('col')) el.style.transform = 'translate3d(0,' + (centre * v * -h * .6).toFixed(1) + 'px,0)';
      else el.style.transform = 'translate3d(0,' + (centre * v * -60).toFixed(1) + '%,0)';
    });
  }
  addEventListener('scroll', function () { if (!attente) { attente = true; requestAnimationFrame(maj); } }, { passive: true });
  addEventListener('resize', maj); maj();
})();
