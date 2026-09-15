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
  // The commit the running build came from, so a printed report can name it.
  // Vercel and GitHub Actions each expose it under their own name and neither
  // carries the VITE_ prefix Vite forwards automatically, so it is mapped in
  // here. Empty locally and in the test run — the snapshot then simply omits
  // the build line rather than printing a guess.
  define: {
    __BUILD_SHA__: JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? ''),
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    sourcemap: false,
    minify: 'esbuild',
  },
  test: {
    environment: 'node',
    // Process CSS in tests. Vitest's default is `css: false`, which resolves a
    // stylesheet import to an EMPTY STRING — so `theme.test.ts` would have
    // parsed nothing and passed every contrast assertion vacuously. It reads
    // `styles/themes.css` because the shipped bytes are the only honest thing
    // to check: a TypeScript copy of the palette can pass while the browser
    // paints something else.
    css: true,
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
