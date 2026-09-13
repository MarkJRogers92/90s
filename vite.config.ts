import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    sourcemap: true,
    chunkSizeWarningLimit: 1500,
  },
});
