/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The React SPA is deployed to Vercel; the calc API runs as a separate
// Node service on Render. Source maps are off and console/debugger are
// stripped in production so the shipped bundle leaks nothing at runtime.
// `command` is 'build' for production and 'serve' for dev/Vitest, so
// the hardening below never affects dev ergonomics or the test pipeline.
export default defineConfig(({ command }) => ({
  base: '/',
  plugins: [react(), tailwindcss()],
  esbuild: command === 'build' ? { drop: ['console', 'debugger'] } : {},
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    sourcemap: false,
    minify: 'esbuild',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
}))
