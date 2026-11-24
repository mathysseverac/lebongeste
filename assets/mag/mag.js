/* Version magazine : mois en cours, avant / après, apparition douce des images. */
(function () {
  // le mois en cours est mis en avant dans le calendrier
  var mois = document.querySelectorAll('[data-mois] li');
  if (mois.length === 12) mois[new Date().getMonth()].classList.add('maintenant');

  // avant / après
  document.querySelectorAll('[data-ba]').forEach(function (ba) {
    var photos = ba.querySelector('.ba-photos');
    ba.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () {
        photos.dataset.etat = b.dataset.etat;
        ba.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      });
    });
  });

  // les images arrivent doucement quand on descend
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
  document.documentElement.classList.add('js');
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('vu'); io.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('.planche, .ba-photos, .carte, .mois li, .temps li').forEach(function (el, i) {
    el.classList.add('monte'); el.style.transitionDelay = (i % 4) * 70 + 'ms'; io.observe(el);
  });
})();
