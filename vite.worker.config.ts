import { defineConfig } from 'vite';
import { sites } from '@openai/sites-vite-plugin';
export default defineConfig({
  plugins: [sites()],
  build: {
    ssr: 'server/worker.ts', outDir: 'dist/server', emptyOutDir: true,
    target: 'es2022', minify: true,
    rollupOptions: { output: { entryFileNames: 'index.js' } },
  },
  ssr: { target: 'webworker', noExternal: true },
});
