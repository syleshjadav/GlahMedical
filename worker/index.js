/**
 * Glah Medical Group website Worker
 *
 * Runs in front of the static site (Cloudflare Workers static assets) and handles:
 *  - POST /api/contact     : appointment request form (Turnstile + honeypot + validation + rate limit, email via Resend)
 *  - Site banner           : KV keys BANNER_MESSAGE (text) and BANNER_LEVEL (info | warning | alert)
 *  - Maintenance mode      : KV keys MAINTENANCE_ON ("true") and MAINTENANCE_MESSAGE (text)
 *  - Security headers on every response, and www -> apex redirect.
 *
 * Staff change the banner/maintenance settings in the Cloudflare dashboard; no redeploy needed.
 *
 * Secrets (npx wrangler secret put NAME; never committed):
 *   TURNSTILE_SECRET_KEY, RESEND_API_KEY, MAINTENANCE_BYPASS_KEY
 * Plain variables (wrangler.jsonc "vars"): MAIL_TO, MAIL_FROM, optional TURNSTILE_SITE_KEY override.
 */

import { handleContact } from "./contact.js";

const SETTINGS_CACHE_SECONDS = 60;
const FALLBACK_TEXT = "Something went wrong. Please call Glah Medical Group: Lancaster 717-397-7718 or Camp Hill 717-737-8400.";

const DEMO_FLAG = { on: false };
const isDemo = (env) => String(env.DEMO_MODE || "").toLowerCase() === "true";

export default {
  async fetch(request, env, ctx) {
    DEMO_FLAG.on = isDemo(env);
    try {
      return withSecurityHeaders(await route(request, env, ctx), request);
    } catch (err) {
      console.error("Unhandled error", { path: new URL(request.url).pathname, message: err?.message, stack: err?.stack });
      return withSecurityHeaders(new Response(FALLBACK_TEXT, {
        status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" }
      }), request);
    }
  }
};

async function route(request, env, ctx) {
  const url = new URL(request.url);

  // Canonical host: www.glahmedicalgroup.com -> glahmedicalgroup.com
  if (url.hostname.startsWith("www.")) {
    url.hostname = url.hostname.slice(4);
    return Response.redirect(url.toString(), 301);
  }

  // Old one-page site anchors and paths
  if (url.pathname === "/index.html") return Response.redirect(new URL("/", url).toString(), 301);

  // Appointment request form
  if (url.pathname === "/api/contact") {
    if (request.method !== "POST") return json({ ok: false, message: "Method not allowed." }, 405, { Allow: "POST" });
    return handleContact(request, env);
  }
  if (url.pathname.startsWith("/api/")) return json({ ok: false, message: "Not found." }, 404);

  // Maintenance mode
  const maintenanceOn = (await getSetting(env, "MAINTENANCE_ON")).toLowerCase() === "true";
  if (maintenanceOn && !isStaticFile(url.pathname)) {
    const bypass = await checkMaintenanceBypass(request, env, url);
    if (bypass.response) return bypass.response;
    if (!bypass.allowed) return maintenanceResponse(request, env, url);
  }

  const response = await env.ASSETS.fetch(request);
  const type = response.headers.get("Content-Type") || "";
  if (!type.includes("text/html")) return response;

  let rewriter = new HTMLRewriter();
  let changed = false;

  // Swap the Turnstile site key (e.g. Cloudflare's test key for local preview and the demo).
  if (env.TURNSTILE_SITE_KEY) {
    changed = true;
    rewriter = rewriter.on(".cf-turnstile", { element(el) { el.setAttribute("data-sitekey", env.TURNSTILE_SITE_KEY); } });
  }

  // Inject the site banner into HTML pages.
  let message = await getSetting(env, "BANNER_MESSAGE");
  if (!message && isDemo(env)) message = env.DEMO_BANNER || "Preview site — not yet live.";
  if (message) {
    changed = true;
    const rawLevel = (await getSetting(env, "BANNER_LEVEL")).toLowerCase();
    const level = ["info", "warning", "alert"].includes(rawLevel) ? rawLevel : "info";
    const icon = level === "info" ? "fa-circle-info" : "fa-triangle-exclamation";
    const html = `<div class="container"><i class="fa-solid ${icon}" aria-hidden="true"></i><span>${escapeHtml(message)}</span></div>`;
    rewriter = rewriter.on("#site-banner", {
      element(el) {
        el.removeAttribute("hidden");
        el.setAttribute("class", `site-banner site-banner--${level}`);
        el.setInnerContent(html, { html: true });
      }
    });
  }

  return changed ? rewriter.transform(response) : response;
}

/* -------------------------------------------------------------------------- */
/* Maintenance                                                                */
/* -------------------------------------------------------------------------- */

async function checkMaintenanceBypass(request, env, url) {
  const key = env.MAINTENANCE_BYPASS_KEY;
  if (!key) return { allowed: false };
  const preview = url.searchParams.get("preview");
  if (preview !== null) {
    if (await safeEqual(preview, key)) {
      url.searchParams.delete("preview");
      return {
        response: new Response(null, {
          status: 302,
          headers: {
            Location: url.pathname + (url.search || ""),
            "Set-Cookie": `glah_preview=${encodeURIComponent(key)}; Path=/; Max-Age=86400; HttpOnly; Secure; SameSite=Strict`
          }
        })
      };
    }
    return { allowed: false };
  }
  const cookie = (request.headers.get("Cookie") || "").split(/;\s*/).find((c) => c.startsWith("glah_preview="));
  const value = cookie ? decodeURIComponent(cookie.split("=")[1] || "") : "";
  return { allowed: value ? await safeEqual(value, key) : false };
}

async function maintenanceResponse(request, env, url) {
  const page = await env.ASSETS.fetch(new Request(new URL("/maintenance.html", url).toString(), { headers: request.headers }));
  const message = await getSetting(env, "MAINTENANCE_MESSAGE");
  let body = page;
  if (message) {
    body = new HTMLRewriter()
      .on("#maintenance-message", { element(el) { el.setInnerContent(message); } })
      .transform(page);
  }
  return new Response(body.body, {
    status: 503,
    headers: { "Content-Type": "text/html; charset=utf-8", "Retry-After": "3600", "Cache-Control": "no-store" }
  });
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

async function getSetting(env, key) {
  if (!env.SETTINGS) return "";
  try {
    const v = await env.SETTINGS.get(key, { cacheTtl: SETTINGS_CACHE_SECONDS });
    return (v || "").trim();
  } catch (err) {
    console.error("KV read failed", { key, message: err?.message });
    return "";
  }
}

function isStaticFile(path) {
  return path.startsWith("/assets/") || path.startsWith("/lib/") || path === "/favicon.ico" || path === "/robots.txt";
}

function withSecurityHeaders(response, request) {
  const res = new Response(response.body, response);
  const h = res.headers;
  h.set("X-Content-Type-Options", "nosniff");
  h.set("X-Frame-Options", "DENY");
  h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()");
  h.set("Cross-Origin-Opener-Policy", "same-origin");
  if (DEMO_FLAG.on) h.set("X-Robots-Tag", "noindex, nofollow");
  if (new URL(request.url).protocol === "https:") h.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  // Turnstile (bot check on the request form) must load from Cloudflare; it cannot be self-hosted.
  h.set("Content-Security-Policy", [
    "default-src 'self'",
    "script-src 'self' https://challenges.cloudflare.com",
    "frame-src https://challenges.cloudflare.com",
    "connect-src 'self'",
    "img-src 'self' data:",
    "style-src 'self'",
    "font-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'"
  ].join("; "));
  // Long cache for versioned static files; HTML always revalidates.
  const path = new URL(request.url).pathname;
  if (res.status === 200 && (path.startsWith("/lib/") || path.startsWith("/assets/"))) {
    h.set("Cache-Control", "public, max-age=2592000");
  }
  return res;
}

export function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra }
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function safeEqual(a, b) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(a)), crypto.subtle.digest("SHA-256", enc.encode(b))]);
  const x = new Uint8Array(ha), y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
