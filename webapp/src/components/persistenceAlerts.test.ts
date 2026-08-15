// A page that persists but never renders `<SaveAlert>` is back where this
// started: the save fails, the edit stays on screen looking saved, and the
// user finds out on their next visit.
//
// Every schedule route auto-saves on edit, and there are seven of them, so
// "did you remember the banner" is not something to leave to review. This is
// the same shape of guard as `trialQuota.test.ts` uses for `RequireAuth`, and
// for the same reason: the lists agreeing is not the same as the component
// being mounted.

import { describe, it, expect } from 'vitest'

const PAGES = import.meta.glob('../pages/*.tsx', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

const COMPONENTS = import.meta.glob('./*.tsx', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

/** Files that call a hook exposing `saveError` — i.e. that can fail to save. */
const persisting = (src: Record<string, string>) =>
  Object.entries(src).filter(([, s]) =>
    s.includes('useScheduleProject()') || s.includes('useProjects('))

describe('everything that saves can report a failed save', () => {
  it('found the files to check — an empty glob would pass vacuously', () => {
    expect(Object.keys(PAGES).length).toBeGreaterThan(30)
    expect(persisting(PAGES).length).toBeGreaterThanOrEqual(7)
  })

  it('every schedule page renders the alerts', () => {
    const missing = persisting(PAGES)
      .filter(([, s]) => !s.includes('<PersistenceAlerts'))
      .map(([p]) => p.split('/').pop())
    expect(missing, `pages that persist but cannot report a failure: ${missing.join(', ')}`).toEqual([])
  })

  it('the projects panel does too — Model Space saves through it', () => {
    // It uses `SaveAlert` directly: the projects store has no cross-tab
    // conflict detection, so offering the resolution buttons there would be a
    // promise nothing keeps.
    const panel = COMPONENTS['./ProjectsPanel.tsx']
    expect(panel).toBeTruthy()
    expect(panel).toContain('<SaveAlert')
  })

  it('and each one wires it to the hook rather than a literal', () => {
    // `saveError={null}` would render nothing, forever, and pass the check
    // above.
    for (const [path, s] of persisting(PAGES)) {
      if (!s.includes('<PersistenceAlerts')) continue
      expect(s, path).toMatch(/saveError=\{api\.saveError\}/)
      expect(s, path).toMatch(/clearSaveError=\{api\.clearSaveError\}/)
    }
  })

  it('every schedule page can also RESOLVE a conflict, not just report one', () => {
    // A page that shows the conflict without the two buttons is a page where
    // the user can never start saving again.
    for (const [path, s] of persisting(PAGES)) {
      if (!s.includes('<PersistenceAlerts')) continue
      expect(s, path).toMatch(/conflict=\{api\.conflict\}/)
      expect(s, path).toMatch(/reloadTheirs=\{api\.reloadTheirs\}/)
      expect(s, path).toMatch(/overwriteWithMine=\{api\.overwriteWithMine\}/)
    }
  })
})

describe('the conflict banner', () => {
  const src = COMPONENTS['./PersistenceAlerts.tsx']

  it('is NOT dismissible', () => {
    // Nothing is being saved until it is answered. A dismiss button would
    // leave the user editing a document that silently is not being stored.
    const conflictBlock = src.slice(src.indexOf('{conflict && ('))
    expect(conflictBlock).not.toMatch(/onDismiss|Dismiss/)
  })

  it('offers both answers', () => {
    expect(src).toMatch(/Load their version/)
    expect(src).toMatch(/Keep mine and overwrite/)
  })

  it('says what each one costs before it is pressed', () => {
    // Neither is recoverable.
    expect(src).toMatch(/discards your change/i)
    expect(src).toMatch(/discards\s*\n?\s*theirs/i)
  })

  it('is announced, and does not print', () => {
    expect(src).toMatch(/role="alert"/)
    expect(src).toMatch(/no-print/)
  })
})

describe('the alert itself', () => {
  const src = COMPONENTS['./SaveAlert.tsx']

  it('renders nothing when there is nothing to say', () => {
    // A permanently-present empty banner is noise, and noise gets ignored —
    // including on the day it matters.
    expect(src).toMatch(/if \(!message\) return null/)
  })

  it('is announced to assistive tech', () => {
    // It appears in response to an action, without focus moving, so a
    // screen-reader user gets no other signal that the save failed.
    expect(src).toMatch(/role="alert"/)
  })

  it('does not print', () => {
    // A schedule report is a document about the project, not about the state
    // of this browser's disk.
    expect(src).toMatch(/no-print/)
  })
})
