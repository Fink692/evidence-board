import type { Plugin, PreviewServer, ViteDevServer } from 'vite';
import { sites } from '@openai/sites-vite-plugin';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { openLocalDatabase } from './local-database';
import type { Database } from './database';

type ApiHandler = (request: Request, env: { DB: Database }) => Promise<Response>;
function mountApi(server: ViteDevServer | PreviewServer, load: () => Promise<ApiHandler>) {
  mkdirSync(resolve('.local'), { recursive: true });
  const db = openLocalDatabase(resolve('.local/evidence-board.sqlite'));
  server.httpServer?.once('close', () => db.close());
  server.middlewares.use(async (req, res, next) => {
    if (!req.url?.startsWith('/api/')) { next(); return; }
    try {
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) if (typeof value === 'string') headers.set(key, value);
      const chunks: Buffer[] = []; let length = 0;
      for await (const chunk of req) { length += chunk.length; if (length > 8_001_000) { res.writeHead(413); res.end(); return; } chunks.push(chunk); }
      const request = new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers, ...(!['GET', 'HEAD'].includes(req.method || 'GET') ? { body: Buffer.concat(chunks) } : {}) });
      const response = await (await load())(request, { DB: db });
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Local research storage is temporarily unavailable.' })); }
  });
}
export function researchApi(): Plugin {
  return {
    name: 'evidence-board-local-api',
    configureServer(server) { mountApi(server, async () => (await server.ssrLoadModule('/server/api.ts')).handleApi); },
    async configurePreviewServer(server) {
      // Reuse Sites' loopback-only sign-in simulator for local production preview.
      // This development plugin is never imported by the production Worker.
      const auth = sites().configureServer;
      if (typeof auth === 'function') await auth.call(this, server as unknown as ViteDevServer);
      mountApi(server, async () => (await import(pathToFileURL(resolve('dist/server/index.js')).href)).default.fetch);
    },
  };
}
