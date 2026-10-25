import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

export default defineConfig({
  base: process.env.ASTRO_BASE_PATH || '/',
  integrations: [react()],
  vite: { plugins: [tailwindcss()] },
});
