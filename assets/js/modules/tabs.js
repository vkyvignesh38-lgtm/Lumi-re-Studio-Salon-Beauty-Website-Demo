/* WAI-ARIA tabs (automatic activation) with arrow/Home/End keys and #hash deep links. */
(function (Lumiere) {
  'use strict';

  var u = Lumiere.util;

  function Tabs(root) {
    this.tabs = u.$$('[role="tab"]', root);
    this.panels = this.tabs.map(function (tab) { return document.getElementById(tab.getAttribute('aria-controls')); });
    var self = this;

    this.tabs.forEach(function (tab, index) {
      tab.addEventListener('click', function () { self.select(index, false); });
      tab.addEventListener('keydown', function (event) {
        var next = null;
        if (event.key === 'ArrowRight') next = (index + 1) % self.tabs.length;
        else if (event.key === 'ArrowLeft') next = (index - 1 + self.tabs.length) % self.tabs.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = self.tabs.length - 1;
        if (next === null) return;
        event.preventDefault();
        self.select(next, true);
      });
    });

    this.selectFromHash();
    window.addEventListener('hashchange', function () { self.selectFromHash(); });
  }

  Tabs.prototype.selectFromHash = function () {
    var hash = window.location.hash.slice(1);
    var index = this.tabs.findIndex(function (tab) { return tab.id === 'tab-' + hash; });
    if (index > -1) this.select(index, false);
  };

  Tabs.prototype.select = function (index, focus) {
    this.tabs.forEach(function (tab, i) {
      var active = i === index;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    this.panels.forEach(function (panel, i) { if (panel) panel.hidden = i !== index; });
    if (focus) this.tabs[index].focus();
    this.tabs[index].scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (history.replaceState) history.replaceState(null, '', '#' + this.tabs[index].id.replace(/^tab-/, ''));
  };

  Lumiere.modules.tabs = {
    init: function () {
      u.$$('[data-tabs]').forEach(function (root) { new Tabs(root); });
    }
  };
})(window.Lumiere);
