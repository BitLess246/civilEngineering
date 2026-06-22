/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The React SPA is the production site, served by Express at the root path.
// It builds into ../public/app; Express serves that directory at "/". Assets
// go under /static (not /assets) to avoid colliding with the legacy
// /assets mount, so the old .html pages keep working alongside it.
// https://vite.dev/config/
//
// `command` is 'build' for production (`vite build`) and 'serve' for dev and
// for the Vitest run, so the production-only hardening below never affects dev
// ergonomics or the test pipeline.
export default defineConfig(({ command }) => ({
  base: '/',
  plugins: [react(), tailwindcss()],
  // Production hardening: strip console/debugger so the shipped engine bundle
  // leaks nothing at runtime and is harder to read. Source maps are off (the
  // default, set explicitly) so the original TypeScript is never published.
  esbuild: command === 'build' ? { drop: ['console', 'debugger'] } : {},
  build: {
    outDir: '../public/app',
    assetsDir: 'static',
    emptyOutDir: true,
    sourcemap: false,
    minify: 'esbuild',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
}))
