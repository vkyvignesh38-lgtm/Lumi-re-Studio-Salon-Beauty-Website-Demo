/* Lumière Studio — entry point. Starts every module loaded on the page,
   then sets up scroll-reveal animations. */
(function (Lumiere) {
  'use strict';

  var u = Lumiere.util;

  function initReveal() {
    var items = u.$$('.reveal');
    if (!items.length) return;
    if (u.prefersReducedMotion() || !('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }
    // Anything already on screen is shown immediately to avoid a flash.
    items.forEach(function (el) {
      if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add('is-visible');
    });
    document.documentElement.classList.add('js');
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    items.forEach(function (el) { if (!el.classList.contains('is-visible')) observer.observe(el); });
  }

  function start() {
    Object.keys(Lumiere.modules).forEach(function (name) {
      try {
        Lumiere.modules[name].init();
      } catch (error) {
        if (window.console) console.error('[Lumière] module "' + name + '" failed to start', error);
      }
    });
    initReveal();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(window.Lumiere);
