/**
 * Cloudflare Pages Function: POST /api/contact
 * Verifies Cloudflare Turnstile server-side, checks a honeypot, validates input,
 * then emails the appointment request via the Resend API.
 *
 * Environment variables (Pages > Settings > Variables and Secrets; use "Secret" type for keys):
 *   TURNSTILE_SECRET_KEY  - Turnstile secret key (SECRET)
 *   RESEND_API_KEY        - Resend API key (SECRET)
 *   MAIL_TO               - Office inbox that receives requests, e.g. glahmedicalgroup@yahoo.com
 *   MAIL_FROM             - Verified sender, e.g. "Glah Website <appointments@glahmedicalgroup.com>"
 * Never commit real values. For local dev, put them in .dev.vars (git-ignored).
 */

const LIMITS = { name: 100, phone: 30, email: 254, office: 20, message: 2000 };
const OFFICES = ['Lancaster', 'Camp Hill'];

export async function onRequestPost({ request, env }) {
  const wantsJson = (request.headers.get('Accept') || '').includes('application/json');
  const reply = (status, body) => {
    if (wantsJson) {
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }
    // No-JS fallback: send the visitor back to the form with a result flag.
    const url = new URL(request.url);
    url.pathname = '/';
    url.search = body.ok ? '?sent=1' : '?sent=0';
    url.hash = 'contact';
    return Response.redirect(url.toString(), 303);
  };

  // Reject oversized bodies early.
  const len = Number(request.headers.get('Content-Length') || 0);
  if (len > 20000) return reply(413, { ok: false, error: 'Request too large.' });

  let form;
  try {
    form = await request.formData();
  } catch {
    return reply(400, { ok: false, error: 'Invalid form submission.' });
  }

  // Honeypot: real people never see this field. Pretend success so bots learn nothing.
  if ((form.get('website') || '').toString().trim() !== '') {
    return reply(200, { ok: true });
  }

  // ---- Turnstile verification (server-side; the client widget alone is not protection) ----
  const token = (form.get('cf-turnstile-response') || '').toString();
  if (!token) return reply(400, { ok: false, error: 'Security check missing. Please try again.' });

  const ip = request.headers.get('CF-Connecting-IP') || '';
  const verifyBody = new FormData();
  verifyBody.append('secret', env.TURNSTILE_SECRET_KEY || '');
  verifyBody.append('response', token);
  if (ip) verifyBody.append('remoteip', ip);

  let verify;
  try {
    const vr = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: verifyBody,
    });
    verify = await vr.json();
  } catch {
    return reply(502, { ok: false, error: 'Security check unavailable. Please call the office.' });
  }
  if (!verify.success || (verify.action && verify.action !== 'contact')) {
    return reply(403, { ok: false, error: 'Security check failed. Please refresh the page and try again.' });
  }

  // ---- Validate fields ----
  const clean = (k) => (form.get(k) || '').toString().replace(/[\r\n]+/g, k === 'message' ? '\n' : ' ').trim();
  const data = {
    name: clean('name'),
    phone: clean('phone'),
    email: clean('email'),
    office: clean('office'),
    message: clean('message'),
  };

  for (const [k, max] of Object.entries(LIMITS)) {
    if (data[k].length > max) return reply(400, { ok: false, error: `The ${k} field is too long.` });
  }
  if (!data.name || !data.phone || !data.office) {
    return reply(400, { ok: false, error: 'Please fill in the required fields.' });
  }
  if (!OFFICES.includes(data.office)) {
    return reply(400, { ok: false, error: 'Please choose an office.' });
  }
  if (!/^[0-9()+.\-\s]{7,30}$/.test(data.phone)) {
    return reply(400, { ok: false, error: 'Please enter a valid phone number.' });
  }
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    return reply(400, { ok: false, error: 'Please enter a valid email address.' });
  }

  if (!env.RESEND_API_KEY || !env.MAIL_TO || !env.MAIL_FROM) {
    console.error('contact: missing mail configuration');
    return reply(500, { ok: false, error: 'Form is not configured yet. Please call the office.' });
  }

  // ---- Send email (plain text only; no HTML injection surface) ----
  const text = [
    'New appointment request from the website',
    '',
    `Name:    ${data.name}`,
    `Phone:   ${data.phone}`,
    `Email:   ${data.email || '(not provided)'}`,
    `Office:  ${data.office}`,
    '',
    'Message:',
    data.message || '(none)',
    '',
    `Submitted: ${new Date().toISOString()}`,
  ].join('\n');

  const payload = {
    from: env.MAIL_FROM,
    to: env.MAIL_TO.split(',').map((s) => s.trim()).filter(Boolean),
    subject: `Appointment request - ${data.office} - ${data.name}`,
    text,
  };
  if (data.email) payload.reply_to = data.email;

  try {
    const mr = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!mr.ok) {
      console.error('contact: mail send failed', mr.status, await mr.text());
      return reply(502, { ok: false, error: 'We could not send your request. Please call the office.' });
    }
  } catch (err) {
    console.error('contact: mail send error', err);
    return reply(502, { ok: false, error: 'We could not send your request. Please call the office.' });
  }

  return reply(200, { ok: true });
}

// Anything other than POST gets 405.
export async function onRequest() {
  return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
}
