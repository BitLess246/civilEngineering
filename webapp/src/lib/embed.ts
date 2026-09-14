/**
 * ?embed=1 — the shared definition of the embed flag.
 *
 * Model Space is iframed into the landing page as a scaled-down preview of
 * itself, with `?embed=1` on the iframe's address. The flag puts the page into
 * a read-only demo mode: the shell goes inert, persistence is suppressed, a
 * demo frame is generated on mount, and the idle camera starts orbiting (see
 * `EMBED` in ModelSpace.tsx, plus the matching branches in AppShell and App).
 *
 * Three components read the flag off a location, so the parse lives here
 * rather than being re-typed — a second spelling of "embed is on" is how the
 * preview ends up half-locked.
 *
 * The flag is also RequireAuth's bypass. The embed is a demo poster, and a
 * poster that renders a sign-in form is not a demo: an anonymous visitor on
 * the landing page must see the model, not a gate. That makes the door
 * deliberately public — anyone can open `/model?embed=1` and get the demo
 * rather than the workbench — but embed mode persists nothing, keeps the shell
 * inert, and leaves only the viewport and the walkthrough live, so there is no
 * account surface for the bypass to expose. The workbench address without the
 * flag keeps every check on the gate.
 */
export function isEmbedSearch(search: string): boolean {
  return new URLSearchParams(search).get('embed') === '1'
}
