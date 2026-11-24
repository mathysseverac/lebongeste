(function(){
  var calme=matchMedia('(prefers-reduced-motion: reduce)').matches;
  var plans=[].slice.call(document.querySelectorAll('[data-plan]'));
  var root=document.documentElement, heure=document.querySelector('[data-heure]');
  var c=function(v){return Math.max(0,Math.min(1,v))};
  function maj(){
    var h=innerHeight, max=root.scrollHeight-h, g=calme?1:c(scrollY/Math.max(1,max));
    root.style.setProperty('--g',g);
    var m=Math.round((8.5+g*10.5)*60/15)*15; heure.textContent=Math.floor(m/60)+' h '+String(m%60).padStart(2,'0');
    plans.forEach(function(s){
      var r=s.getBoundingClientRect(); if(r.bottom<-h||r.top>2*h)return;
      var course=s.offsetHeight-h, p=calme?1:c(-r.top/Math.max(1,course));
      s.style.setProperty('--p',p);
      if(s.dataset.fondu){var f=s.dataset.fondu.split(',');s.style.setProperty('--fondu',c((p-f[0])/(f[1]-f[0])));}
      s.querySelectorAll('[data-a]').forEach(function(e){
        var o=c((p-e.dataset.a)/(e.dataset.b-e.dataset.a));
        if(e.dataset.z&&p>+e.dataset.z)o=c(1-(p-e.dataset.z)/.08);
        if(calme)o=1;
        e.style.setProperty('--o',o);
      });
    });
  }
  var att=false;addEventListener('scroll',function(){if(!att){att=true;requestAnimationFrame(function(){att=false;maj()})}},{passive:true});
  addEventListener('resize',maj);maj();
})();
