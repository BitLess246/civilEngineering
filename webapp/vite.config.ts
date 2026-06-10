/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The React SPA is the production site, served by Express at the root path.
// It builds into ../public/app; Express serves that directory at "/". Assets
// go under /static (not /assets) to avoid colliding with the legacy
// /assets mount, so the old .html pages keep working alongside it.
// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../public/app',
    assetsDir: 'static',
    emptyOutDir: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
