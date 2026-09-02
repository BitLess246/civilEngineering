// No DOM testing library in this repo (see `ErrorBoundary.test.tsx`) and
// `/model` is behind `RequireAuth`, whose Supabase host this environment's
// egress proxy blocks — so the page could not be driven in a browser here.
// What CAN be pinned is the WIRING, and the wiring is where a landing gets
// lost: a field that nothing reads, a preview computed from different numbers
// than the thing it previews, a schedule column added to the header and not to
// the row. Each of those is a real defect and each is visible in the source.
//
// TWO sources, because `Stair3D` now lives with the rest of the 3D scene. That
// split is exactly what this style of test is fragile to — and catching the
// move rather than silently passing against a file that no longer contains the
// code is the guard working, not failing.
import { describe, it, expect } from 'vitest'
import src from './ModelSpace.tsx?raw'
import scene from '../components/modelSpace/scene.tsx?raw'

describe('the half-landing reaches the model space', () => {
  it('has a field for each end, and both are bounded at zero', () => {
    // A negative landing would lengthen the flight, which is not a thing.
    for (const [set, state] of [['setStLandLo', 'stLandLo'], ['setStLandHi', 'stLandHi']]) {
      expect(src).toContain(`value={${state}}`)
      expect(src).toContain(`${set}(Math.max(0, parseFloat(e.target.value) || 0))`)
    }
  })

  it('builds the landings in ONE place, and both the preview and the add use it', () => {
    // The trial placement is what the panel prints R, G and θ from. Computed
    // without the landings it would advertise a flight nobody is about to add.
    expect(src).toContain('const stLandings = (): StairLanding[] =>')
    const uses = src.match(/landings: stLandings\(\)/g) ?? []
    expect(uses.length).toBe(2)                      // the trial, and the stair added
  })

  it('blames the landing, not the frame, when it leaves nothing to slope', () => {
    // `placeStair` returns null either way; the panel places the same stair
    // WITHOUT its landings to tell the two apart.
    expect(src).toContain('leaves nothing to slope')
    expect(src).toMatch(/!trial && bare \?/)
  })

  it('draws the landings as part of the same solid, not as the flight alone', () => {
    expect(scene).toContain('prism(solid.top, solid.bottom)')
    expect(scene).toContain('for (const l of solid.landings) prism(l.top, l.bottom)')
  })

  it('shows the landing in both tables — header AND row', () => {
    // A column added to one and not the other silently shifts every cell after
    // it under the wrong heading.
    expect(src).toContain(">Landing</th>")                        // the panel's list
    expect(src).toContain("'Landing (m)'")                        // the report schedule
    expect(src).toContain('st.landings.map((l) => `${f2(l.depth)} ${l.at}`)')
    expect(src).toContain("`${f1(l.depth)}${l.at === 'low' ? '↓' : '↑'}`")
  })

  it('says which span is which, where a reader could take the wrong one', () => {
    expect(src).toContain('of the run slopes')                    // flightRun, on hover
    expect(src).toContain('landing to landing')                   // totalSpan, on hover
    expect(src).toContain('a half-landing does not change that span')
  })
})
