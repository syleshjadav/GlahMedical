# Glah Medical Group – Website (Cloudflare Pages)

Static one-page site + one Pages Function for the appointment form.

```
index.html                 Page (inline CSS, inline SVG icons)
js/site.js                 Menu + form submit (version-stamped: site.js?v=1.1.0)
functions/api/contact.js   POST /api/contact – Turnstile check, validation, email via Resend
_headers                   Security headers + CSP + caching
.dev.vars.example          Local env template (copy to .dev.vars – git-ignored)
```

## Bot protection layers
1. **Cloudflare Turnstile** – widget on the form, token verified **server-side** in `contact.js`.
2. **Honeypot field** (`website`) – hidden from people and screen readers; filled = silently dropped.
3. **Server validation** – required fields, length caps, office whitelist, phone/email format.
4. **WAF rate-limit rule** (dashboard, step 4 below).

## Setup (in order)

1. **Turnstile** – Cloudflare dashboard → Turnstile → Add widget  
   - Hostname: `glahmedicalgroup.net` (+ `www.` and your `*.pages.dev` preview host)  
   - Mode: Managed  
   - Put the **site key** in `index.html` → `data-sitekey="..."` (currently Cloudflare's always-pass TEST key).
2. **Resend** (email sender) – create account at resend.com, add and verify the domain `glahmedicalgroup.net`
   (it gives DNS records; add them in Cloudflare DNS), then create an API key.
3. **Pages environment variables** – Pages project → Settings → Variables and Secrets (Production *and* Preview):

   | Name | Type | Value |
   |---|---|---|
   | `TURNSTILE_SECRET_KEY` | Secret | from step 1 |
   | `RESEND_API_KEY` | Secret | from step 2 |
   | `MAIL_TO` | Text | office inbox, e.g. `glahmedicalgroup@yahoo.com` (comma-separate for several) |
   | `MAIL_FROM` | Text | `Glah Website <appointments@glahmedicalgroup.net>` (must be on the verified domain) |

   Never put real keys in the repo.
4. **Rate limiting** – Security → WAF → Rate limiting rules → new rule:  
   *URI Path equals `/api/contact`* and *Method equals `POST`* → Block; set requests/period per IP to the
   tightest your plan allows (target ≈ 5 per minute; the Free plan only offers a 10-second window, so use e.g. 2 per 10 s).
5. **Deploy** – connect this folder's git repo to Cloudflare Pages (build command: none, output directory: `/`),
   or run `npx wrangler pages deploy .`

## Local testing
```
copy .dev.vars.example .dev.vars
npx wrangler pages dev .
```
With the test keys, Turnstile always passes. Email only sends with a real `RESEND_API_KEY`.

## Built vs. follow-up
**Built:** page, mobile menu, form with Turnstile + honeypot, `/api/contact` function, security headers/CSP, caching.  
**Tested here:** honeypot drop, missing-token rejection, GET → 405, headers served.  
**Not tested here:** the live Turnstile verification and Resend email send – the build sandbox couldn't reach those
services. Test once on a Pages preview deploy.

**Still to fill in:** Camp Hill street address, office hours, insurance FAQ answer, real photos, real Turnstile site key.

**Note:** the form is plain email, not HIPAA-secure. Keep the "don't include medical details" notice.
When changing `js/site.js`, bump `?v=` in `index.html`.
