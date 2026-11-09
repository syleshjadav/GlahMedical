# Glah Medical Group Website

Public website for **Glah Medical Group**: physician-guided weight loss, plus immigration (USCIS Form I-693), driver's license (PennDOT DL-180) and school physicals. There are two offices, in Lancaster (2207 Columbia Ave, 717-397-7718) and Camp Hill (717-737-8400).

- **Static site** built with [Eleventy](https://www.11ty.dev/) 3.1.7 (HTML templates + JSON data files). It follows the same structure and conventions as the APMWC site.
- **Hosted on Cloudflare** (Workers with static assets). There is **no database and no server to maintain**.
- One **Cloudflare Worker** (`worker/index.js`) handles the site banner, maintenance mode, security headers and the appointment request form (`worker/contact.js`).
- **Appointment request form** on the Contact page. It is protected by a per-IP rate limit, a honeypot field, Cloudflare Turnstile (checked on the server) and server-side validation, and it emails the office through Resend. **It collects no medical details**, because plain email is not HIPAA-secure. The page tells visitors not to include any.

> **Tested here, not yet live.** The site was built and run locally with Wrangler 4.156.1 in a sandbox. Every page builds, and the banner, maintenance mode, rate limit, honeypot and form validation work. An automated accessibility scan (axe-core, WCAG 2.2 AA rules) reports zero issues on all 17 pages at desktop and phone widths. **Not tested here:** the live Turnstile check and the Resend email send, because the sandbox can't reach those services. Test them on the demo or the live site.

---

## Before you push: one-time cleanup of the old one-page site

The old site's files are no longer used. Delete them from the repo so they are not confused with the new site:

```
git rm index.html js/site.js src/worker.js functions/api/contact.js _headers .assetsignore robots.txt sitemap.xml
```

(`robots.txt` and `sitemap.xml` are now generated from `src/robots.njk` and `src/sitemap.njk`. Security headers and caching now come from the Worker instead of `_headers`.)

> ⚠️ This repo deploys automatically on push (Workers Builds). Finish steps 4.3–4.5 before relying on the form.

---

## 0. Release 1: live demo (about 10 minutes, no domain needed)

The demo runs on a free Cloudflare address like `https://glahmedical-demo.<your-subdomain>.workers.dev`. It needs no domain or KV setup.

In demo mode:
- Every page shows a "Preview site — not yet live" banner.
- Search engines are told not to index the site (`X-Robots-Tag: noindex`).
- The form uses Cloudflare's always-pass **test** Turnstile key.

Steps, from this folder in a terminal:

```
npm install
npx wrangler login
npx wrangler secret put TURNSTILE_SECRET_KEY --env demo     # enter the TEST secret: 1x0000000000000000000000000000000AA
npx wrangler secret put RESEND_API_KEY --env demo           # optional; without it the form says "not set up yet"
npm run deploy:demo
```

To preview demo mode on your computer first, run `npm run preview:demo` and open http://localhost:8787.

## 1. Prerequisites

- Node.js 20 or later (tested with 22)
- A Cloudflare account with **glahmedicalgroup.com** on Cloudflare DNS
- The GitHub repository for this folder (already connected)
- LibMan CLI, only if you want to re-download the front-end libraries: `dotnet tool install -g Microsoft.Web.LibraryManager.Cli`

## 2. Run it on your computer

```
npm install
copy .dev.vars.example .dev.vars
npm run preview
```

Then open http://localhost:8787. `npm run preview` builds the site into `_site` and starts the Worker locally. `.dev.vars` (git-ignored) holds Turnstile **test** keys and a local maintenance preview key (`local-preview`).

## 3. Front-end libraries (LibMan)

Bootstrap 5.3.8, Font Awesome 7.3.1 and the two fonts (Source Serif 4, Source Sans 3) are served from `src/lib`. These are the same versions the APMWC site uses. **No CDN links are used.** The one exception is Cloudflare Turnstile's script on the Contact page: Cloudflare requires it to load from `challenges.cloudflare.com`, and it cannot be self-hosted.

`libman.json` lists every library. The files are **already in `src/lib`**, so commit them, and Cloudflare's build doesn't need LibMan. To re-download or upgrade them:

```
libman restore
```

**Cache busting:** CSS and JS links carry `?v=`. When you change `site.css`, `contact.js` or an image, bump `assetVersion` in `src/_data/site.json`.

## 4. Cloudflare setup (one time, in this order)

1. **Domain:** glahmedicalgroup.com must be a zone in this Cloudflare account.
2. **Settings store (KV):** done: namespace **glah-settings** (id `c477dc31498b4f429228563afc0b0687`), bound as `SETTINGS` in `wrangler.jsonc`. (The namespace titled `SETTINGS` belongs to the APMWC site; don't use it here.)
3. **Turnstile:** Dashboard → Turnstile → the existing widget (site key `0x4AAAAAAFPSQSI6R2yAKXkG`, already in `src/_data/site.json`). Make sure its hostnames include `glahmedicalgroup.com` and `www.glahmedicalgroup.com`.
4. **Resend:** the domain `glahmedicalgroup.com` must be verified in Resend. Add its SPF and DKIM DNS records in Cloudflare, and add a DMARC record (`v=DMARC1; p=none; rua=mailto:…`). Create an API key.
5. **Secrets:**
   ```
   npx wrangler secret put TURNSTILE_SECRET_KEY
   npx wrangler secret put RESEND_API_KEY
   npx wrangler secret put MAINTENANCE_BYPASS_KEY     # any long random string
   ```
6. **Workers Builds settings** (Worker `glahmedical` → Settings → Build): the deploy command stays `npx wrangler deploy`, and the build in `wrangler.jsonc` runs `npm run build`. The custom domains (apex + www) are declared in `wrangler.jsonc`. The Worker redirects www to the apex domain.
7. **Test on the live site:** send a real request from the form and confirm it arrives in the office inbox (not spam). Also check the click-to-call buttons on a phone, the security headers, the 404 page, and the banner and maintenance switches.

## 5. Config values to fill in

| Where | Key | Value |
| --- | --- | --- |
| `wrangler.jsonc` | `vars.MAIL_TO` | Office inbox(es); currently `glahmedicalgroup@yahoo.com` |
| `wrangler.jsonc` | `vars.MAIL_FROM` | Sender on the Resend-verified domain (**not** yahoo.com) |
| Worker secrets | `TURNSTILE_SECRET_KEY`, `RESEND_API_KEY`, `MAINTENANCE_BYPASS_KEY` | Step 4.5 |
| `src/_data/site.json` | Camp Hill `street`, both offices' `zip`, `hours`, `hoursSchema` | **From the practice** (see below) |
| `src/_data/physicals.json` | `civilSurgeonName` | Optional: the designated physician's name |

Secrets are never put in `wrangler.jsonc` or committed. They go in with `wrangler secret put`, or in `.dev.vars` for local use.

## 6. Day-to-day changes for staff (no code, no redeploy)

In the Cloudflare dashboard → **Storage & Databases → KV → glah-settings**, add or edit these keys. Changes appear within about a minute.

| Key | What it does |
| --- | --- |
| `BANNER_MESSAGE` | Text shown in a strip at the top of every page, e.g. "Camp Hill office closed Friday." Delete the key or clear the text to remove it. |
| `BANNER_LEVEL` | `info` (teal), `warning` (yellow) or `alert` (red). Optional; the default is `info`. |
| `MAINTENANCE_ON` | `true` shows the maintenance page to everyone. Set it to `false` or delete it to turn maintenance off. |
| `MAINTENANCE_MESSAGE` | Optional custom text on the maintenance page. |

While maintenance is on, staff can still view the real site by visiting `https://glahmedicalgroup.com/?preview=<MAINTENANCE_BYPASS_KEY>` once. A cookie keeps the preview on for 24 hours.

## 7. Editing content

| To change | Edit |
| --- | --- |
| Phones, addresses, hours, email, social links | `src/_data/site.json` |
| Weight loss prices; "Call for pricing" text for physicals | `src/_data/pricing.json` |
| Physical exam names, summaries, civil surgeon name | `src/_data/physicals.json` |
| Official USCIS / PennDOT / PA Health links | `src/_data/links.json` (check once a year) |
| Form "What would you like to schedule?" choices | `src/_data/contactServices.json` **and** `SERVICES` in `worker/contact.js` (keep both in sync) |
| Page text | `src/*.njk`, `src/physicals/*.njk` |
| Colors, fonts, layout | `src/assets/css/site.css` |

Push to GitHub and Cloudflare redeploys in about a minute. Worker errors, including failed form sends, appear in Cloudflare → Workers → glahmedical → **Logs**.

## 8. Built vs. still to do

**Fully built**
- 17 pages:
  - Home, Weight Loss, Physicals overview
  - Immigration (I-693), Driver's License (DL-180) and School physical pages
  - Pricing, FAQ, Locations & Contact (with request form)
  - Request sent / not sent pages
  - Privacy Policy, Notice of Privacy Practices, Accessibility, Terms & Disclaimer
  - Styled 404 page and maintenance page
- Appointment request form with a "what would you like to schedule" choice: Turnstile, honeypot, 5-per-minute rate limit, validation and a no-JavaScript fallback. It sends plain-text email through Resend.
- Site banner and maintenance mode, controlled from Cloudflare KV
- Security headers on every response:
  - nosniff, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy
  - a strict Content-Security-Policy (only Turnstile is allowed from outside), COOP
  - HSTS on HTTPS
- www → apex redirect, plus a redirect from the old `/index.html`
- Search and sharing: MedicalOrganization structured data with both offices, Open Graph image, canonical URLs, generated sitemap.xml and robots.txt
- Logo mark (SVG) and favicon set, created for this site. The practice had no logo file.
- WCAG 2.2 AA:
  - skip link, landmarks, one H1 per page
  - visible focus, AA contrast
  - an error summary on the form that receives focus, with errors tied to each field
  - no sideways scrolling at phone width
  - reduced-motion support

**Waiting on the practice (shown as `xxxx` on the site, or noted here)**
- **Camp Hill street address.** The site shows an `xxxx` note on the office card. Add the ZIP codes for both offices too.
- **Office hours** for each office. The site says "Please call for current hours" until they are added.
- **Civil surgeon confirmation.** The I-693 page says the practice's physician is a USCIS-designated civil surgeon (as you confirmed). Check the name appears in the USCIS civil surgeon locator for **both** office addresses, since designation is tied to the practice location. Optionally add the name in `physicals.json`.
- **Physical exam prices:** intentionally "Call for pricing", at the practice's request.
- **Notice of Privacy Practices review.** This is a generic HIPAA notice adapted from the APMWC site. The practice must review it and confirm the Privacy Officer contact and effective date. It should match the paper copy at the front desk.
- The two patient result stories and the weight loss copy were carried over from the old site. Confirm the practice still has the patients' permission to publish them.

**Follow-up / not included**
- Real office photos (the home page uses cards and the logo mark, with no photography)
- Google Business Profile for each office (address, hours and phone must match `site.json` exactly) and Search Console (submit `https://glahmedicalgroup.com/sitemap.xml`)
- No analytics. Cloudflare Web Analytics can be turned on without cookies; update the Privacy Policy if you do.
- CDL/DOT physicals are deliberately not offered. The site says so, because they need an FMCSA-certified examiner.
