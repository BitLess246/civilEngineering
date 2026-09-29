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
  sectionRing, RING_PER_SIDE, memberValues, memberContourDomain, memberPeak, jointTrims, displayValueAt,
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

  it('emits one vertex per ring point per station, a quad per ring bay, and two caps', () => {
    // Each cap is its own rim of R vertices plus a hub at the centroid, fanned
    // into R triangles — see 'closes both ends' below for why it exists.
    const n = BEAM.forces.xs.length
    expect(g.position).toHaveLength((n * R + 2 * (R + 1)) * 3)
    expect(g.value, 'one SCALAR per vertex, not three colour channels').toHaveLength(n * R + 2 * (R + 1))
    expect(g.index).toHaveLength(((n - 1) * R * 2 + 2 * R) * 3)
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

// ── Joints ──────────────────────────────────────────────────────────────────
//
// The defect these pin: every member was a prism from node to node with open
// ends. At a beam–column joint the two prisms occupied the same volume with
// different stress fields, the depth test cut between them along arbitrary
// lines, and down the open end of every roof column the dark solid member
// showed as a black slab. Measured on the page's own 2×1-bay frame before the
// fix; these are the numbers that replace the picture.

/** A one-bay portal: two 3 m columns, a 6 m beam, fixed bases, UDL on the beam.
 *  Columns carry the page's default rotation (90°: section depth along X), and
 *  default to the beam's section; `col` swaps in a heavier one. */
function portal(col: { S: StressSection; props: typeof props } = { S, props }) {
  const r = solveFrame3D(
    [{ id: 'A', x: 0, y: 0, z: 0 }, { id: 'B', x: 0, y: 3, z: 0 },
     { id: 'C', x: 6, y: 3, z: 0 }, { id: 'D', x: 6, y: 0, z: 0 }] as F3Node[],
    [{ id: 'c1', i: 'A', j: 'B', ...col.props, rot: 90 },
     { id: 'bm', i: 'B', j: 'C', ...props },
     { id: 'c2', i: 'D', j: 'C', ...col.props, rot: 90 }] as F3Member[],
    [{ node: 'A', fixity: 'fixed' }, { node: 'D', fixity: 'fixed' }] as F3Support[],
    [{ kind: 'member-udl', member: 'bm', w: 30, cat: 'D' }],
  )
  expect(r, 'the portal must solve').toBeTruthy()
  const f = new Map(r!.members.map((m) => [m.id, m]))
  const mk = (id: string, a: [number, number, number], bb: [number, number, number], ni: string, nj: string, rot: number): ContourMember =>
    ({ id, a, b: bb, rotDeg: rot, section: id === 'bm' ? S : col.S, forces: f.get(id)!, drop: 0, ni, nj })
  return [
    mk('c1', [0, 0, 0], [0, 3, 0], 'A', 'B', 90),
    mk('bm', [0, 3, 0], [6, 3, 0], 'B', 'C', 0),
    mk('c2', [6, 0, 0], [6, 3, 0], 'D', 'C', 90),
  ]
}
const PORTAL = portal()

describe('joints: the column owns the joint, the beam stops at its face', () => {
  it('trims the beam by the column half-depth at both ends, and the columns not at all', () => {
    // Column rot 90° puts its 500 mm depth along global X — the direction the
    // beam arrives from — so the face is 250 mm from the node.
    const t = jointTrims(PORTAL)
    expect(t.get('bm')![0]).toBeCloseTo(0.25, 9)
    expect(t.get('bm')![1]).toBeCloseTo(0.25, 9)
    expect(t.has('c1'), 'a column passes through its joint').toBe(false)
    expect(t.has('c2')).toBe(false)
  })

  it('draws the beam from face to face, not node to node', () => {
    const dom = memberContourDomain(PORTAL, 'sigma')
    const beamOnly = memberContourGeometry([PORTAL[1]], 'sigma', dom)!   // no joint to meet
    const framed = memberContourGeometry(PORTAL, 'sigma', dom)!
    const xsOf = (g: NonNullable<typeof framed>, from: number, count: number) =>
      Array.from({ length: count }, (_, v) => g.position[(from + v) * 3])
    // In the framed mesh the beam's vertices follow the first column's.
    const colVerts = (PORTAL[0].forces.xs.length) * R + 2 * (R + 1)
    const beamX = xsOf(framed, colVerts, R)
    for (const x of beamX) expect(Math.abs(x)).toBeCloseTo(0.25, 2)   // the face, ±PROUD on the ring
    expect(Math.min(...xsOf(beamOnly, 0, R)), 'alone, it still runs to the node').toBeCloseTo(0, 6)
  })

  it('carries the stress AT the face — the solver station there, not the node', () => {
    // 25 stations over 6 m are 0.25 m apart, so the face lands exactly on
    // station 1 and the drawn face ring must equal the solver's own values
    // there — neither station 0 (the node) nor an interpolation artefact.
    const beam = PORTAL[1]
    expect(beam.forces.xs[1]).toBeCloseTo(0.25, 9)
    const dom = memberContourDomain(PORTAL, 'sigma')
    const g = memberContourGeometry(PORTAL, 'sigma', dom)!
    const colVerts = PORTAL[0].forces.xs.length * R + 2 * (R + 1)
    const face = memberValues(beam, 'sigma')[1].map((v) => normalise(v, dom))
    const node = memberValues(beam, 'sigma')[0].map((v) => normalise(v, dom))
    for (let c = 0; c < R; c++) expect(g.value[colVerts + c]).toBeCloseTo(face[c], 5)
    expect(Math.max(...node.map((v, c) => Math.abs(v - face[c]))),
      'fixture must make the node and the face differ, or this proves nothing').toBeGreaterThan(0.01)
  })

  it('scales the legend and the peak to what is drawn, not a node value inside a column', () => {
    // Heavy 800×800 columns: lightly stressed themselves, and stiff enough to
    // give the beam its full hogging — so the beam carries the frame's peak
    // and the question is only WHERE on the beam it is read.
    const c = 800
    const heavy = {
      S: stressSection({ ...rect, id: 'S2', name: '800×800', b: c, h: c }),
      props: { E, G: E / 2.4, A: c * c, Iz: c ** 4 / 12, Iy: c ** 4 / 12, J: rectJ(c, c) },
    }
    const P2 = portal(heavy)
    const loose = P2.map(({ ni: _i, nj: _j, ...m }) => m)
    const peak = memberPeak(P2, 'sigma')!, loosePeak = memberPeak(loose, 'sigma')!
    expect(loosePeak.id, 'fixture: the beam must carry the peak').toBe('bm')
    expect(Math.min(loosePeak.x, 6 - loosePeak.x), 'untrimmed, the peak is read at a node').toBeCloseTo(0, 9)
    expect(peak.id).toBe('bm')
    expect(peak.x).toBeGreaterThanOrEqual(0.4 - 1e-9)             // the 800-deep column's face
    expect(peak.x).toBeLessThanOrEqual(6 - 0.4 + 1e-9)
    expect(Math.abs(peak.value)).toBeLessThan(Math.abs(loosePeak.value))
    expect(memberContourDomain(P2, 'sigma').max).toBeLessThan(memberContourDomain(loose, 'sigma').max)
  })

  it('uses the EXIT distance on a skew, not the half-width', () => {
    // A beam arriving at 45° in plan: the ray leaves the 500 (X) × 300 (Z)
    // column where |z| reaches 150 mm, at t = 0.15/sin45 = 0.2121 m. The
    // half-width along X (0.25) would bury the end in the column.
    const col: ContourMember = { ...PORTAL[0], ni: 'A', nj: 'B' }
    const c = Math.SQRT1_2
    const skew: ContourMember = { ...PORTAL[1], id: 'sk', a: [0, 3, 0], b: [4 * c, 3, 4 * c], ni: 'B', nj: 'E' }
    expect(jointTrims([col, skew]).get('sk')![0]).toBeCloseTo(0.15 / c, 9)
  })

  it('stops a secondary beam at the face of a girder that continues through the joint', () => {
    // Girder g1–g2 runs straight through node M along X; the secondary beam
    // leaves M along Z. No column: the continuous girder owns the joint, and
    // the beam stops at its side face, b/2 = 150 mm off the node.
    const base = PORTAL[1]
    const g1: ContourMember = { ...base, id: 'g1', a: [0, 3, 0], b: [3, 3, 0], ni: 'P', nj: 'M' }
    const g2: ContourMember = { ...base, id: 'g2', a: [3, 3, 0], b: [6, 3, 0], ni: 'M', nj: 'Q' }
    const sb: ContourMember = { ...base, id: 'sb', a: [3, 3, 0], b: [3, 3, 4], ni: 'M', nj: 'R' }
    const t = jointTrims([g1, g2, sb])
    expect(t.get('sb')![0]).toBeCloseTo(0.15, 9)
    expect(t.has('g1'), 'collinear segments meet end to end').toBe(false)
    expect(t.has('g2')).toBe(false)
  })

  it('leaves members alone that carry no node ids — they have no joint to meet', () => {
    expect(jointTrims([BEAM, COLUMN]).size).toBe(0)
  })

  it('never trims a member inside out', () => {
    // A 0.3 m stub between two 500-deep columns: 0.25 + 0.25 > 0.3.
    const stub: ContourMember = { ...PORTAL[1], id: 'st', a: [0, 3, 0], b: [0.3, 3, 0], ni: 'B', nj: 'X' }
    const col2: ContourMember = { ...PORTAL[0], id: 'k2', a: [0.3, 0, 0], b: [0.3, 3, 0], ni: 'Y', nj: 'X' }
    const [a, b] = jointTrims([PORTAL[0], stub, col2]).get('st')!
    expect(a + b).toBeLessThanOrEqual(0.9 * 0.3 + 1e-12)
    expect(memberContourGeometry([PORTAL[0], stub, col2], 'sigma', memberContourDomain([stub], 'sigma'))).not.toBeNull()
  })
})

describe('the prism is closed', () => {
  it('closes both ends, so no dark solid member shows down an open tube', () => {
    // Watertight ⇔ every edge is shared by exactly two triangles. The cap
    // vertices are separate from the side ring's, so edges are matched by
    // POSITION rather than index.
    const g = memberContourGeometry(PORTAL, 'sigma', memberContourDomain(PORTAL, 'sigma'))!
    const key = (v: number) => [0, 1, 2].map((c) => g.position[v * 3 + c].toFixed(6)).join(',')
    const edges = new Map<string, number>()
    for (let i = 0; i < g.index.length; i += 3) {
      const tri = [g.index[i], g.index[i + 1], g.index[i + 2]].map(key)
      for (let e = 0; e < 3; e++) {
        const [p, q] = [tri[e], tri[(e + 1) % 3]].sort()
        if (p === q) continue                      // a zero-length bay at a force jump
        edges.set(p + '|' + q, (edges.get(p + '|' + q) ?? 0) + 1)
      }
    }
    const open = [...edges.values()].filter((n) => n < 2).length
    expect(open, 'an edge used by one triangle is an open boundary').toBe(0)
  })

  it('puts the centroid value at the hub — τ peaks there, not on the rim', () => {
    const dom = memberContourDomain([BEAM], 'tau')
    const g = memberContourGeometry([BEAM], 'tau', dom)!
    const hub = BEAM.forces.xs.length * R            // the first cap's hub
    const rim = Array.from({ length: R }, (_, c) => g.value[hub + 1 + c])
    // Under Vy alone τ depends on y only, so the neutral-axis points on the
    // side faces carry the centroid's value exactly: the hub EQUALS the rim's
    // peak. What it must not be is the rim's AVERAGE — a cap interpolated from
    // its rim would put the lowest τ of the section at its middle.
    expect(g.value[hub]).toBeCloseTo(Math.max(...rim), 6)
    expect(g.value[hub]).toBeGreaterThan(rim.reduce((a, v) => a + v, 0) / R + 0.05)
  })
})

describe('the page passes the joints', () => {
  const src = import.meta.glob('../pages/ModelSpace.tsx', {
    query: '?raw', import: 'default', eager: true,
  }) as Record<string, string>
  const page = Object.values(src)[0]
  it('gives every contour member its node ids, inside the member push', () => {
    // Anchored inside the object the page pushes, so a node-id assignment
    // anywhere else in a 4 000-line file cannot satisfy it.
    const i = page.indexOf('drop: levelDrop(m.role, sec.h / 1000, a, bb)')
    expect(i).toBeGreaterThan(-1)
    const push = page.slice(page.lastIndexOf('members.push({', i), page.indexOf('})', i))
    expect(push).toMatch(/\bni:\s*m\.i\b/)
    expect(push).toMatch(/\bnj:\s*m\.j\b/)
  })
})

// ── Averaging through joints (display) ──────────────────────────────────────
//
// Exact member-by-member stress is discontinuous at every joint — a beam's σ
// and a column's σ are different components — and it read as a rendering
// fault. The blend averages the field inside the joint panel only. These pin
// what it may and may not do.

/** Two storeys of one column line with a beam framing in at the floor, so the
 *  floor node has a column below, a column above and a beam. */
function stack() {
  const r = solveFrame3D(
    [{ id: 'A', x: 0, y: 0, z: 0 }, { id: 'B', x: 0, y: 3, z: 0 }, { id: 'T', x: 0, y: 6, z: 0 },
     { id: 'C', x: 6, y: 3, z: 0 }] as F3Node[],
    [{ id: 'lo', i: 'A', j: 'B', ...props, rot: 90 },
     { id: 'up', i: 'B', j: 'T', ...props, rot: 90 },
     { id: 'bm', i: 'B', j: 'C', ...props }] as F3Member[],
    [{ node: 'A', fixity: 'fixed' }, { node: 'C', fixity: 'pin' }] as F3Support[],
    [{ kind: 'member-udl', member: 'bm', w: 30, cat: 'D' }, { kind: 'node', node: 'T', Fx: 20, cat: 'E' }],
  )
  expect(r, 'the stack must solve').toBeTruthy()
  const f = new Map(r!.members.map((m) => [m.id, m]))
  return [
    { id: 'lo', a: [0, 0, 0], b: [0, 3, 0], rotDeg: 90, section: S, forces: f.get('lo')!, drop: 0, ni: 'A', nj: 'B' },
    { id: 'up', a: [0, 3, 0], b: [0, 6, 0], rotDeg: 90, section: S, forces: f.get('up')!, drop: 0, ni: 'B', nj: 'T' },
    { id: 'bm', a: [0, 3, 0], b: [6, 3, 0], rotDeg: 0, section: S, forces: f.get('bm')!, drop: 0, ni: 'B', nj: 'C' },
  ] as ContourMember[]
}
const STACK = stack()
const ON = { blendJoints: true }

describe('averaging through joints', () => {
  it('is off unless asked for, and off changes nothing', () => {
    const dom = memberContourDomain(PORTAL, 'sigma')
    const plain = memberContourGeometry(PORTAL, 'sigma', dom)!
    const off = memberContourGeometry(PORTAL, 'sigma', dom, { blendJoints: false })!
    expect([...off.position]).toEqual([...plain.position])
    expect([...off.value]).toEqual([...plain.value])
  })

  it('meets at one value across the seam — beam side and column side agree', () => {
    // Points on the face the beam frames into (x = 0.25 m), over its section.
    // Exact, the two members disagree there (the fixture checks they do);
    // averaged, both sides must show the same number.
    let differed = false
    for (const y of [2.76, 2.9, 3.0, 3.1, 3.24]) {
      for (const z of [-0.14, 0, 0.14]) {
        const p: [number, number, number] = [0.25, y, z]
        const col = displayValueAt(PORTAL, 'sigma', 'c1', p, ON)
        const bm = displayValueAt(PORTAL, 'sigma', 'bm', p, ON)
        expect(col).toBeCloseTo(bm, 9)
        if (Math.abs(displayValueAt(PORTAL, 'sigma', 'c1', p) - displayValueAt(PORTAL, 'sigma', 'bm', p)) > 0.5) differed = true
      }
    }
    expect(differed, 'fixture: exact values must differ at the seam, or this proves nothing').toBe(true)
  })

  it('is continuous through a floor node, column below to column above', () => {
    let differed = false
    for (const x of [-0.24, 0, 0.24]) {
      for (const z of [-0.14, 0.14]) {
        const p: [number, number, number] = [x, 3, z]
        expect(displayValueAt(STACK, 'sigma', 'lo', p, ON)).toBeCloseTo(displayValueAt(STACK, 'sigma', 'up', p, ON), 9)
        if (Math.abs(displayValueAt(STACK, 'sigma', 'lo', p) - displayValueAt(STACK, 'sigma', 'up', p)) > 0.1) differed = true
      }
    }
    expect(differed, 'fixture: the column must carry a real jump at the floor').toBe(true)
  })

  it('leaves every member exact outside its joints', () => {
    // Mid-height of the column, mid-span of the beam, a column face well below
    // the beam soffit: no blend reaches any of them.
    // Plus the two places a leaky blend would show first: the face the beam
    // frames into, just below the joint's reach (0.55 m under the soffit), and
    // the column's FAR face, inside the joint band but a full column width
    // from the beam.
    const pts: [string, [number, number, number]][] = [
      ['c1', [0.25, 1.5, 0]], ['c1', [-0.25, 2.0, 0.15]], ['bm', [3, 3.25, 0]], ['bm', [1.2, 2.75, 0.15]],
      ['c1', [0.2537, 2.2, 0]], ['c1', [-0.2537, 2.9, 0]],
    ]
    for (const [id, p] of pts) {
      expect(displayValueAt(PORTAL, 'sigma', id, p, ON)).toBe(displayValueAt(PORTAL, 'sigma', id, p))
    }
  })

  it('never shows a value outside what the analysis produced', () => {
    // Every blended value is a convex combination of exact values, so the
    // averaged mesh must sit inside the exact mesh's range: the legend, which
    // is built from exact values, stays true of the picture.
    for (const key of ['sigma', 'tau'] as MemberStressKey[]) {
      const dom = memberContourDomain(STACK, key)
      const exact = memberContourGeometry(STACK, key, dom)!.value
      const avg = memberContourGeometry(STACK, key, dom, ON)!.value
      const lo = Math.min(...exact), hi = Math.max(...exact)
      for (const v of avg) { expect(v).toBeGreaterThanOrEqual(lo - 1e-9); expect(v).toBeLessThanOrEqual(hi + 1e-9) }
    }
  })

  it('refines the joint zone, so a transition half a section long is drawn, not skipped', () => {
    // The solver's stations are L/24 apart — 125 mm on a 3 m column, the whole
    // blend length. Without extra stations the GPU would interpolate straight
    // across it. Ten rings on each column end at the floor, eight on the beam
    // side of its seam.
    const dom = memberContourDomain(STACK, 'sigma')
    const a = memberContourGeometry(STACK, 'sigma', dom)!.value
    const b = memberContourGeometry(STACK, 'sigma', dom, ON)!.value
    expect(b.length).toBeGreaterThanOrEqual(a.length + (10 + 10 + 8) * R)
  })

  it('stays watertight, and covers a beam hung flush with the column top', () => {
    // A beam whose node is its TOP (drop = h/2) ends flush with a roof column;
    // drawn proud, it would poke a few mm above the column's cap — the dark
    // line along the seam. The column's end must reach at least as high.
    const hung = PORTAL.map((m) => (m.id === 'bm' ? { ...m, drop: h / 2 / 1000 } : m))
    const g = memberContourGeometry(hung, 'sigma', memberContourDomain(hung, 'sigma'), ON)!
    // Split the mesh by x: column c1 sits within |x| ≤ 0.26, the beam beyond
    // its face.
    let colTop = -Infinity, beamTop = -Infinity
    for (let v = 0; v < g.position.length / 3; v++) {
      const x = g.position[v * 3], y = g.position[v * 3 + 1]
      if (Math.abs(x) < 0.2) colTop = Math.max(colTop, y)
      else if (x > 0.3 && x < 1) beamTop = Math.max(beamTop, y)
    }
    expect(colTop).toBeGreaterThanOrEqual(beamTop - 1e-9)
    const key = (i: number) => [0, 1, 2].map((c) => g.position[i * 3 + c].toFixed(6)).join(',')
    const edges = new Map<string, number>()
    for (let i = 0; i < g.index.length; i += 3) {
      const tri = [g.index[i], g.index[i + 1], g.index[i + 2]].map(key)
      for (let e = 0; e < 3; e++) {
        const [p, q] = [tri[e], tri[(e + 1) % 3]].sort()
        if (p !== q) edges.set(p + '|' + q, (edges.get(p + '|' + q) ?? 0) + 1)
      }
    }
    expect([...edges.values()].filter((n) => n < 2).length).toBe(0)
  })
})

describe('the page offers the averaging, on by default, and passes it through', () => {
  const src = import.meta.glob(['../pages/ModelSpace.tsx', '../components/modelSpace/memberStressLayer.tsx'], {
    query: '?raw', import: 'default', eager: true,
  }) as Record<string, string>
  const page = src['../pages/ModelSpace.tsx'], layer = src['../components/modelSpace/memberStressLayer.tsx']
  it('defaults to averaged', () => {
    expect(page).toMatch(/const \[memBlend, setMemBlend\] = useState\(true\)/)
  })
  it('hands the toggle to the layer, and the layer to the geometry', () => {
    const i = page.indexOf('<MemberStress3D')
    const el = page.slice(i, page.indexOf('/>', i) + 2)
    expect(el).toMatch(/blendJoints=\{memBlend\}/)
    expect(layer).toMatch(/memberContourGeometry\(members, contourKey, domain, \{ blendJoints \}\)/)
    expect(layer).toMatch(/\[members, contourKey, domain, blendJoints\]/)
  })
  it('lets the reader switch it off, with a checkbox bound to the same state', () => {
    expect(page).toMatch(/checked=\{memBlend\}[\s\S]{0,80}setMemBlend\(e\.target\.checked\)/)
  })
})
