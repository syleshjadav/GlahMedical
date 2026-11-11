/**
 * POST /api/contact: appointment request form.
 *
 * Layers of protection, in order:
 *   1. Rate limit per IP (Workers Rate Limiting binding CONTACT_LIMITER: 5 requests / 60 s)
 *   2. Body size cap
 *   3. Honeypot field ("website"): filled = silently dropped
 *   4. Cloudflare Turnstile, verified server-side
 *   5. Field validation (required fields, length caps, allow-lists for office and service)
 * Then the request is emailed to the office as plain text through Resend.
 *
 * The form deliberately collects no medical details (plain email is not HIPAA-secure).
 *
 * Environment:
 *   TURNSTILE_SECRET_KEY (secret), RESEND_API_KEY (secret), MAIL_TO, MAIL_FROM (vars)
 *
 * Replies with JSON when the browser asks for it (the page script), otherwise
 * redirects to /contact/thanks/ or /contact/error/ so the form also works without JavaScript.
 */

const LIMITS = { name: 100, phone: 30, email: 254, office: 20, service: 60, time: 20, message: 1000 };
const OFFICES = ["Lancaster", "Camp Hill"];
// Keep in sync with src/_data/contactServices.json
const SERVICES = [
  "Weight loss consultation",
  "Weight loss follow-up visit",
  "GLP-1 weight loss medication",
  "Immigration physical (Form I-693)",
  "Disability exception consultation (Form N-648)",
  "Driver's license physical (DL-180)",
  "School physical",
  "Other question"
];
const TIMES = ["Morning", "Afternoon", "Any time"];

export async function handleContact(request, env) {
  const wantsJson = (request.headers.get("Accept") || "").includes("application/json");
  const reply = (status, body) => {
    if (wantsJson) return json(body, status);
    const target = body.ok ? "/contact/thanks/" : "/contact/error/";
    return Response.redirect(new URL(target, request.url).toString(), 303);
  };

  // 1. Rate limit (binding is optional so local dev and the demo still work without it)
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (env.CONTACT_LIMITER) {
    try {
      const { success } = await env.CONTACT_LIMITER.limit({ key: `contact:${ip}` });
      if (!success) return reply(429, { ok: false, message: "Too many requests. Please wait a minute and try again, or call us." });
    } catch (err) {
      console.error("contact: rate limiter error", err?.message);
    }
  }

  // 2. Size cap
  const len = Number(request.headers.get("Content-Length") || 0);
  if (len > 20000) return reply(413, { ok: false, message: "Request too large." });

  let form;
  try {
    form = await request.formData();
  } catch {
    return reply(400, { ok: false, message: "Invalid form submission." });
  }

  // 3. Honeypot: pretend success so bots learn nothing.
  if (String(form.get("website") || "").trim() !== "") return reply(200, { ok: true });

  // 4. Turnstile
  const token = String(form.get("cf-turnstile-response") || "");
  if (!token) return reply(400, { ok: false, message: "Security check missing. Please try again." });
  if (!env.TURNSTILE_SECRET_KEY) {
    console.error("contact: TURNSTILE_SECRET_KEY not set");
    return reply(500, { ok: false, message: "The form is not set up yet. Please call the office." });
  }
  const verifyBody = new FormData();
  verifyBody.append("secret", env.TURNSTILE_SECRET_KEY);
  verifyBody.append("response", token);
  if (ip !== "unknown") verifyBody.append("remoteip", ip);
  let verify;
  try {
    const vr = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: verifyBody });
    verify = await vr.json();
  } catch (err) {
    console.error("contact: turnstile unreachable", err?.message);
    return reply(502, { ok: false, message: "Security check unavailable. Please call the office." });
  }
  if (!verify.success || (verify.action && verify.action !== "contact" && verify.action !== "test")) {
    return reply(403, { ok: false, message: "Security check failed. Please refresh the page and try again." });
  }

  // 5. Validate
  const clean = (k) => String(form.get(k) || "").replace(/[\r\n]+/g, k === "message" ? "\n" : " ").trim();
  const data = {
    name: clean("name"), phone: clean("phone"), email: clean("email"), office: clean("office"),
    service: clean("service"), time: clean("time") || "Any time", message: clean("message")
  };
  for (const [k, max] of Object.entries(LIMITS)) {
    if (data[k].length > max) return reply(400, { ok: false, message: `The ${k} field is too long.` });
  }
  if (!data.name || !data.phone || !data.office || !data.service) {
    return reply(400, { ok: false, message: "Please fill in the required fields." });
  }
  if (!OFFICES.includes(data.office)) return reply(400, { ok: false, message: "Please choose an office." });
  if (!SERVICES.includes(data.service)) return reply(400, { ok: false, message: "Please choose what you would like to schedule." });
  if (!TIMES.includes(data.time)) data.time = "Any time";
  if (!/^[0-9()+.\-\s]{7,30}$/.test(data.phone)) return reply(400, { ok: false, message: "Please enter a valid phone number." });
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    return reply(400, { ok: false, message: "Please enter a valid email address." });
  }

  if (!env.RESEND_API_KEY || !env.MAIL_TO || !env.MAIL_FROM) {
    console.error("contact: missing mail configuration");
    return reply(500, { ok: false, message: "The form is not set up yet. Please call the office." });
  }

  // Plain text only: no HTML injection surface.
  const text = [
    "New appointment request from glahmedicalgroup.com",
    "",
    `Name:          ${data.name}`,
    `Phone:         ${data.phone}`,
    `Email:         ${data.email || "(not provided)"}`,
    `Office:        ${data.office}`,
    `Service:       ${data.service}`,
    `Best time:     ${data.time}`,
    "",
    "Note:",
    data.message || "(none)",
    "",
    `Submitted: ${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })} (Eastern)`
  ].join("\n");

  const payload = {
    from: env.MAIL_FROM,
    to: env.MAIL_TO.split(",").map((s) => s.trim()).filter(Boolean),
    subject: `Appointment request - ${data.service} - ${data.office} - ${data.name}`,
    text
  };
  if (data.email) payload.reply_to = data.email;

  try {
    const mr = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!mr.ok) {
      console.error("contact: mail send failed", mr.status, await mr.text());
      return reply(502, { ok: false, message: "We could not send your request. Please call the office." });
    }
  } catch (err) {
    console.error("contact: mail send error", err?.message);
    return reply(502, { ok: false, message: "We could not send your request. Please call the office." });
  }

  return reply(200, { ok: true });
}

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra }
  });
}
