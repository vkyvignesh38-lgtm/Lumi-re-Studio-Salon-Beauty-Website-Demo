/* Appointment request form (demo only — nothing is sent or stored).
   - Customer type filters the service list (data from #services-data)
   - ?service=<id> preselects customer type + service
   - Time slots follow studio hours (Sunday closes 6 PM) and skip past slots today
   - Accessible validation: inline errors, aria-invalid, error summary
   - Success view builds WhatsApp + email links from the request */
(function (Lumiere) {
  'use strict';

  var u = Lumiere.util;
  var SLOT_MINUTES = 30;
  var LAST_SLOT_BEFORE_CLOSE = 60; // last start time is 1 hour before closing
  var MAX_DAYS_AHEAD = 90;
  var AUDIENCE_LABELS = { women: 'Women', men: 'Men', unisex: 'Unisex' };

  function addDays(isoDate, days) {
    var d = new Date(isoDate + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  function readableDate(isoDate) {
    var d = new Date(isoDate + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  function isSunday(isoDate) { return new Date(isoDate + 'T00:00:00').getDay() === 0; }

  function AppointmentForm(form) {
    this.form = form;
    this.data = JSON.parse(u.$('#services-data').textContent);
    this.byId = {};
    var self = this;
    this.data.services.forEach(function (s) { self.byId[s.id] = s; });

    this.fields = {
      name: form.elements.name,
      phone: form.elements.phone,
      email: form.elements.email,
      service: form.elements.service,
      date: form.elements.date,
      time: form.elements.time,
      message: form.elements.message
    };
    this.typeGroup = u.$('[data-customer-type]', form);
    this.typeInputs = u.$$('input[name="customerType"]', form);
    this.serviceHint = u.$('#service-hint', form);
    this.summary = u.$('[data-error-summary]', form);
    this.success = u.$('[data-success]');
    this.touched = {};

    this.today = u.studioNow();
    this.fields.date.min = this.today.isoDate;
    this.fields.date.max = addDays(this.today.isoDate, MAX_DAYS_AHEAD);

    this.renderServices(null);
    this.renderTimes();
    this.bind();
    this.preselect();
  }

  /* ---------- dynamic selects ---------- */

  AppointmentForm.prototype.renderServices = function (type) {
    var select = this.fields.service;
    var previous = select.value;
    select.innerHTML = '';

    var placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = type ? 'Select a service' : 'Choose a customer type first';
    select.appendChild(placeholder);

    if (!type) {
      select.disabled = true;
      this.serviceHint.textContent = 'Services are filtered by customer type.';
      return;
    }

    var groups = type === 'unisex' ? ['unisex'] : [type, 'unisex'];
    var self = this;
    groups.forEach(function (aud) {
      var group = document.createElement('optgroup');
      group.label = aud === 'unisex' && type !== 'unisex' ? 'Unisex services' : AUDIENCE_LABELS[aud] + ' services';
      self.data.services.filter(function (s) { return s.audience === aud; }).forEach(function (s) {
        var opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.name + ' — from ' + u.formatINR(s.price) + ' · ' + s.duration;
        group.appendChild(opt);
      });
      select.appendChild(group);
    });

    select.disabled = false;
    var count = select.querySelectorAll('option[value]:not([value=""])').length;
    this.serviceHint.textContent = count + ' services available for ' + AUDIENCE_LABELS[type].toLowerCase() +
      (type === 'unisex' ? '.' : ', including unisex services.');
    if (previous && select.querySelector('option[value="' + CSS.escape(previous) + '"]')) select.value = previous;
  };

  AppointmentForm.prototype.renderTimes = function () {
    var select = this.fields.time;
    var date = this.fields.date.value;
    var previous = select.value;
    select.innerHTML = '';

    var placeholder = document.createElement('option');
    placeholder.value = '';
    select.appendChild(placeholder);

    if (!date) {
      placeholder.textContent = 'Choose a date first';
      select.disabled = true;
      return;
    }

    var hours = u.hoursFor(isSunday(date));
    var earliest = hours.open;
    if (date === this.today.isoDate) {
      // Leave at least an hour's notice for same-day requests.
      earliest = Math.max(hours.open, Math.ceil((this.today.minutes + 60) / SLOT_MINUTES) * SLOT_MINUTES);
    }
    var added = 0;
    for (var m = earliest; m <= hours.close - LAST_SLOT_BEFORE_CLOSE; m += SLOT_MINUTES) {
      var opt = document.createElement('option');
      opt.value = u.formatTime(m);
      opt.textContent = u.formatTime(m);
      select.appendChild(opt);
      added += 1;
    }
    placeholder.textContent = added ? 'Select a time' : 'No times left today — pick another date';
    select.disabled = added === 0;
    if (previous && select.querySelector('option[value="' + CSS.escape(previous) + '"]')) select.value = previous;
  };

  AppointmentForm.prototype.selectedType = function () {
    var checked = this.typeInputs.filter(function (i) { return i.checked; })[0];
    return checked ? checked.value : '';
  };

  AppointmentForm.prototype.preselect = function () {
    var id = new URLSearchParams(window.location.search).get('service');
    var service = id && this.byId[id];
    if (!service) return;
    this.typeInputs.forEach(function (input) { input.checked = input.value === service.audience; });
    this.renderServices(service.audience);
    this.fields.service.value = service.id;
  };

  /* ---------- validation ---------- */

  AppointmentForm.prototype.rules = {
    name: function (v) {
      v = v.trim();
      if (!v) return 'Please enter your name.';
      if (v.length < 2) return 'Name should be at least 2 characters.';
      if (!/^[\p{L}][\p{L} .'-]*$/u.test(v)) return 'Please use letters only (spaces, . \' and - are fine).';
      return '';
    },
    phone: function (v) {
      var digits = v.replace(/[\s()-]/g, '').replace(/^(\+91|0091|0)/, '');
      if (!v.trim()) return 'Please enter your phone number.';
      if (!/^[6-9]\d{9}$/.test(digits)) return 'Enter a valid 10-digit Indian mobile number, e.g. 98765 43210.';
      return '';
    },
    email: function (v) {
      v = v.trim();
      if (!v) return '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return 'Enter a valid email address, e.g. name@example.com.';
      return '';
    },
    customerType: function (v) { return v ? '' : 'Please choose a customer type.'; },
    service: function (v) { return v ? '' : 'Please choose a service.'; },
    date: function (v, self) {
      if (!v) return 'Please choose a preferred date.';
      if (v < self.today.isoDate) return 'Please choose today or a future date.';
      if (v > self.fields.date.max) return 'Please choose a date within the next ' + MAX_DAYS_AHEAD + ' days.';
      return '';
    },
    time: function (v) { return v ? '' : 'Please choose a preferred time.'; }
  };

  AppointmentForm.prototype.valueOf = function (name) {
    return name === 'customerType' ? this.selectedType() : this.fields[name].value;
  };

  AppointmentForm.prototype.validateField = function (name) {
    var message = this.rules[name](this.valueOf(name), this);
    var target = name === 'customerType' ? this.typeGroup : this.fields[name];
    var error = document.getElementById(name + '-error');
    target.setAttribute('aria-invalid', message ? 'true' : 'false');
    if (error) error.textContent = message;
    return message;
  };

  AppointmentForm.prototype.validateAll = function () {
    var self = this;
    var errors = [];
    ['name', 'phone', 'email', 'customerType', 'service', 'date', 'time'].forEach(function (name) {
      var message = self.validateField(name);
      if (message) errors.push({ name: name, message: message });
    });
    return errors;
  };

  AppointmentForm.prototype.showSummary = function (errors) {
    var list = u.$('ul', this.summary);
    list.innerHTML = '';
    var self = this;
    errors.forEach(function (err) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      var targetId = err.name === 'customerType' ? 'type-women' : self.fields[err.name].id;
      a.href = '#' + targetId;
      a.textContent = err.message;
      a.addEventListener('click', function (event) {
        event.preventDefault();
        var el = document.getElementById(targetId);
        el.focus();
        el.scrollIntoView({ block: 'center', behavior: u.prefersReducedMotion() ? 'auto' : 'smooth' });
      });
      li.appendChild(a);
      list.appendChild(li);
    });
    u.$('h2', this.summary).textContent = errors.length === 1
      ? 'There is 1 problem with your request'
      : 'There are ' + errors.length + ' problems with your request';
    this.summary.hidden = false;
    this.summary.focus();
  };

  /* ---------- events ---------- */

  AppointmentForm.prototype.bind = function () {
    var self = this;

    this.typeInputs.forEach(function (input) {
      input.addEventListener('change', function () {
        self.renderServices(input.value);
        self.validateField('customerType');
        if (self.touched.service) self.validateField('service');
      });
    });

    this.fields.date.addEventListener('change', function () {
      self.renderTimes();
      self.touched.date = true;
      self.validateField('date');
      if (self.touched.time) self.validateField('time');
    });

    ['name', 'phone', 'email', 'service', 'time'].forEach(function (name) {
      var field = self.fields[name];
      field.addEventListener('blur', function () {
        if (field.value || self.touched[name]) { self.touched[name] = true; self.validateField(name); }
      });
      field.addEventListener(field.tagName === 'SELECT' ? 'change' : 'input', function () {
        self.touched[name] = true;
        if (field.getAttribute('aria-invalid') === 'true' || field.tagName === 'SELECT') self.validateField(name);
      });
    });

    this.form.addEventListener('submit', function (event) {
      event.preventDefault();
      Object.keys(self.rules).forEach(function (n) { self.touched[n] = true; });
      var errors = self.validateAll();
      if (errors.length) { self.showSummary(errors); return; }
      self.summary.hidden = true;
      self.showSuccess();
    });

    u.$('[data-book-again]', this.success).addEventListener('click', function () {
      self.form.reset();
      self.touched = {};
      self.renderServices(null);
      self.renderTimes();
      u.$$('[aria-invalid]', self.form).forEach(function (el) { el.removeAttribute('aria-invalid'); });
      u.$$('.field__error', self.form).forEach(function (el) { el.textContent = ''; });
      self.success.hidden = true;
      self.form.hidden = false;
      self.fields.name.focus();
    });
  };

  /* ---------- success ---------- */

  AppointmentForm.prototype.request = function () {
    var service = this.byId[this.fields.service.value];
    return {
      name: this.fields.name.value.trim(),
      phone: this.fields.phone.value.trim(),
      email: this.fields.email.value.trim(),
      type: AUDIENCE_LABELS[this.selectedType()],
      service: service.name,
      price: u.formatINR(service.price),
      duration: service.duration,
      date: readableDate(this.fields.date.value),
      time: this.fields.time.value,
      message: this.fields.message.value.trim()
    };
  };

  AppointmentForm.prototype.showSuccess = function () {
    var r = this.request();
    var rows = [
      ['Name', r.name], ['Phone', r.phone], ['Email', r.email || '—'], ['Customer type', r.type],
      ['Service', r.service + ' (from ' + r.price + ', ' + r.duration + ')'], ['Date', r.date], ['Time', r.time]
    ];
    if (r.message) rows.push(['Message', r.message]);

    var summary = u.$('[data-summary]', this.success);
    summary.innerHTML = '';
    rows.forEach(function (row) {
      var div = document.createElement('div');
      var dt = document.createElement('dt');
      var dd = document.createElement('dd');
      dt.textContent = row[0];
      dd.textContent = row[1];
      div.appendChild(dt);
      div.appendChild(dd);
      summary.appendChild(div);
    });

    var lines = [
      'Hello Lumière Studio! I would like to request an appointment (demo).',
      '',
      'Name: ' + r.name,
      'Customer Type: ' + r.type,
      'Service: ' + r.service,
      'Date: ' + r.date,
      'Time: ' + r.time
    ];
    if (r.message) lines.push('Message: ' + r.message);
    var text = lines.join('\n');

    u.$('[data-whatsapp]', this.success).href = 'https://wa.me/?text=' + encodeURIComponent(text);
    var email = u.$('[data-email]', this.success);
    var to = email.getAttribute('data-to');
    email.href = 'mailto:' + to + '?subject=' + encodeURIComponent('Appointment request — ' + r.service + ' (demo)') +
      '&body=' + encodeURIComponent(text + '\nPhone: ' + r.phone + (r.email ? '\nEmail: ' + r.email : ''));

    this.form.hidden = true;
    this.success.hidden = false;
    var heading = u.$('h2', this.success);
    heading.focus();
    this.success.scrollIntoView({ block: 'start', behavior: u.prefersReducedMotion() ? 'auto' : 'smooth' });
  };

  Lumiere.modules.appointment = {
    init: function () {
      var form = u.$('[data-appointment]');
      if (form && u.$('#services-data')) new AppointmentForm(form);
    }
  };
})(window.Lumiere);
