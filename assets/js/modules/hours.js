/* "Open today" status (studio time, Asia/Kolkata) and today's row in hours lists. */
(function (Lumiere) {
  'use strict';

  var u = Lumiere.util;

  function statusText(now) {
    var hours = u.hoursFor(now.isSunday);
    if (now.minutes < hours.open) return 'Opens at ' + u.formatTime(hours.open);
    if (now.minutes < hours.close) return 'Open now · until ' + u.formatTime(hours.close);
    return 'Closed now · opens tomorrow 10:00 AM';
  }

  Lumiere.modules.hours = {
    init: function () {
      var now = u.studioNow();
      var hours = u.hoursFor(now.isSunday);

      u.$$('[data-open-today]').forEach(function (card) {
        var time = u.$('[data-open-time]', card);
        var status = u.$('[data-open-status]', card);
        if (time) time.textContent = u.formatTime(hours.open) + ' – ' + u.formatTime(hours.close);
        if (status) status.textContent = statusText(now);
        card.classList.toggle('is-closed', now.minutes < hours.open || now.minutes >= hours.close);
      });

      u.$$('[data-hours-today] .hours__row').forEach(function (row, i) {
        var isToday = now.isSunday ? i === 1 : i === 0;
        if (!isToday) return;
        row.classList.add('is-today');
        var dt = u.$('dt', row);
        if (dt) dt.insertAdjacentHTML('beforeend', ' <span class="tag">Today</span>');
      });
    }
  };
})(window.Lumiere);
