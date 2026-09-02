import { describe, it, expect } from 'vitest'
import {
  effectiveViewMode, ghostConcrete, surfaceStyleFor, surfaceKey, surfaceMaterial,
  GHOST_OPACITY, WIRE_OPACITY,
} from './viewMode'

describe('which mode the viewport is in', () => {
  it('draws what the user picked', () => {
    expect(effectiveViewMode('solid', false)).toBe('solid')
    expect(effectiveViewMode('wireframe', false)).toBe('wireframe')
  })

  it('goes wireframe on its own while a force diagram is shown', () => {
    // The ribbon is drawn ALONG the member axis, so in solid mode most of it
    // is inside the concrete it describes and switching it on looks like it
    // did nothing.
    expect(effectiveViewMode('solid', true)).toBe('wireframe')
  })

  it('gives the user their own choice back when the diagram goes off', () => {
    // Derived, not assigned into state: overriding the stored choice would
    // leave the model wireframe after the diagram is switched off, with the
    // control saying "solid".
    expect(effectiveViewMode('solid', true)).toBe('wireframe')
    expect(effectiveViewMode('solid', false)).toBe('solid')
  })
})

describe('the concrete only goes see-through when there is something behind it', () => {
  it('ghosts while cages are actually drawn', () => {
    expect(ghostConcrete(true, 32)).toBe(true)
  })

  it('does NOT ghost once the design is gone', () => {
    // The reported bug: with the cages shown, an edit that invalidates the
    // design (a geometry change — `save()` clears analysis and design) left
    // the bars gone and the whole structure transparent for no visible reason.
    expect(ghostConcrete(true, 0)).toBe(false)
  })

  it('does NOT ghost when every cage kind has been switched off', () => {
    // Same end state by a different route, which is why the condition counts
    // what is DRAWN rather than what was placed.
    expect(ghostConcrete(true, 0)).toBe(false)
  })

  it('never ghosts with the toggle off, however many cages are placed', () => {
    expect(ghostConcrete(false, 32)).toBe(false)
  })
})

describe('the style one solid ends up drawn in', () => {
  it('is solid concrete by default', () => {
    expect(surfaceStyleFor('solid', false)).toBe('solid')
  })

  it('is ghosted concrete when the cages are up', () => {
    expect(surfaceStyleFor('solid', true)).toBe('ghost')
  })

  it('lets wireframe win over ghosting', () => {
    // Both are ways of seeing THROUGH the concrete; edges plus an 18% face is
    // neither one thing nor the other, and in wireframe the cage is already
    // fully visible.
    expect(surfaceStyleFor('wireframe', true)).toBe('wire')
    expect(surfaceStyleFor('wireframe', false)).toBe('wire')
  })
})

describe('the material the style adds up to', () => {
  // The regression this pins is not "opacity is 0.18" — that was always right.
  // It is that the material must be REBUILT when the style changes, because
  // three ignores a transparent false → true change on a live material. Drop
  // the key from the mesh and both "Show reinforcement cages" and the
  // wireframe mode go back to doing nothing visible at all, with every other
  // prop still perfectly correct.
  it('gives every style its own identity', () => {
    const keys = new Set(['solid', 'ghost', 'wire'].map((s) => surfaceKey(s as never)))
    expect(keys.size).toBe(3)
  })

  it('solid concrete is fully opaque and writes depth as usual', () => {
    expect(surfaceMaterial('solid')).toEqual({ transparent: false, opacity: 1, depthWrite: true })
  })

  it('ghosted concrete is see-through and stops occluding what is behind it', () => {
    const g = surfaceMaterial('ghost')
    expect(g.transparent).toBe(true)
    expect(g.opacity).toBe(GHOST_OPACITY)
    expect(g.opacity).toBeGreaterThan(0)      // still readable as concrete
    expect(g.opacity).toBeLessThan(0.5)       // but not hiding the cage
    expect(g.depthWrite).toBe(false)          // bars BEHIND it still draw
  })

  it('a wireframe face is not drawn at all — the outline is the drawing', () => {
    // It is still IN the scene, invisible, because it is the pick target: a
    // 1 px line is close to unclickable. But at any opacity above zero it
    // shades what is behind it and the skeleton reads as fogged solid.
    const w = surfaceMaterial('wire')
    expect(w.opacity).toBe(WIRE_OPACITY)
    expect(w.opacity).toBe(0)
    expect(w.opacity).toBeLessThan(GHOST_OPACITY)
    expect(w.depthWrite).toBe(false)          // force ribbons behind it draw
  })
})
