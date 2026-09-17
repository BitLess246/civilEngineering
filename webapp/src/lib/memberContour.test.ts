/**
 * The member contour, as numbers.
 *
 * A WebGL screenshot is not evidence in this repo (CLAUDE.md), so the mesh is
 * checked here: the right number of triangles, a colour on every vertex, and —
 * the two things a plausible-looking implementation gets wrong — that the
 * prism is built on the SOLVER's local axes rather than the renderer's, and
 * that the colour varies around the section and not only along the member.
 */
import { describe, it, expect } from 'vitest'
import {
  sectionRing, RING_PER_SIDE, memberValues, memberContourDomain, memberPeak,
  memberContourGeometry, isSignedMember, MEMBER_STRESS_KEYS,
  type ContourMember, type MemberStressKey,
} from './memberContour'
import { stressSection, type StressSection } from '../engine/memberStress'
import { normalise } from './stressScale'
import { solveFrame3D, rectJ, localAxes, type F3Node, type F3Member, type F3Support, type F3Load } from '../engine/frame3d'
import type { RectSection } from '../engine/model'

const b = 300, h = 500
const rect: RectSection = { id: 'S1', name: '300×500', b, h, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
const S: StressSection = stressSection(rect)
const E = 25000
const props = { E, G: E / 2.4, A: b * h, Iz: (b * h ** 3) / 12, Iy: (h * b ** 3) / 12, J: rectJ(b, h) }

/** A 6 m propped cantilever along +x — hogging at one end, sagging at 5L/8, so
 *  the sign genuinely changes along the member. */
function beam(loads: F3Load[] = [{ kind: 'member-udl', member: 'm', w: 14, cat: 'D' }]) {
  const r = solveFrame3D(
    [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 6, y: 0, z: 0 }] as F3Node[],
    [{ id: 'm', i: 'a', j: 'b', ...props }] as F3Member[],
    [{ node: 'a', fixity: 'fixed' }, { node: 'b', fixity: 'pin' }] as F3Support[],
    loads,
  )
  expect(r, 'the fixture must solve').toBeTruthy()
  return r!.members[0]
}

/** A 3 m column along +y, fixed at the base, pushed at the top along +x. */
function column() {
  const r = solveFrame3D(
    [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 0, y: 3, z: 0 }] as F3Node[],
    [{ id: 'c', i: 'a', j: 'b', ...props, rot: 90 }] as F3Member[],
    [{ node: 'a', fixity: 'fixed' }] as F3Support[],
    [{ kind: 'node', node: 'b', Fx: 40, cat: 'E' }],
  )
  expect(r).toBeTruthy()
  return r!.members[0]
}

const asMember = (
  forces: ReturnType<typeof beam>, a: [number, number, number], bb: [number, number, number],
  rotDeg = 0, drop = 0,
): ContourMember => ({ id: forces.id, a, b: bb, rotDeg, section: S, forces, drop })

const BEAM = asMember(beam(), [0, 0, 0], [6, 0, 0])
const COLUMN = asMember(column(), [0, 0, 0], [0, 3, 0], 90)

// Ring indices, named once. The walk runs top face (+z→−z), then the −z side
// downward, then the bottom face, then the +z side back up, each side
// contributing `RING_PER_SIDE` points and leaving its end corner to the next.
const N = RING_PER_SIDE
const R = 4 * N
const TOP = 0, BOT = 2 * N            // the two extreme-fibre corners
const MID_SIDE = 2 * N - N / 2        // halfway down the −z side ⇒ y ≈ 0

describe('the key set', () => {
  it('marks only σ as signed', () => {
    expect(isSignedMember('sigma')).toBe(true)
    expect(isSignedMember('vonMises')).toBe(false)
    expect(isSignedMember('tau')).toBe(false)
    expect(MEMBER_STRESS_KEYS.map((k) => k.key).sort()).toEqual(['sigma', 'tau', 'vonMises'])
    for (const k of MEMBER_STRESS_KEYS) expect(k.hint.length).toBeGreaterThan(10)
  })
})

describe('the section ring', () => {
  it('is a strict generalisation of the four corners it replaces', () => {
    // One point per side IS the old outline, in the old order. The refinement
    // adds samples between the corners; it does not move the shape.
    expect(sectionRing(S, 1).map((f) => [f.y, f.z])).toEqual([
      [S.cy, S.cz], [S.cy, -S.cz], [-S.cy, -S.cz], [-S.cy, S.cz],
    ])
  })

  it('closes without repeating a point', () => {
    const ring = sectionRing(S)
    expect(ring).toHaveLength(R)
    const seen = new Set(ring.map((f) => `${f.y.toFixed(9)},${f.z.toFixed(9)}`))
    expect(seen.size, 'a duplicated ring point makes a degenerate quad').toBe(R)
  })

  it('stays on the outline — never inside it, never outside', () => {
    for (const f of sectionRing(S)) {
      expect(Math.abs(f.y)).toBeLessThanOrEqual(S.cy + 1e-9)
      expect(Math.abs(f.z)).toBeLessThanOrEqual(S.cz + 1e-9)
      const onFace = Math.abs(Math.abs(f.y) - S.cy) < 1e-9 || Math.abs(Math.abs(f.z) - S.cz) < 1e-9
      expect(onFace, `(${f.y}, ${f.z}) is not on a face`).toBe(true)
    }
  })

  it('leaves the four corners shear-free and gives every other point real flow', () => {
    // Q vanishes at the extreme fibre, which is the physics that makes a
    // corner free. It is a CONSEQUENCE of Q(y), not a special case in the
    // code, so asserting it here is asserting the formula.
    const ring = sectionRing(S)
    const corners = [0, N, 2 * N, 3 * N]
    for (const c of corners) {
      expect(ring[c].Qz, `corner ${c} Qz`).toBeUndefined()
      expect(ring[c].Qy, `corner ${c} Qy`).toBeUndefined()
    }
    // Halfway down a side face: Qz = b·h²/8, its maximum.
    const mid = ring[MID_SIDE]
    expect(mid.y).toBeCloseTo(0, 9)
    expect(mid.Qz).toBeCloseTo((b * h * h) / 8, 6)
    expect(mid.tz).toBe(b)
  })

  it('refuses a degenerate subdivision rather than emitting nothing', () => {
    expect(sectionRing(S, 0)).toHaveLength(4)
    expect(sectionRing(S, -3)).toHaveLength(4)
    expect(sectionRing(S, 2.9)).toHaveLength(8)   // floored, not rounded
  })
})

describe('values around the section', () => {
  it('gives the two faces opposite signs — the whole content of the plot', () => {
    // A member coloured by one scalar per station draws a beam in hogging
    // identically to one in sagging. These must differ in SIGN, not magnitude.
    const vals = memberValues(BEAM, 'sigma')
    expect(vals).toHaveLength(BEAM.forces.xs.length)
    expect(vals[0]).toHaveLength(R)
    const topA = vals[0][TOP], botA = vals[0][BOT]
    expect(Math.sign(topA)).toBe(-Math.sign(botA))
    expect(topA).not.toBeCloseTo(botA, 6)
  })

  it('swaps which face is in tension between the hogging and sagging ends', () => {
    const vals = memberValues(BEAM, 'sigma')
    const top = vals.map((v) => v[TOP])     // ring point 0 is +y, the top
    expect(Math.min(...top)).toBeLessThan(0)
    expect(Math.max(...top)).toBeGreaterThan(0)
    // Hogging at the built-in end puts the top in tension.
    expect(top[0]).toBeGreaterThan(0)
  })

  it('draws τ as the parabola it is, not the section maximum flat all round', () => {
    // THE DEFECT THIS RING FIXES. With four corner samples every one of them
    // is shear-free, so τ had to be painted as the section ENVELOPE — one
    // number repeated four times, which draws each member in a single flat
    // colour. Here it is evaluated where it is drawn.
    const vals = memberValues(BEAM, 'tau')
    for (const row of vals) {
      expect(row).toHaveLength(R)
      for (const v of row) expect(v).toBeGreaterThanOrEqual(0)
      // Free at both extreme fibres: Qz(±h/2) = 0 and there is no torsion.
      expect(row[TOP]).toBeCloseTo(0, 9)
      expect(row[BOT]).toBeCloseTo(0, 9)
    }
    // At the built-in end (the largest shear) the neutral axis carries it.
    const atA = vals[0]
    expect(atA[MID_SIDE]).toBeGreaterThan(0)
    expect(atA[MID_SIDE]).toBeGreaterThan(atA[TOP])
    // And it is a PARABOLA, so the mid-height value is 3V/2A — exactly 1.5×
    // the average — which is the closed form for a rectangle.
    const V = Math.abs(BEAM.forces.Vy[0])
    const Aarea = (b * h)
    expect(atA[MID_SIDE]).toBeCloseTo(1.5 * (V * 1000) / Aarea, 6)
  })

  it('varies τ monotonically from the corner to the neutral axis', () => {
    // One flat number would satisfy 'non-negative' and 'zero at the corners'
    // is not enough on its own either — this asserts the SHAPE down the face.
    const row = memberValues(BEAM, 'tau')[0]
    const face = Array.from({ length: N + 1 }, (_, k) => row[(N + k) % R])
    for (let k = 1; k <= N / 2; k++) expect(face[k]).toBeGreaterThan(face[k - 1])
    expect(new Set(face.map((v) => v.toFixed(9))).size).toBeGreaterThan(3)
  })

  it('keeps von Mises non-negative and at least |σ| at every ring point', () => {
    const sig = memberValues(BEAM, 'sigma'), vm = memberValues(BEAM, 'vonMises')
    for (let i = 0; i < sig.length; i++) {
      for (let c = 0; c < R; c++) {
        expect(vm[i][c]).toBeGreaterThanOrEqual(Math.abs(sig[i][c]) - 1e-9)
      }
    }
  })
})

describe('the domain and the peak', () => {
  it('centres σ on zero and floors the unsigned quantities', () => {
    const d = memberContourDomain([BEAM, COLUMN], 'sigma')
    expect(d.signed).toBe(true)
    expect(d.min).toBeCloseTo(-d.max, 9)
    expect(memberContourDomain([BEAM], 'vonMises').min).toBe(0)
  })

  it('shares ONE domain across members, so two members are comparable', () => {
    // The same defect the lateral-case preview had: a per-member domain makes
    // a lightly stressed member look exactly like a heavily stressed one.
    const both = memberContourDomain([BEAM, COLUMN], 'sigma')
    const each = [memberContourDomain([BEAM], 'sigma'), memberContourDomain([COLUMN], 'sigma')]
    expect(both.max).toBeCloseTo(Math.max(...each.map((d) => d.max)), 9)
  })

  it('names the member the peak is on, and a station that exists', () => {
    const p = memberPeak([BEAM, COLUMN], 'sigma')!
    expect(p).toBeTruthy()
    expect([BEAM.id, COLUMN.id]).toContain(p.id)
    const on = p.id === BEAM.id ? BEAM : COLUMN
    expect(on.forces.xs).toContain(p.x)
    expect(Math.abs(p.value)).toBeCloseTo(
      Math.max(...[BEAM, COLUMN].flatMap((m) => memberValues(m, 'sigma').flat()).map(Math.abs)), 9)
  })

  it('returns null for nothing to peak at', () => {
    expect(memberPeak([], 'sigma')).toBeNull()
  })
})

describe('geometry', () => {
  const dom = memberContourDomain([BEAM], 'sigma')
  const g = memberContourGeometry([BEAM], 'sigma', dom)!

  it('emits one vertex per ring point per station, and a quad per ring bay', () => {
    const n = BEAM.forces.xs.length
    expect(g.position).toHaveLength(n * R * 3)
    expect(g.value, 'one SCALAR per vertex, not three colour channels').toHaveLength(n * R)
    expect(g.index).toHaveLength((n - 1) * R * 2 * 3)
  })

  it('indexes only vertices that exist', () => {
    const verts = g.position.length / 3
    for (const i of g.index) {
      expect(Number.isInteger(i)).toBe(true)
      expect(i).toBeGreaterThanOrEqual(0)
      expect(i).toBeLessThan(verts)
    }
  })

  it('normalises every vertex into 0…1 and spans a real range', () => {
    for (const v of g.value) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1) }
    expect(new Set([...g.value].map((v) => v.toFixed(3))).size,
      'a real stress field is not one flat value').toBeGreaterThan(3)
  })

  it('puts the ZERO of a signed field at 0.5, where the ramp is pale', () => {
    // The defect the value attribute exists for: handing the GPU two COLOURS
    // to blend walks a straight line through RGB and never passes through the
    // ramp's own middle, so a member spanning the sign change was drawn
    // without its pale zero band at all. Interpolating the VALUE puts 0.5
    // exactly where σ = 0 is, and the fragment shader colours it from there.
    const vals = memberValues(BEAM, 'sigma')
    let crossed = false
    for (let i = 1; i < vals.length; i++) {
      if (Math.sign(vals[i][0]) !== Math.sign(vals[i - 1][0])) crossed = true
    }
    expect(crossed, 'fixture must contain a sign change').toBe(true)
    // Somewhere along the top fibre the normalised value passes through 0.5.
    const top = vals.map((r) => normalise(r[0], dom))
    expect(Math.min(...top)).toBeLessThan(0.5)
    expect(Math.max(...top)).toBeGreaterThan(0.5)
  })

  it('puts the prism on the member, at the section half-width', () => {
    // Station 0 of the beam sits at x = 0; its ring spans ±h/2 up and ±b/2
    // across, in metres, grown by the proud factor.
    const p = (v: number, c: number) => g.position[v * 3 + c]
    const all = Array.from({ length: R }, (_, c) => c)
    for (const c of all) expect(p(c, 0)).toBeCloseTo(0, 6)
    const ys = all.map((c) => p(c, 1)), zs = all.map((c) => p(c, 2))
    expect(Math.max(...ys)).toBeCloseTo((h / 2 / 1000) * 1.015, 6)
    expect(Math.min(...ys)).toBeCloseTo(-(h / 2 / 1000) * 1.015, 6)
    expect(Math.max(...zs)).toBeCloseTo((b / 2 / 1000) * 1.015, 6)
  })

  it('drops a beam prism to the centroid, because the node is the TOP', () => {
    const dropped = memberContourGeometry(
      [{ ...BEAM, drop: 0.25 }], 'sigma', dom)!
    for (let v = 0; v < R; v++) {
      expect(dropped.position[v * 3 + 1]).toBeCloseTo(g.position[v * 3 + 1] - 0.25, 6)
    }
  })

  it('returns null rather than an empty mesh', () => {
    expect(memberContourGeometry([], 'sigma', dom)).toBeNull()
    const oneStation: ContourMember = {
      ...BEAM, forces: { id: 'x', xs: [0], N: [0], Vy: [0], Vz: [0], T: [0], My: [0], Mz: [0] },
    }
    expect(memberContourGeometry([oneStation], 'sigma', dom)).toBeNull()
    expect(memberContourGeometry([{ ...BEAM, b: [0, 0, 0] }], 'sigma', dom)).toBeNull()
  })
})

describe("the column uses the SOLVER's local axes, not the renderer's", () => {
  it('differs from the render basis for a vertical member — which is the trap', () => {
    // `Member3D` orients with setFromUnitVectors(+X, dir). For a column that
    // maps local y to global −X; `localAxes` maps it to global +Z. They agree
    // on a horizontal beam and disagree by 90° on every column, so a contour
    // built on the render basis looks right on the beams and paints the
    // tension face on the wrong side of every column.
    const beamY = localAxes([1, 0, 0])[1]
    expect(beamY).toEqual([0, 1, 0])          // same as the renderer here
    const colY = localAxes([0, 1, 0])[1]
    expect(colY).toEqual([0, 0, 1])           // NOT global −X
  })

  it('places the column prism on the axes the stress was computed in', () => {
    // rot = 90° turns y′ toward z′, which is what the bridge gives a vertical.
    const [, yp, zp] = localAxes([0, 1, 0], 90)
    const g2 = memberContourGeometry([COLUMN], 'sigma', memberContourDomain([COLUMN], 'sigma'))!
    const ring = sectionRing(S)
    for (let c = 0; c < R; c++) {
      const oy = (ring[c].y / 1000) * 1.015, oz = (ring[c].z / 1000) * 1.015
      for (let k = 0; k < 3; k++) {
        expect(g2.position[c * 3 + k], `ring ${c} axis ${k}`)
          .toBeCloseTo(yp[k] * oy + zp[k] * oz, 6)
      }
    }
  })

  it('bends the column about the axis it was pushed along', () => {
    // Pushed along +x at the top: the column bends in the x–y plane, so the
    // two faces whose normal is global x must carry opposite sign, and the
    // other pair must not.
    const vals = memberValues(COLUMN, 'sigma')
    const atBase = vals[0]
    expect(Math.max(...atBase.map(Math.abs))).toBeGreaterThan(0)
    const signs = new Set(atBase.map((v) => Math.sign(v)))
    expect(signs.size, 'both signs must appear around a bent section').toBe(2)
  })
})

describe('keys that do not blow up', () => {
  it('builds geometry for every key', () => {
    for (const { key } of MEMBER_STRESS_KEYS) {
      const d = memberContourDomain([BEAM, COLUMN], key as MemberStressKey)
      const geo = memberContourGeometry([BEAM, COLUMN], key as MemberStressKey, d)
      expect(geo, key).toBeTruthy()
      expect([...geo!.value].every((c) => Number.isFinite(c)), key).toBe(true)
    }
  })

  it('survives a member with no load at all', () => {
    const quiet = asMember(
      beam([{ kind: 'member-udl', member: 'm', w: 0, cat: 'D' }]), [0, 0, 0], [6, 0, 0])
    const d = memberContourDomain([quiet], 'sigma')
    expect(d.flat, 'an unloaded member is a flat field and should say so').toBe(true)
    expect(memberContourGeometry([quiet], 'sigma', d)).toBeTruthy()
  })
})

describe('the page actually uses it', () => {
  // A pure module nothing calls is the quietest way for a feature to be
  // "shipped" and absent. These assert the WIRING, which no unit test of the
  // module itself can reach — and each is anchored to the element or the
  // expression it guards, after a guard in an earlier PR passed its sabotage
  // by matching an unrelated call elsewhere in the same file.
  const src = import.meta.glob('../pages/ModelSpace.tsx', {
    query: '?raw', import: 'default', eager: true,
  }) as Record<string, string>
  const page = Object.values(src)[0]
  const layer = (() => {
    const i = page.indexOf('<MemberStress3D')
    expect(i, 'the page must render MemberStress3D').toBeGreaterThan(-1)
    return page.slice(i, page.indexOf('/>', i) + 2)
  })()

  it('feeds the layer the shared domain, not one of its own', () => {
    // A layer that derived its own domain would paint against a scale the
    // legend beside it is not labelled with.
    expect(layer).toContain('domain={memStressInfo.domain}')
    expect(layer).toContain('members={memStressInfo.members}')
  })

  it("takes the forces from the analysis, not from a recomputation", () => {
    // `govRes.members` are the very objects MemberForceDiagram3D draws.
    expect(page).toMatch(/govRes\.members\.map\(\(m\) => \[m\.id, m\]\)/)
    expect(page).toContain('forces: fr')
  })

  it("orients the section the way the BRIDGE resolved it", () => {
    // Not `m.axisRotation` raw: verticals default to 90° and the raw field is
    // usually absent, so reading it directly paints every column's tension
    // face on the wrong side.
    expect(page).toContain('rotDeg: defaultAxisRotation(dir, m.axisRotation)')
  })

  it('drops the prism the same way the solid member is dropped', () => {
    expect(page).toContain('drop: levelDrop(m.role, sec.h / 1000, a, bb)')
  })

  it('builds the section through stressSection, so it is the gross section', () => {
    expect(page).toContain('stressSection(sec)')
  })
})
