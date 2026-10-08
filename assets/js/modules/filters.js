/* Generic chip filtering used by Services (category + audience) and Gallery (category).
   Markup contract:
     [data-filterable]            wrapper
       [data-filter-category="x"] / [data-filter-audience="x"]  toggle buttons (aria-pressed)
       [data-item data-category data-audience]                  filterable items
       [data-filter-count]        live result count (optional)
       [data-filter-empty]        empty state (optional)
   URL params ?category=…&audience=… preselect filters. */
(function (Lumiere) {
  'use strict';

  var u = Lumiere.util;
  var DIMENSIONS = ['category', 'audience'];

  function Filterable(root) {
    this.root = root;
    this.items = u.$$('[data-item]', root);
    this.count = u.$('[data-filter-count]', root);
    this.empty = u.$('[data-filter-empty]', root);
    this.noun = root.getAttribute('data-filter-noun') || 'items';
    this.state = {};

    var self = this;
    DIMENSIONS.forEach(function (dim) {
      var buttons = u.$$('[data-filter-' + dim + ']', root);
      if (!buttons.length) return;
      self.state[dim] = 'all';
      buttons.forEach(function (btn) {
        btn.addEventListener('click', function () {
          self.set(dim, btn.getAttribute('data-filter-' + dim), true);
        });
      });
    });

    var params = new URLSearchParams(window.location.search);
    DIMENSIONS.forEach(function (dim) {
      var value = params.get(dim);
      if (value && dim in self.state && u.$('[data-filter-' + dim + '="' + CSS.escape(value) + '"]', root)) {
        self.set(dim, value, false);
      }
    });
    this.apply(false);
  }

  Filterable.prototype.set = function (dim, value, announce) {
    this.state[dim] = value;
    u.$$('[data-filter-' + dim + ']', this.root).forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(btn.getAttribute('data-filter-' + dim) === value));
    });
    this.apply(announce);
    this.syncUrl();
  };

  Filterable.prototype.matches = function (item) {
    var state = this.state;
    return Object.keys(state).every(function (dim) {
      var value = state[dim];
      if (value === 'all') return true;
      if (dim === 'audience' && value !== 'unisex') {
        // Women/Men views also show unisex services, since those are for everyone.
        var aud = item.getAttribute('data-audience');
        return aud === value || aud === 'unisex';
      }
      return item.getAttribute('data-' + dim) === value;
    });
  };

  Filterable.prototype.apply = function (announce) {
    var visible = 0;
    var self = this;
    this.items.forEach(function (item) {
      var show = self.matches(item);
      item.hidden = !show;
      if (show) visible += 1;
    });
    if (this.count) {
      // The count is a polite live region; only announce changes the user made.
      this.count.setAttribute('aria-live', announce ? 'polite' : 'off');
      this.count.textContent = 'Showing ' + visible + ' of ' + this.items.length + ' ' + this.noun;
    }
    if (this.empty) this.empty.hidden = visible !== 0;
    this.root.dispatchEvent(new CustomEvent('lumiere:filtered', { bubbles: true, detail: { visible: visible } }));
  };

  Filterable.prototype.syncUrl = function () {
    if (!history.replaceState) return;
    var params = new URLSearchParams(window.location.search);
    var state = this.state;
    Object.keys(state).forEach(function (dim) {
      if (state[dim] === 'all') params.delete(dim); else params.set(dim, state[dim]);
    });
    var query = params.toString();
    history.replaceState(null, '', window.location.pathname + (query ? '?' + query : '') + window.location.hash);
  };

  Lumiere.modules.filters = {
    init: function () {
      u.$$('[data-filterable]').forEach(function (root) { new Filterable(root); });
    }
  };
})(window.Lumiere);
