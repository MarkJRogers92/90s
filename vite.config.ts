import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    sourcemap: true,
    chunkSizeWarningLimit: 1500,
  },
  // Pre-bundle Phaser and transform the entry up front, so the first page a
  // fresh dev server serves never reloads itself mid-load to re-optimize
  // dependencies (which broke whichever browser test happened to run first).
  optimizeDeps: {
    include: ['phaser'],
  },
  server: {
    warmup: {
      clientFiles: ['./src/main.ts'],
    },
  },
});
