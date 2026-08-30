import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // Keep pnpm's workspace links intact. Resolving them back into a temporary
  // store can make esbuild scan outside the project sandbox and also breaks
  // Three.js relative module imports in local previews.
  resolve: {
    preserveSymlinks: true,
  },
  optimizeDeps: {
    // Three's ESM build imports three.core.js relatively. Serving it directly
    // is both stable and avoids duplicating this large dependency in dev.
    exclude: ['three'],
  },
  server: {
    host: '127.0.0.1',
    port: 4173,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
});
