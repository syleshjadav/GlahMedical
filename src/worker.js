/**
 * Cloudflare Worker entry point.
 * - POST /api/contact  -> appointment form handler (Turnstile check + email)
 * - everything else    -> static files (index.html, js/, sitemap.xml, ...)
 */
import { onRequestPost } from '../functions/api/contact.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/contact') {
      if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
      }
      return onRequestPost({ request, env, ctx });
    }

    return env.ASSETS.fetch(request);
  },
};
