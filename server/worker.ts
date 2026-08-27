import { handleApi } from './api';
import type { Environment } from './database';
import { handleWalkthrough, WALKTHROUGH } from './media';

export default {
  async fetch(request: Request, env: Environment): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === WALKTHROUGH.path) return handleWalkthrough(request, env.MEDIA);
    if (url.pathname.startsWith('/api/')) return handleApi(request, env);
    if (!env.ASSETS) return new Response('The workspace is temporarily unavailable.', { status: 503 });
    let response = await env.ASSETS.fetch(request);
    if (response.status === 404 && request.method === 'GET' && request.headers.get('accept')?.includes('text/html')) response = await env.ASSETS.fetch(new Request(new URL('/index.html', url), request));
    const headers = new Headers(response.headers);
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'no-referrer');
    headers.set('Permissions-Policy', 'tools=(self), camera=(), microphone=(), geolocation=()');
    if (headers.get('content-type')?.includes('text/html')) {
      headers.set('Cache-Control', 'private, no-store');
      // The Worker request URL is supplied by Sites dispatch. Never use forwarded
      // host headers or content from a research record for the site's metadata.
      const origin = url.origin.replace(/["'<>]/g, '');
      const html = (await response.text()).replaceAll('https://evidence-board.invalid', origin);
      return new Response(html, { status: response.status, headers });
    }
    return new Response(response.body, { status: response.status, headers });
  },
};
