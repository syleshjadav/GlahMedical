/* Glah Medical Group - site behavior. Bump ?v= in index.html when this file changes. */
(function () {
  'use strict';

  // ---- Mobile menu ----
  var btn = document.querySelector('.menu-btn');
  var nav = document.getElementById('primary-nav');
  function closeMenu(focusBtn) {
    nav.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', 'Open menu');
    if (focusBtn) btn.focus();
  }
  btn.addEventListener('click', function () {
    var open = nav.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  });
  nav.addEventListener('click', function (e) { if (e.target.tagName === 'A') closeMenu(false); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && nav.classList.contains('open')) closeMenu(true);
  });

  document.getElementById('yr').textContent = new Date().getFullYear();

  // ---- Appointment request form ----
  var form = document.getElementById('contact-form');
  var status = document.getElementById('form-status');
  var submitBtn = form.querySelector('button[type="submit"]');

  function say(msg, isError) {
    status.textContent = msg;
    status.classList.toggle('err', !!isError);
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    var missing = Array.prototype.filter.call(form.querySelectorAll('[required]'), function (f) {
      var ok = f.value.trim() !== '';
      f.setAttribute('aria-invalid', String(!ok));
      return !ok;
    });
    if (missing.length) { say('Please fill in the required fields.', true); missing[0].focus(); return; }

    var email = form.querySelector('#f-email');
    if (email.value && !email.checkValidity()) {
      email.setAttribute('aria-invalid', 'true');
      say('Please enter a valid email address.', true); email.focus(); return;
    }

    var data = new FormData(form);
    if (!data.get('cf-turnstile-response')) {
      say('Please wait a moment for the security check to finish, then try again.', true); return;
    }

    submitBtn.disabled = true;
    say('Sending…', false);

    fetch(form.action, { method: 'POST', body: data, headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.json().catch(function () { return { ok: false }; }).then(function (j) { j.status = r.status; return j; }); })
      .then(function (res) {
        if (res.ok) {
          form.reset();
          say('Thank you! Your request was sent. Our office will contact you soon.', false);
        } else if (res.status === 429) {
          say('Too many requests. Please wait a minute and try again, or call us.', true);
        } else {
          say(res.error || 'Sorry, something went wrong. Please call the office instead.', true);
        }
      })
      .catch(function () { say('Network error. Please try again or call the office.', true); })
      .then(function () {
        submitBtn.disabled = false;
        if (window.turnstile) window.turnstile.reset(); // tokens are single-use
      });
  });
})();
