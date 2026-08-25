import { describe, it, expect } from 'vitest'
import { ghostKey, ghostMaterial, GHOST_OPACITY } from './ghostMaterial'

describe('ghosted concrete', () => {
  // The regression this pins is not "opacity is 0.18" — that was always right.
  // It is that the material must be REBUILT when the toggle flips, because
  // three ignores a transparent false → true change on a live material. Drop
  // the key from the mesh and "Show reinforcement cages" goes back to doing
  // nothing visible at all, with every other prop still perfectly correct.
  it('the material identity changes with the toggle', () => {
    expect(ghostKey(true)).not.toBe(ghostKey(false))
  })

  it('ghosted concrete is see-through and stops occluding what is behind it', () => {
    const g = ghostMaterial(true)
    expect(g.transparent).toBe(true)
    expect(g.opacity).toBe(GHOST_OPACITY)
    expect(g.opacity).toBeGreaterThan(0)      // still readable as concrete
    expect(g.opacity).toBeLessThan(0.5)       // but not hiding the cage
    expect(g.depthWrite).toBe(false)          // bars BEHIND it still draw
  })

  it('solid concrete is fully opaque and writes depth as usual', () => {
    expect(ghostMaterial(false)).toEqual({ transparent: false, opacity: 1, depthWrite: true })
  })
})
