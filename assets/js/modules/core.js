/* Lumière Studio — core helpers shared by all modules.
   Every module registers itself on window.Lumiere.modules and is started by main.js. */
(function (global) {
  'use strict';

  var Lumiere = global.Lumiere || (global.Lumiere = {});
  Lumiere.modules = Lumiere.modules || {};

  var FOCUSABLE = [
    'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  var reducedMotionQuery = global.matchMedia ? global.matchMedia('(prefers-reduced-motion: reduce)') : null;

  Lumiere.util = {
    $: function (selector, scope) { return (scope || document).querySelector(selector); },
    $$: function (selector, scope) { return Array.prototype.slice.call((scope || document).querySelectorAll(selector)); },

    prefersReducedMotion: function () { return !!(reducedMotionQuery && reducedMotionQuery.matches); },

    focusable: function (scope) {
      return Lumiere.util.$$(FOCUSABLE, scope).filter(function (el) {
        return el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0;
      });
    },

    /** Keep Tab / Shift+Tab inside `container`. Returns a cleanup function. */
    trapFocus: function (container) {
      function onKeydown(event) {
        if (event.key !== 'Tab') return;
        var items = Lumiere.util.focusable(container);
        if (!items.length) return;
        var first = items[0];
        var last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
      container.addEventListener('keydown', onKeydown);
      return function () { container.removeEventListener('keydown', onKeydown); };
    },

    /** ₹ with Indian digit grouping (15000 → ₹15,000). */
    formatINR: function (amount) {
      return '₹' + Number(amount).toLocaleString('en-IN');
    },

    /** Current date/time parts in the studio's time zone (Asia/Kolkata). */
    studioNow: function () {
      var parts = {};
      try {
        new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
          weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
        }).formatToParts(new Date()).forEach(function (p) { parts[p.type] = p.value; });
      } catch (e) {
        var d = new Date();
        parts = {
          year: String(d.getFullYear()), month: ('0' + (d.getMonth() + 1)).slice(-2), day: ('0' + d.getDate()).slice(-2),
          weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()],
          hour: String(d.getHours()), minute: String(d.getMinutes())
        };
      }
      return {
        isoDate: parts.year + '-' + parts.month + '-' + parts.day,
        isSunday: parts.weekday === 'Sun',
        minutes: parseInt(parts.hour, 10) * 60 + parseInt(parts.minute, 10)
      };
    },

    /** Studio hours in minutes from midnight. Sunday closes earlier. */
    hoursFor: function (isSunday) {
      return { open: 10 * 60, close: isSunday ? 18 * 60 : 20 * 60 };
    },

    formatTime: function (minutes) {
      var h = Math.floor(minutes / 60);
      var m = minutes % 60;
      var suffix = h >= 12 ? 'PM' : 'AM';
      var h12 = h % 12 === 0 ? 12 : h % 12;
      return (h12 < 10 ? '0' : '') + h12 + ':' + (m < 10 ? '0' : '') + m + ' ' + suffix;
    }
  };
})(window);
