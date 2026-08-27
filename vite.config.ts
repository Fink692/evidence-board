import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { sites } from '@openai/sites-vite-plugin';
import { researchApi } from './server/vite-api';

export default defineConfig({
  plugins: [sites(), react(), researchApi()],
  build: { outDir: 'dist/client' },
  server: {
    headers: { 'Origin-Agent-Cluster': '?1' },
    // Generated media can be exclusively locked while encoding on Windows.
    // They are deliverables, not source files that should trigger hot reloads.
    watch: { ignored: ['**/.local/**', '**/submission/screenshots/**', '**/submission/**/*.mp4', '**/submission/**/*.wav', '**/playwright-report/**', '**/test-results/**'] },
  },
  preview: {
    headers: {
      'Origin-Agent-Cluster': '?1',
      'Permissions-Policy': 'tools=(self), camera=(), microphone=(), geolocation=()',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'",
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['tests/e2e/**'],
    restoreMocks: true,
  },
});
