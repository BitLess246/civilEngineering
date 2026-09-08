// ─────────────────────────────────────────────────────────────────────────
// WHICH BUILD IS THIS? — the commit a printed report came from.
//
// `package.json` says 0.0.0 and always will, so it identifies nothing. The
// commit does, and CI knows it: Vercel sets VERCEL_GIT_COMMIT_SHA and GitHub
// Actions sets GITHUB_SHA. `vite.config.ts` maps whichever is present into
// `__BUILD_SHA__` at build time.
//
// It is deliberately SEPARATE from `ENGINE_VERSION`. The sha changes for a
// typo in a comment; the engine version changes when a number moves. A report
// wants both — one says "the arithmetic is the same", the other says "so is
// everything else".
// ─────────────────────────────────────────────────────────────────────────

/** The build's commit sha, or null when the build did not know it (local dev
 *  and the test run, where the define is absent or empty). */
export function buildSha(): string | null {
  // `typeof` guard, not a try/catch: an undeclared identifier throws a
  // ReferenceError that a bundler cannot tree-shake around, and this runs on
  // the report path where a crash costs the user their export.
  const v = typeof __BUILD_SHA__ === 'string' ? __BUILD_SHA__ : ''
  return v.trim() ? v.trim() : null
}
