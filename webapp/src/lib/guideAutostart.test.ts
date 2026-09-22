/**
 * The autostart's WIRING, as distinct from its rule.
 *
 * `guideFirstRun.test.ts` checks the rule — four ways it must not fire, and
 * the seen flag's storage behaviour — without a browser. This checks that the
 * page actually asks the rule, and asks it with the right facts. The two
 * halves fail differently: a broken rule fires at the wrong time, broken
 * wiring never fires at all, and a green rule suite says nothing about the
 * second.
 *
 * Source-scanned because the alternative is mounting a page that carries
 * three.js. The behaviour itself was verified in Chromium and the readings are
 * in the PR.
 */
import { describe, it, expect } from 'vitest'
import { MODEL_GUIDE } from './guideFirstRun'

const SOURCES = import.meta.glob('../**/*.tsx', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>
const page = Object.entries(SOURCES).find(([f]) => f.endsWith('pages/ModelSpace.tsx'))?.[1] ?? ''

/** Source with comments stripped — an assertion about code reads code. */
const code = page
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ')

describe('the page asks the rule', () => {
  it('found the page at all', () => {
    expect(code.length).toBeGreaterThan(1000)
  })

  it('calls shouldAutoStartGuide rather than deciding for itself', () => {
    expect(code).toMatch(/shouldAutoStartGuide\(\{/)
  })

  it('passes every condition the rule takes', () => {
    // A missing key is `undefined`, which is falsy, which would make the rule
    // return false forever — the guide silently never opening. Worse than a
    // type error because nothing reports it.
    const call = code.slice(code.indexOf('shouldAutoStartGuide({'))
    const args = call.slice(0, call.indexOf('})'))
    for (const key of ['seen:', 'embed:', 'explicit:', 'ready:']) {
      expect(args, `${key} not passed`).toContain(key)
    }
  })

  it('reads the seen flag for THIS tour, from the shared constant', () => {
    expect(code).toMatch(/hasSeenGuide\(MODEL_GUIDE\)/)
    expect(code, 'a literal name here can drift from the write')
      .not.toMatch(/hasSeenGuide\(['"]/)
  })

  it('marks it seen with the same constant it reads', () => {
    // The read and the write must agree or the guide either never fires or
    // fires forever. One constant makes that structural.
    expect(code).toMatch(/markGuideSeen\(MODEL_GUIDE\)/)
    expect(code).not.toMatch(/markGuideSeen\(['"]/)
    expect(MODEL_GUIDE.length).toBeGreaterThan(3)
  })

  it('marks it seen BEFORE starting, not after the tour finishes', () => {
    // On start, so dismissing at step one still counts as having met it.
    // Marking on completion would reopen the guide on every visit for anyone
    // who closed it — the exact failure `WelcomeDialog` records for its own
    // one-time question.
    const mark = code.indexOf('markGuideSeen(MODEL_GUIDE)')
    const start = code.indexOf('tourStart()', mark)
    expect(mark, 'markGuideSeen missing').toBeGreaterThan(-1)
    expect(start, 'tourStart not called after marking').toBeGreaterThan(mark)
  })

  it('writes the flag INSIDE the deferred start, not beside it', () => {
    // THE STRICTMODE DOUBLE-MOUNT TRAP, and this shipped broken for one
    // commit. Written as `ref = true; markSeen(); setTimeout(start)` with a
    // `clearTimeout` cleanup, the sequence is: mount arms the timeout and
    // writes the flag → StrictMode's cleanup clears the timeout → the remount
    // hits the ref guard and returns. The guide never opens AND the visitor's
    // one shot at it is already spent. Measured: no overlay, flag set.
    //
    // So the write has to be inside the callback that actually starts it.
    const eff = code.slice(code.indexOf('shouldAutoStartGuide({'))
    const to = eff.indexOf('setTimeout(')
    const mark = eff.indexOf('markGuideSeen(MODEL_GUIDE)')
    expect(to, 'no deferred start').toBeGreaterThan(-1)
    expect(mark, 'flag written before the timeout is armed').toBeGreaterThan(to)
  })

  it('RELEASES the in-mount guard on cleanup, so a remount can re-arm', () => {
    // The other half of the same trap. With the ref latched and the timeout
    // cleared, the second StrictMode mount is blocked for good.
    const eff = code.slice(code.indexOf('shouldAutoStartGuide({'))
    const cleanup = eff.slice(eff.indexOf('return () =>'), eff.indexOf('return () =>') + 120)
    expect(cleanup).toContain('clearTimeout')
    expect(cleanup, 'the guard stays latched across a remount')
      .toContain('autoStarted.current = false')
  })

  it('tells the rule about the embed poster and ?tour=1', () => {
    const call = code.slice(code.indexOf('shouldAutoStartGuide({'))
    const args = call.slice(0, call.indexOf('})'))
    expect(args).toMatch(/embed:\s*EMBED/)
    expect(args).toMatch(/explicit:\s*tourParam === '1'/)
  })

  it('cannot fire twice within one mount', () => {
    // The effect depends on `tourParam` and `tourStart`, so it can re-run. The
    // seen flag is written before the timeout, so a re-run is already blocked
    // by storage — but not when storage is unavailable, which is precisely the
    // case that reads as NOT seen. The ref is what covers it.
    expect(code).toMatch(/autoStarted\.current = true/)
    expect(code).toMatch(/if \(autoStarted\.current\) return/)
  })

  it('defers the start off the effect tick', () => {
    // `tour.start` runs `onStart`, which generates a demo model — a dozen
    // setStates. Synchronously in an effect that cascades renders, and it puts
    // an overlay on screen before the workspace it describes has painted.
    // Sliced from the RULE call, not from `markGuideSeen` — the flag is now
    // written inside the callback, so anchoring on it looks past the timeout.
    const eff = code.slice(code.indexOf('shouldAutoStartGuide({'))
    expect(eff.slice(0, 500)).toMatch(/setTimeout\(/)
    expect(eff.slice(0, 700)).toMatch(/clearTimeout/)
  })
})
