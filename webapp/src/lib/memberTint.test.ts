/**
 * The geometry view is not a stress plot unless you ask for one.
 *
 * WHAT WENT WRONG. The 3D model view has two jobs — "is my structure built
 * right" and "what did the analysis find" — and the second used to run over the
 * first the moment a solve existed, with nothing to turn it off. It was a flat
 * red per member for a long time and became a full blue→red ramp along every
 * member in 6350cee, at which point concrete stopped reading as concrete.
 *
 * The property this guards is not "a particular colour": it is that the tint is
 * REACHABLE ONLY THROUGH ITS OWN SWITCH. A source scan is the honest tool here,
 * because what regressed is a wiring decision — somebody passing `ramp` again
 * without the gate — and that IS visible in the source, unlike the rendered
 * defects in `drawingScale.test.ts` which are not.
 */
import { describe, it, expect } from 'vitest'

const SOURCES = import.meta.glob('../**/*.tsx', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

const modelSpace = () => {
  const hit = Object.entries(SOURCES).find(([f]) => f.endsWith('pages/ModelSpace.tsx'))
  if (!hit) throw new Error('ModelSpace.tsx not found — the glob moved')
  return hit[1]
}

describe('the member stress tint has its own switch', () => {
  it('declares the switch, defaulting to OFF', () => {
    // Default ON is the whole defect. If someone flips it, this fails.
    expect(modelSpace()).toMatch(/const \[tintByMoment, setTintByMoment\] = useState\(false\)/)
  })

  it('gates every `ramp` handed to a member on that switch', () => {
    // The `ramp` prop is what paints the solid. Every place it is COMPUTED must
    // run through the switch; passing `tintRamps.get(...)` straight to a member
    // is the regression.
    const src = modelSpace()
    const assigns = [...src.matchAll(/const ramp = ([^\n]+)/g)].map((m) => m[1])
    expect(assigns.length, 'no `const ramp =` found — has the prop been renamed?')
      .toBeGreaterThan(0)
    for (const a of assigns) {
      expect(a, `ungated ramp assignment: ${a}`).toContain('tintByMoment')
    }
  })

  it('does not build the ramps at all while the switch is off', () => {
    // Not just correctness — the memo walks every member's diagram on every
    // solve, and an off switch should cost nothing.
    expect(modelSpace()).toMatch(/if \(!model \|\| !dispRes \|\| !tintByMoment\) return map/)
  })

  it('offers the switch in the UI, not only in state', () => {
    // A flag with no control is a flag nobody can reach.
    const src = modelSpace()
    expect(src).toMatch(/checked=\{tintByMoment\}/)
    expect(src).toMatch(/setTintByMoment\(e\.target\.checked\)/)
  })
})

describe('the tint reports each member its own moment', () => {
  it('does not average end values across the members meeting at a joint', () => {
    // A moment diagram IS discontinuous at a rigid joint: the beam and column
    // end moments differ and sum to zero, which is what joint equilibrium
    // means. Averaging them painted the beam end a number that is not the
    // beam's moment, under a legend saying the colour is |M|.
    const src = modelSpace()
    expect(src, 'joint blending is back').not.toMatch(/endAcc/)
    expect(src, 'joint blending is back').not.toMatch(/b0\.s \/ b0\.n/)
  })
})
