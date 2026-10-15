import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // assets/build holds what the game loads (CLAUDE.md folder layout); served at the site root
  publicDir: 'assets/build',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    // the game, the motion library page for reviewing animations, the test map list
    rollupOptions: { input: { main: 'index.html', motion: 'motion.html', tests: 'tests.html' } },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
