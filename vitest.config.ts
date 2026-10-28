import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '../data/eol.json': fileURLToPath(new URL('./tests/fixtures/eol.json', import.meta.url)),
    },
  },
});
