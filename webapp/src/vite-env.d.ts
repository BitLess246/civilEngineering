/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the protected calculation API (e.g. https://calc-api.onrender.com).
   *  Empty string ⇒ same-origin. Set per-deploy in the build environment. */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** Commit sha of the running build, injected by `vite.config.ts` from the
 *  CI environment. Empty string when the build did not know it (local dev,
 *  the vitest run). */
declare const __BUILD_SHA__: string
