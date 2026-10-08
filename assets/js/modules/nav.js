/* Sticky header state, accessible mobile menu and smooth in-page scrolling. */
(function (Lumiere) {
  'use strict';

  var u = Lumiere.util;
  var DESKTOP = window.matchMedia('(min-width: 1280px)');

  function initHeader() {
    var header = u.$('[data-header]');
    if (!header) return;
    var ticking = false;
    function update() {
      header.classList.toggle('is-scrolled', window.scrollY > 8);
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { window.requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
    update();
  }

  function initMenu() {
    var toggle = u.$('[data-menu-toggle]');
    var menu = u.$('[data-menu]');
    var header = u.$('[data-header]');
    if (!toggle || !menu || !header) return;

    var releaseTrap = null;

    function isOpen() { return toggle.getAttribute('aria-expanded') === 'true'; }

    function open() {
      var bottom = header.getBoundingClientRect().bottom;
      menu.style.setProperty('--menu-max', (window.innerHeight - bottom) + 'px');
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', 'Close menu');
      menu.classList.add('is-open');
      document.body.classList.add('menu-open');
      releaseTrap = u.trapFocus(header);
      var first = u.focusable(menu)[0];
      if (first) first.focus();
    }

    function close(returnFocus) {
      if (!isOpen()) return;
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Open menu');
      menu.classList.remove('is-open');
      document.body.classList.remove('menu-open');
      if (releaseTrap) { releaseTrap(); releaseTrap = null; }
      if (returnFocus) toggle.focus();
    }

    toggle.addEventListener('click', function () {
      if (isOpen()) close(false); else open();
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && isOpen()) {
        event.preventDefault();
        close(true);
      }
    });

    // Clicking any link inside the menu closes it.
    menu.addEventListener('click', function (event) {
      if (event.target.closest('a')) close(false);
    });

    // Clicking the dimmed page outside the header closes it.
    document.addEventListener('click', function (event) {
      if (isOpen() && !header.contains(event.target)) close(false);
    });

    function onBreakpoint() { if (DESKTOP.matches) close(false); }
    if (DESKTOP.addEventListener) DESKTOP.addEventListener('change', onBreakpoint);
    else if (DESKTOP.addListener) DESKTOP.addListener(onBreakpoint);
  }

  function initSmoothScroll() {
    document.addEventListener('click', function (event) {
      var link = event.target.closest('a[href^="#"]');
      if (!link) return;
      var id = link.getAttribute('href').slice(1);
      if (!id) return;
      var target = document.getElementById(id);
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: u.prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
      if (history.replaceState) history.replaceState(null, '', '#' + id);
    });
  }

  Lumiere.modules.nav = {
    init: function () {
      initHeader();
      initMenu();
      initSmoothScroll();
    }
  };
})(window.Lumiere);
