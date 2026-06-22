/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the protected calculation API (e.g. https://calc-api.onrender.com).
   *  Empty string ⇒ same-origin. Set per-deploy in the build environment. */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
