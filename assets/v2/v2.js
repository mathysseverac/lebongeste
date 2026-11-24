/* Accueil v2 : les blocs apparaissent doucement quand on arrive dessus. Le texte de la une est visible tout de suite. */
(function(){
  if (!('IntersectionObserver' in window)) return;
  document.documentElement.classList.add('js');
  var cibles = document.querySelectorAll('.liste li, .paire, .moitie-in, .etapes li, .numero');
  var io = new IntersectionObserver(function(entrees){
    entrees.forEach(function(e){ if (e.isIntersecting){ e.target.classList.add('vu'); io.unobserve(e.target); } });
  }, {rootMargin:'0px 0px -8% 0px'});
  cibles.forEach(function(c){ c.classList.add('apparait'); io.observe(c); });
})();
