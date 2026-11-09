/* Glah Medical Group: appointment request form. Bump assetVersion in src/_data/site.json when this changes. */
(function () {
  "use strict";
  var form = document.getElementById("request-form");
  if (!form) return;
  var summary = document.getElementById("error-summary");
  var list = document.getElementById("error-list");
  var status = document.getElementById("form-status");
  var submit = form.querySelector('button[type="submit"]');

  var rules = [
    { id: "f-name", msg: "Enter your full name." },
    { id: "f-phone", msg: "Enter a phone number we can call.", test: function (v) { return /^[0-9()+.\-\s]{7,30}$/.test(v); }, bad: "Enter a valid phone number, for example 717-555-0123." },
    { id: "f-email", optional: true, test: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }, bad: "Enter a valid email address, or leave it blank." },
    { id: "f-office", msg: "Choose an office." },
    { id: "f-service", msg: "Choose what you would like to schedule." }
  ];

  function setError(field, text) {
    var err = document.getElementById(field.id + "-err");
    field.classList.toggle("is-invalid", !!text);
    field.setAttribute("aria-invalid", text ? "true" : "false");
    if (err) err.textContent = text || "";
  }

  function say(text, isError) {
    status.textContent = text;
    status.classList.toggle("is-error", !!isError);
  }

  function validate() {
    var errors = [];
    rules.forEach(function (r) {
      var f = document.getElementById(r.id);
      var v = f.value.trim();
      var text = "";
      if (!v && !r.optional) text = r.msg;
      else if (v && r.test && !r.test(v)) text = r.bad;
      setError(f, text);
      if (text) errors.push({ id: r.id, text: text });
    });
    list.innerHTML = "";
    errors.forEach(function (e) {
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.href = "#" + e.id;
      a.textContent = e.text;
      a.addEventListener("click", function (ev) { ev.preventDefault(); document.getElementById(e.id).focus(); });
      li.appendChild(a);
      list.appendChild(li);
    });
    summary.hidden = errors.length === 0;
    if (errors.length) summary.focus();
    return errors.length === 0;
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    say("", false);
    if (!validate()) return;

    var data = new FormData(form);
    if (!data.get("cf-turnstile-response")) {
      say("Please wait a moment for the security check to finish, then send again.", true);
      return;
    }

    submit.disabled = true;
    say("Sending your request…", false);

    fetch(form.action, { method: "POST", body: data, headers: { Accept: "application/json" } })
      .then(function (r) {
        return r.json().catch(function () { return { ok: false }; }).then(function (j) { j.status = r.status; return j; });
      })
      .then(function (res) {
        if (res.ok) { window.location.href = "/contact/thanks/"; return; }
        if (res.status === 429) say("Too many requests. Please wait a minute and try again, or call us.", true);
        else say(res.message || "Sorry, something went wrong. Please call the office instead.", true);
      })
      .catch(function () { say("Network error. Please try again or call the office.", true); })
      .then(function () {
        submit.disabled = false;
        if (window.turnstile) window.turnstile.reset(); // tokens are single use
      });
  });
})();
