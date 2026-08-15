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
    // The Supabase Edge Function's pure logic (webhook signature verification
    // and event parsing) lives outside src/ but is plain Web-Crypto TypeScript,
    // so the one suite covers it rather than leaving the money path untested.
    // `scripts/` is in here for the same reason `supabase/functions` is: the
    // Paddle seed script is deploy-critical, plain TypeScript, and untested
    // code that only runs on cutover day is the worst kind to get wrong.
    include: [
      'src/**/*.{test,spec}.{ts,tsx}', 'api/**/*.test.ts',
      '../supabase/functions/**/*.test.ts', '../scripts/**/*.test.ts',
    ],
  },
}))
