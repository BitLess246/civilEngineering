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

  it('every schedule page renders SaveAlert', () => {
    const missing = persisting(PAGES)
      .filter(([, s]) => !s.includes('<SaveAlert'))
      .map(([p]) => p.split('/').pop())
    expect(missing, `pages that persist but cannot report a failure: ${missing.join(', ')}`).toEqual([])
  })

  it('the projects panel does too — Model Space saves through it', () => {
    const panel = COMPONENTS['./ProjectsPanel.tsx']
    expect(panel).toBeTruthy()
    expect(panel).toContain('<SaveAlert')
  })

  it('and each one wires it to the hook rather than a literal', () => {
    // `<SaveAlert message={null} …>` would render nothing, forever, and pass
    // the check above.
    for (const [path, s] of persisting(PAGES)) {
      if (!s.includes('<SaveAlert')) continue
      expect(s, path).toMatch(/<SaveAlert message=\{api\.saveError\}/)
      expect(s, path).toMatch(/onDismiss=\{api\.clearSaveError\}/)
    }
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
