import { describe, it, expect } from 'vitest'
import { designBraceMember, braceElements, braceRmin } from './steelBrace'
import { designBraceEnd, slottedU, clipSegment, convexHull, clipHalfPlane } from './braceConnection'
import { shapeByName } from './aiscSections'

const hss127 = shapeByName('HSS127x127x6.4')!     // A 2770, r 49, b = h 127, t 5.92
const hss305 = shapeByName('HSS305x305x6.4')!     // A 6970, r 122, b = h 304.8, t 5.92

describe('designBraceMember — AISC 360-16 Ch. D and E, by hand', () => {
  // L = 5 m, Fy 345, Fu 427; a slotted end: An = 2770 − 2·5.92·(12 + 3), lw 200
  const An = 2770 - 2 * 5.92 * 15
  const xbar = (127 * 127 + 2 * 127 * 127) / (4 * 254)
  const U = 1 - xbar / 200
  const r = designBraceMember(hss127, 5, 300, 500, 345, 427, { An, U })
  it('§E3: KL/r = 5000/49 = 102.04, Fe = π²E/(KL/r)² = 189.58, Fcr = 0.658^(Fy/Fe)·Fy = 161.07 MPa', () => {
    expect(r.KLr).toBeCloseTo(102.0408, 3)
    expect(r.compression.Fe).toBeCloseTo(189.5754, 3)
    expect(r.compression.Fcr).toBeCloseTo(161.0706, 3)
    expect(r.compression.Ae).toBe(2770)                         // walls nonslender: 18.45 < 33.71
    expect(r.compression.phiPn).toBeCloseTo(401.549, 2)
  })
  it('§D2: yielding 0.9·345·2770 = 860.09 kN; rupture 0.75·427·U·An with U = 1 − x̄/lw (Table D3.1 case 6)', () => {
    expect(r.tension.phiPnYield).toBeCloseTo(860.085, 3)
    expect(xbar).toBeCloseTo(47.625, 9)
    expect(r.tension.phiPnRupture).toBeCloseTo(0.75 * 427 * U * An / 1000, 9)
    expect(r.tension.phiPnRupture).toBeCloseTo(632.52, 1)
  })
  it('governs on the worst ratio and checks slenderness (KL/r ≤ 200)', () => {
    // 500/632.52 = 0.79 in rupture over 300/401.55 = 0.75 in compression
    expect(r.governs).toBe('tension rupture')
    expect(r.util).toBeCloseTo(500 / r.tension.phiPnRupture, 9)
    expect(r.slendernessOk).toBe(true)
    const long = designBraceMember(hss127, 10.5, 50, 0, 345, 427, { An, U })
    expect(long.KLr).toBeGreaterThan(200)
    expect(long.ok).toBe(false)
    expect(long.governs).toBe('slenderness')
  })
  it('§E7: a slender wall (b/t 48.49 > 33.71) loses effective width — Ae 5 531.9 mm², φPn 1 643.3 kN', () => {
    const s = designBraceMember(hss305, 3, 1000, 0, 345, 427, { An: hss305.A, U: 1 })
    const els = braceElements(hss305, 345)
    expect(els.every((e) => e.slender)).toBe(true)
    expect(els[0].lambda).toBeCloseTo(48.4865, 3)
    expect(s.compression.Ae).toBeCloseTo(5531.93, 1)
    expect(s.compression.phiPn).toBeCloseTo(1643.34, 1)
  })
  it('a single angle buckles about rz', () => {
    const L = shapeByName('L64x64x4.8')!
    expect(braceRmin(L)).toBe(L.rz)
  })
})

describe('designBraceEnd — slotted HSS on a gusset, the UFM interfaces', () => {
  // HSS127x127x6.4 at 45° into a W310 beam (eb 155) / W310x79 flange (ec 153.5)
  const frame = { kind: 'corner' as const, eb: 155, ec: 153.5, theta: Math.PI / 4 }
  const e = designBraceEnd(hss127, 400, 300, frame, 450)!
  it('four 5 mm fillets: 0.75·0.6·482·0.707·5 = 766.8 N/mm per line governs; lw = 140 mm (≥ H = 127)', () => {
    expect(e.weld.w).toBe(5)
    expect(e.weld.phiPerLen).toBeCloseTo(0.75 * 0.6 * 482 * 0.707 * 5, 6)
    expect(e.weld.lw).toBe(140)
    expect(e.weld.phiRn).toBeGreaterThanOrEqual(400)
  })
  it('Whitmore: H + 2·lw·tan30°, of which only the part in the plate counts — by hand at 45°', () => {
    const c = Math.SQRT1_2, half = 127 / 2
    // brace end where both HSS corners clear the faces by 25: the beam face governs
    const sEnd = Math.max((153.5 + 25 + half * c) / c, (155 + 25 + half * c) / c)
    expect(e.sEnd).toBeCloseTo(sEnd, 9)                                    // 318.06
    expect(e.whitmore.Lw0).toBeCloseTo(127 + 2 * 140 * Math.tan(Math.PI / 6), 9)
    // the section p(o) = sEnd·u + o·n leaves the plate at the beam face
    // (y = eb) and the column face (x = ec): o ∈ [(eb − sEnd·c)/c, (sEnd·c − ec)/c]
    const Lw = (sEnd * c - 153.5) / c - (155 - sEnd * c) / c                // 2·sEnd − (eb + ec)/c = 199.84
    expect(e.whitmore.Lw).toBeCloseTo(Lw, 6)
    expect(e.whitmore.phiYield).toBeCloseTo(0.9 * 248 * Lw * e.tg / 1000, 6)
    // Thornton's mean length: both ends of the section sit ON a face (0), the
    // centre is min(sEnd − eb/c, sEnd − ec/c) = 98.86 behind it
    expect(e.whitmore.L).toBeCloseTo(Math.min(sEnd - 155 / c, sEnd - 153.5 / c) / 3, 6)
  })
  it('the gusset is convex, lies off both frame faces, and holds the welds and the Whitmore section', () => {
    const o = e.outline
    const cross = o.map((p, k) => {
      const q = o[(k + 1) % o.length], r = o[(k + 2) % o.length]
      return (q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0])
    })
    expect(cross.every((x) => x > -1e-6) || cross.every((x) => x < 1e-6)).toBe(true)
    for (const p of o) { expect(p[0]).toBeGreaterThanOrEqual(153.5 - 1e-6); expect(p[1]).toBeGreaterThanOrEqual(155 - 1e-6) }
    const ux = Math.SQRT1_2, uy = Math.SQRT1_2, half = 127 / 2
    const inside = (q: [number, number]) => clipSegment(q, q, o) != null
    for (const s of [e.sEnd, e.sWeld]) for (const sg of [-1, 1]) expect(inside([s * ux - sg * half * uy, s * uy + sg * half * ux])).toBe(true)
    for (const q of e.whitmore.ends) expect(inside(q)).toBe(true)
    // the interfaces the UFM forces are spread over are the plate's own edges
    expect(Math.max(...o.filter((p) => Math.abs(p[1] - 155) < 1e-6).map((p) => p[0])) - 153.5).toBeCloseTo(e.ufm.Lh, 6)
    expect(Math.max(...o.filter((p) => Math.abs(p[0] - 153.5) < 1e-6).map((p) => p[1])) - 155).toBeCloseTo(e.ufm.Lv, 6)
  })
  it('a gusset on a base plate with no column takes the whole force on the plate (r = 0)', () => {
    const b = designBraceEnd(hss127, 400, 300, { kind: 'base', eb: 0, ec: 0, theta: Math.PI / 4 }, 450)!
    expect(b.ufm.Hb).toBeCloseTo(b.P * Math.SQRT1_2, 9)
    expect(b.ufm.Vb).toBeCloseTo(b.P * Math.SQRT1_2, 9)
    expect(b.ufm.Hc + b.ufm.Vc).toBe(0)
    expect(Number.isFinite(b.util)).toBe(true)
  })
  it('UFM: α − β·tanθ = eb·tanθ − ec, and the interface forces add back to the brace force', () => {
    const u = e.ufm, t = Math.tan(frame.theta)
    expect(u.alpha - u.beta * t).toBeCloseTo(frame.eb * t - frame.ec, 6)
    // horizontal and vertical components of P, whichever interface carries them
    expect(u.Hb + u.Hc).toBeCloseTo(e.P * Math.sin(frame.theta), 6)
    expect(u.Vb + u.Vc).toBeCloseTo(e.P * Math.cos(frame.theta), 6)
    expect(u.weldBeam).toBeGreaterThanOrEqual(5)
    expect(e.ok).toBe(true)
  })
  it('the brace end clears the frame faces: both corners of the HSS outside the beam and column by ≥ 25 mm', () => {
    const ux = Math.sin(frame.theta), uy = Math.cos(frame.theta), half = 127 / 2
    for (const sgn of [-1, 1]) {
      const x = e.sEnd * ux + sgn * half * -uy, y = e.sEnd * uy + sgn * half * ux
      expect(x).toBeGreaterThanOrEqual(frame.ec + 25 - 1e-6)
      expect(y).toBeGreaterThanOrEqual(frame.eb + 25 - 1e-6)
    }
  })
  it('a member needing more effective area lengthens the welds for U', () => {
    const need = designBraceEnd(hss127, 400, 300, frame, 450, 248, 400, 2300)!
    expect(need.U * need.An).toBeGreaterThanOrEqual(2300 - 1e-6)
    expect(need.weld.lw).toBeGreaterThan(e.weld.lw)
  })
  it('round HSS reaches U = 1 at lw ≥ 1.3D (Table D3.1 case 5)', () => {
    expect(slottedU({ H: 100, xbar: 100 / Math.PI, round: true }, 130)).toBe(1)
    expect(slottedU({ H: 100, xbar: 100 / Math.PI, round: true }, 110)).toBeCloseTo(1 - (100 / Math.PI) / 110, 12)
  })
  it('W braces are not slotted-HSS ends', () => {
    expect(designBraceEnd(shapeByName('W200x46.1')!, 100, 100, frame)).toBeNull()
  })
})

describe('gusset geometry helpers', () => {
  it('convex hull, half-plane clip and segment clip on a unit square', () => {
    const sq = convexHull([[0, 0], [1, 0], [1, 1], [0, 1], [0.5, 0.5]])
    expect(sq).toHaveLength(4)
    const cut = clipHalfPlane(sq, 1, 0, 0.25)                 // x ≥ 0.25
    expect(Math.min(...cut.map((p) => p[0]))).toBe(0.25)
    const seg = clipSegment([-1, 0.5], [2, 0.5], cut)!
    expect(seg[0][0]).toBeCloseTo(0.25, 12); expect(seg[1][0]).toBeCloseTo(1, 12)
    expect(clipSegment([-1, 2], [2, 2], cut)).toBeNull()
  })
})
