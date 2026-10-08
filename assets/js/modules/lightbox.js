/* Accessible gallery lightbox built on <dialog>.
   Open / close / previous / next, keyboard (←, →, Home, End, Esc), touch swipe,
   respects the active gallery filter, and returns focus to the opening thumbnail. */
(function (Lumiere) {
  'use strict';

  var u = Lumiere.util;
  var SWIPE_THRESHOLD = 50;

  function Lightbox(dialog) {
    this.dialog = dialog;
    this.img = u.$('[data-lb-img]', dialog);
    this.caption = u.$('[data-lb-caption]', dialog);
    this.category = u.$('[data-lb-category]', dialog);
    this.counter = u.$('[data-lb-counter]', dialog);
    this.stage = u.$('[data-lb-stage]', dialog);
    this.links = [];
    this.index = 0;
    this.trigger = null;
    this.releaseTrap = null;
    this.bind();
  }

  Lightbox.prototype.visibleLinks = function () {
    return u.$$('[data-lightbox]').filter(function (link) {
      var item = link.closest('[data-item]');
      return !item || !item.hidden;
    });
  };

  Lightbox.prototype.bind = function () {
    var self = this;

    document.addEventListener('click', function (event) {
      var link = event.target.closest('[data-lightbox]');
      if (!link) return;
      event.preventDefault();
      self.open(link);
    });

    u.$('[data-lb-close]', this.dialog).addEventListener('click', function () { self.close(); });
    u.$('[data-lb-prev]', this.dialog).addEventListener('click', function () { self.step(-1); });
    u.$('[data-lb-next]', this.dialog).addEventListener('click', function () { self.step(1); });

    this.dialog.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowLeft') { event.preventDefault(); self.step(-1); }
      else if (event.key === 'ArrowRight') { event.preventDefault(); self.step(1); }
      else if (event.key === 'Home') { event.preventDefault(); self.show(0); }
      else if (event.key === 'End') { event.preventDefault(); self.show(self.links.length - 1); }
    });

    // Native Esc fires "cancel"; route it through close() so focus is restored.
    this.dialog.addEventListener('cancel', function (event) { event.preventDefault(); self.close(); });

    // Clicking the dark area around the photo closes the lightbox.
    this.stage.addEventListener('click', function (event) {
      if (event.target === self.stage) self.close();
    });

    // Touch swipe
    var startX = 0;
    var startY = 0;
    var tracking = false;
    this.stage.addEventListener('touchstart', function (event) {
      if (event.touches.length !== 1) { tracking = false; return; }
      tracking = true;
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
    }, { passive: true });
    this.stage.addEventListener('touchend', function (event) {
      if (!tracking) return;
      tracking = false;
      var dx = event.changedTouches[0].clientX - startX;
      var dy = event.changedTouches[0].clientY - startY;
      if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.2) self.step(dx < 0 ? 1 : -1);
    }, { passive: true });
  };

  Lightbox.prototype.open = function (link) {
    this.links = this.visibleLinks();
    this.trigger = link;
    var index = this.links.indexOf(link);
    this.show(index > -1 ? index : 0);
    if (typeof this.dialog.showModal === 'function') this.dialog.showModal();
    else this.dialog.setAttribute('open', '');
    document.body.classList.add('is-locked');
    this.releaseTrap = u.trapFocus(this.dialog);
    u.$('[data-lb-close]', this.dialog).focus();
  };

  Lightbox.prototype.close = function () {
    if (typeof this.dialog.close === 'function') this.dialog.close();
    else this.dialog.removeAttribute('open');
    document.body.classList.remove('is-locked');
    if (this.releaseTrap) { this.releaseTrap(); this.releaseTrap = null; }
    if (this.trigger) this.trigger.focus();
  };

  Lightbox.prototype.step = function (delta) {
    if (!this.links.length) return;
    this.show((this.index + delta + this.links.length) % this.links.length);
  };

  Lightbox.prototype.show = function (index) {
    var link = this.links[index];
    if (!link) return;
    this.index = index;
    var img = this.img;
    img.classList.add('is-loading');
    img.onload = function () { img.classList.remove('is-loading'); };
    img.width = Number(link.getAttribute('data-width')) || img.width;
    img.height = Number(link.getAttribute('data-height')) || img.height;
    img.src = link.getAttribute('data-full');
    img.alt = link.getAttribute('data-alt') || '';
    if (img.complete) img.classList.remove('is-loading');

    this.caption.textContent = link.getAttribute('data-caption') || '';
    var cat = link.querySelector('.gallery__cat');
    this.category.textContent = cat ? cat.textContent : '';
    this.counter.textContent = (index + 1) + ' / ' + this.links.length;
    this.preload(index + 1);
    this.preload(index - 1);
  };

  Lightbox.prototype.preload = function (index) {
    var link = this.links[(index + this.links.length) % this.links.length];
    if (link) { var pre = new Image(); pre.src = link.getAttribute('data-full'); }
  };

  Lumiere.modules.lightbox = {
    init: function () {
      var dialog = u.$('[data-lightbox-dialog]');
      if (dialog) new Lightbox(dialog);
    }
  };
})(window.Lumiere);
