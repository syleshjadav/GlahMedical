# Glah Medical Group – Website (Cloudflare Workers + static assets)

Static one-page site served as Worker static assets, plus a small Worker script for the appointment form.

```
index.html                 Page (inline CSS, inline SVG icons)
js/site.js                 Menu + form submit (version-stamped: site.js?v=1.1.0)
src/worker.js              Worker entry: /api/contact -> form handler, everything else -> static files
functions/api/contact.js   Form handler – Turnstile check, validation, email via Resend
wrangler.jsonc             Worker config (name must match the Worker in the dashboard)
.assetsignore              Keeps code/config files from being published as public files
_headers                   Security headers + CSP + caching
sitemap.xml / robots.txt   SEO (submit sitemap in Google Search Console)
.dev.vars.example          Local env template (copy to .dev.vars – git-ignored)
```

## Bot protection layers
1. **Cloudflare Turnstile** – widget on the form, token verified **server-side** in `contact.js`.
2. **Honeypot field** (`website`) – hidden from people and screen readers; filled = silently dropped.
3. **Server validation** – required fields, length caps, office whitelist, phone/email format.
4. **WAF rate-limit rule** (dashboard, step 4 below).

## Setup (in order)

1. **Turnstile** – Cloudflare dashboard → Turnstile → Add widget  
   - Hostname: `glahmedicalgroup.com` (+ `www.` and your `*.pages.dev` preview host)  
   - Mode: Managed  
   - Put the **site key** in `index.html` → `data-sitekey="..."` (live key set).
2. **Resend** (email sender) – create account at resend.com, add and verify the domain `glahmedicalgroup.com`
   (it gives DNS records; add them in Cloudflare DNS), then create an API key.
3. **Worker variables** – Workers & Pages → your Worker → Settings → Variables and Secrets:

   | Name | Type | Value |
   |---|---|---|
   | `TURNSTILE_SECRET_KEY` | Secret | from step 1 |
   | `RESEND_API_KEY` | Secret | from step 2 |
   | `MAIL_TO` | Text | office inbox, e.g. `glahmedicalgroup@yahoo.com` (comma-separate for several) |
   | `MAIL_FROM` | Text | `Glah Website <appointments@glahmedicalgroup.com>` (must be on the verified domain – **not** the yahoo.com address; Yahoo's DMARC policy rejects mail sent "from" yahoo.com by other services) |

   Never put real keys in the repo.
4. **Rate limiting** – Security → WAF → Rate limiting rules → new rule:  
   *URI Path equals `/api/contact`* and *Method equals `POST`* → Block; set requests/period per IP to the
   tightest your plan allows (target ≈ 5 per minute; the Free plan only offers a 10-second window, so use e.g. 2 per 10 s).
5. **Deploy** – push to GitHub (Workers Builds runs the deploy), or run the Wrangler deploy command locally.

## Local testing
```
copy .dev.vars.example .dev.vars
npx wrangler dev
```
With the test keys, Turnstile always passes. Email only sends with a real `RESEND_API_KEY`.

## Built vs. follow-up
**Built:** page, mobile menu, form with Turnstile + honeypot, `/api/contact` function, security headers/CSP, caching.  
**Tested here (local Worker):** static files + headers served, code/config files return 404, honeypot drop, missing-token rejection, GET /api/contact → 405.  
**Not tested here:** the live Turnstile verification and Resend email send – the build sandbox couldn't reach those
services. Test once on a Pages preview deploy.

**SEO after launch:** verify the site in Google Search Console and submit `/sitemap.xml`; claim/update the Google Business Profile for both offices; add the Camp Hill street address to the JSON-LD block in `index.html`; update `<lastmod>` in `sitemap.xml` when content changes.

**Still to fill in:** Camp Hill street address, office hours, insurance FAQ answer, real photos.

**Note:** the form is plain email, not HIPAA-secure. Keep the "don't include medical details" notice.
When changing `js/site.js`, bump `?v=` in `index.html`.
