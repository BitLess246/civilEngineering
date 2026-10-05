import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { memberColor, ROLE_COLOR, SEL, wallPrismCorners, WALL_TOP_LIFT_M } from './sceneTokens'

describe('memberColor — the solid and the skeleton have to agree', () => {
  // This is shared rather than repeated because the wireframe draws the same
  // member as a LINE: a member that is red-tinted as a box has to be
  // red-tinted as a line, or switching to wireframe quietly loses the
  // utilisation reading the analysis just produced.
  it('is the role colour when there is nothing else to say', () => {
    expect(memberColor('beam', false)).toBe(ROLE_COLOR.beam)
    expect(memberColor('column', false)).toBe(ROLE_COLOR.column)
    expect(memberColor('girder', false)).toBe(ROLE_COLOR.girder)
  })

  it('falls back to slate for a role it does not know', () => {
    expect(memberColor('brace', false)).toBe('#64748b')
  })

  it('is the selection colour whatever else is true of the member', () => {
    // Selection is the strongest statement on screen and it has to survive
    // the tint: a highly stressed member that stayed red when clicked is a
    // click that looks like it did nothing.
    expect(memberColor('beam', true)).toBe(SEL)
    expect(memberColor('beam', true, 1)).toBe(SEL)
    expect(memberColor('beam', true, 0.5, 'wood')).toBe(SEL)
  })

  it('moves toward red as the member works harder', () => {
    const none = memberColor('beam', false, 0)
    const some = memberColor('beam', false, 0.5)
    const full = memberColor('beam', false, 1)
    expect(some).not.toBe(none)
    expect(full).toBe('#dc2626')            // all the way to the tint colour
  })

  it('browns a timber member before the tint is applied', () => {
    expect(memberColor('beam', false, 0, 'wood')).not.toBe(ROLE_COLOR.beam)
    expect(memberColor('beam', false, 0, 'steel')).toBe(ROLE_COLOR.beam)
  })

  it('does not mutate the shared role colours', () => {
    // `THREE.Color.lerp` writes in place, so a colour built straight from the
    // ROLE_COLOR table and then lerped would tint every member of that role
    // for the rest of the session, cumulatively.
    const before = ROLE_COLOR.beam
    memberColor('beam', false, 1)
    memberColor('beam', false, 1, 'wood')
    expect(ROLE_COLOR.beam).toBe(before)
    expect(memberColor('beam', false, 0)).toBe(before)
  })
})

describe('wallPrismCorners — the solid wall sits where the ghost plane was', () => {
  // The drafting viewport swaps the ghosted wall quad for a solid prism. The
  // prism has to be centred on that quad (half thickness each side), rise the
  // wall's full height, and lift its TOP face clear of the slab node line —
  // coplanar faces there would z-fight along every wall/slab junction.
  const t = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

  it('centres the thickness on the outline plane of a straight wall', () => {
    const c = wallPrismCorners(t(0, 3, 0), t(4, 3, 0), t(0, 0, 0), t(4, 0, 0), 0.2, 0)
    expect(c).toHaveLength(8)
    // both faces land at z = ±0.1 for a 200 mm wall along X
    const zs = new Set(c.map(p => +p.z.toFixed(6)))
    expect(zs).toEqual(new Set([-0.1, 0.1]))
    // the outline plane (z = 0) stays the prism's mid-plane
    const midZ = c.reduce((s, p) => s + p.z, 0) / 8
    expect(midZ).toBeCloseTo(0, 10)
  })

  it('keeps the bottom at its elevation and lifts only the top corners', () => {
    const c = wallPrismCorners(t(0, 3, 0), t(4, 3, 0), t(0, 0, 0), t(4, 0, 0), 0.2, WALL_TOP_LIFT_M)
    const ys = c.map(p => +p.y.toFixed(6))
    // corners 0,1 (bottom −) and 4,5 (bottom +) stay at y = 0
    expect(ys[0]).toBe(0); expect(ys[1]).toBe(0); expect(ys[4]).toBe(0); expect(ys[5]).toBe(0)
    // corners 2,3 (top −) and 6,7 (top +) carry the lift
    expect(ys[2]).toBeCloseTo(3 + WALL_TOP_LIFT_M, 10)
    expect(ys[3]).toBeCloseTo(3 + WALL_TOP_LIFT_M, 10)
    expect(ys[6]).toBeCloseTo(3 + WALL_TOP_LIFT_M, 10)
    expect(ys[7]).toBeCloseTo(3 + WALL_TOP_LIFT_M, 10)
  })

  it('stays perpendicular and horizontal for a 45° diagonal wall', () => {
    // wall from (0,·,0) to (3,·,3): dir ∝ (1,0,1); the normal must be
    // horizontal, perpendicular to dir, and unit-length
    const c = wallPrismCorners(t(0, 2.8, 0), t(3, 2.8, 3), t(0, 0, 0), t(3, 0, 3), 0.2, 0)
    const a = c[0], b = c[4]        // the two ± faces at the same outline corner
    const n = a.clone().sub(b).normalize()
    expect(n.y).toBeCloseTo(0, 10)                       // horizontal
    const dir = new THREE.Vector3(3, 0, 3).normalize()
    expect(Math.abs(n.dot(dir))).toBeCloseTo(0, 10)      // perpendicular to the wall
    expect(n.length()).toBeCloseTo(1, 10)
    expect(a.distanceTo(b)).toBeCloseTo(0.2, 10)         // full thickness across
  })

  it('keeps a usable thickness even when asked for a degenerate one', () => {
    // a 0-thickness call must not collapse the prism into the plane — the
    // guard floors half-thickness at 0.1 mm
    const c = wallPrismCorners(t(0, 3, 0), t(4, 3, 0), t(0, 0, 0), t(4, 0, 0), 0, 0)
    expect(c[0].distanceTo(c[4])).toBeGreaterThanOrEqual(1.9e-4)
  })
})
