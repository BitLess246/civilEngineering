import { describe, it, expect } from 'vitest'
import { designPedestal, pedestalSide } from './pedestal'
import { interaction } from './columnDesign'

const base = { fc: 28, fy: 415, height: 1.2, barDia: 16, tieDia: 10, cover: 40 }
const axial = (Pu: number) => ({ Pu, Mx: 0, Mz: 0, Vx: 0, Vz: 0 })

describe('pedestal — size', () => {
  it('a W310x79 (d 306, bf 254) gets 306 + 250 → 600 mm; a 300×400 post 400 + 300 → 700', () => {
    expect(pedestalSide('steel', 306, 254)).toBe(600)
    // the post base's ⌀16 rods at d/2 + 50 = 250 stand 100 mm from the face ≥ 6·16 (§17.7.2)
    expect(pedestalSide('wood', 400, 300)).toBe(700)
    expect(pedestalSide('steel', 100, 100)).toBe(400)   // the floor
    expect(pedestalSide('wood', 0, 0)).toBe(300)
  })
})

describe('pedestal — design (hand calcs on a 600 × 600 × 1.2 m block)', () => {
  const p = designPedestal({ column: 'steel', colD: 306, colB: 254, ...base, cases: [axial(400)] })

  it('weighs γc·b²·h = 24 × 0.36 × 1.2 = 10.37 kN', () => {
    expect(p.weight).toBeCloseTo(24 * 0.36 * 1.2, 6)
  })

  it('starts at ρ = 1% (§410.6.1.1): 3600 mm² of ⌀16 = 17.9 → 20 bars in fours', () => {
    expect(p.bars).toBe(20)
    expect(p.rho).toBeCloseTo((20 * Math.PI * 64) / 360000, 9)
  })

  it('ties at min(16·16, 48·10, 600) = 256 → 250 (§425.7.2.1)', () => {
    expect(p.tieSpacing).toBe(250)
  })

  it('a concentric load is checked against φPn,max = 0.65·0.80·[0.85f′c(Ag − Ast) + fy·Ast], with its own weight at 1.2', () => {
    const Ast = 20 * Math.PI * 64
    const phiPnMax = (0.65 * 0.8 * (0.85 * 28 * (360000 - Ast) + 415 * Ast)) / 1000
    expect(p.phiPnMax).toBeCloseTo(phiPnMax, 3)
    expect(p.util).toBeCloseTo((400 + 1.2 * p.weight) / phiPnMax, 6)
    expect(p.ok).toBe(true)
  })

  it('the base shear acts over the pedestal height: Mu at the base = M + V·h, each axis', () => {
    const q = designPedestal({ column: 'steel', colD: 306, colB: 254, ...base, cases: [{ Pu: 300, Mx: 20, Mz: 10, Vx: 15, Vz: 25 }] })
    expect(q.Mux).toBeCloseTo(20 + 25 * 1.2, 9)
    expect(q.Muz).toBeCloseTo(10 + 15 * 1.2, 9)
    // linear load contour at the factored axial load
    expect(q.util).toBeCloseTo(Math.max(q.Pu / q.phiPnMax, (q.Mux + q.Muz) / q.phiMn), 9)
    // φMn at that load lies on the section's own φ-scaled interaction curve
    const r = interaction({ b: 600, h: 600, cover: 40, barDia: 16, tieDia: 10, fc: 28, fy: 415, numBars: q.bars, layout: 'all-around' })
    expect(q.phiMn).toBeLessThanOrEqual(Math.max(...r.curve.map((c) => c.phi * c.Mn)) + 1e-9)
    expect(q.phiMn).toBeGreaterThan(0)
  })

  it('adds bars in fours until the moment is carried, and fails honestly past 4%', () => {
    const big = designPedestal({ column: 'steel', colD: 306, colB: 254, ...base, cases: [{ Pu: 200, Mx: 600, Mz: 0, Vx: 0, Vz: 0 }] })
    expect(big.bars).toBeGreaterThan(20)
    expect(big.bars % 4).toBe(0)
    expect(big.ok).toBe(big.util <= 1)
    const huge = designPedestal({ column: 'steel', colD: 306, colB: 254, ...base, cases: [{ Pu: 200, Mx: 5000, Mz: 0, Vx: 0, Vz: 0 }] })
    expect(huge.ok).toBe(false)
    expect(huge.rho).toBeLessThanOrEqual(0.04)
  })

  it('a net uplift is carried by the bars alone: Tu ≤ 0.9·As·fy', () => {
    const u = designPedestal({ column: 'steel', colD: 306, colB: 254, ...base, cases: [axial(-100)] })
    const Tu = 100 - 1.2 * u.weight
    expect(u.Tu).toBeCloseTo(Tu, 9)
    expect(u.util).toBeCloseTo((Tu * 1000) / (0.9 * u.bars * Math.PI * 64 * 415), 9)
  })
})

// ── In the pipeline ──────────────────────────────────────────────────────────
import { generateGridModel, buildGravityLoads } from './modelBuilder'
import { designStructure } from './pipeline'
import { estimateTakeoff } from './takeoff'
import { buildStructureCages, pedestalMark } from './cageBuilder'
import { pedestalMarks } from '../lib/planDetails'
import type { RectSection } from './model'

describe('pipeline — steel and timber columns stand on RC pedestals', () => {
  const soil = { qAllow: 200, gammaSoil: 18, gammaConc: 24, H: 1.5 }
  const mat = { fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
  const steel: RectSection = { id: 'S', name: 'W310x79', b: 254, h: 306, ...mat, material: 'steel', shape: 'W310x79', steelFy: 345, steelFu: 448 }
  const grid = (sec: RectSection) => {
    const m = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3.5, 3], section: sec, slabThickness: 150 })
    m.loads = buildGravityLoads(m, 1.0, 1.9)
    return m
  }
  const m = grid(steel)
  const d = designStructure(m, soil)!

  it('designs one pedestal per steel column base, as tall as its pad leaves: H − Dc', () => {
    expect(d.pedestals).toHaveLength(6)
    for (const p of d.pedestals!) {
      const f = d.footings.find((x) => x.node === p.node)!
      expect(p.design.height).toBeCloseTo(soil.H - f.design.Dc / 1000, 9)
      // the column rule gives 306 + 250 → 600, but the rods stand outside the
      // flanges at ±197 and need 6·da = 150 to the faces: 2·(197 + 150) → 700
      expect(p.design.side).toBe(700)
      expect(p.ok).toBe(true)
    }
  })

  it('leaves the steel column base at grade — no steel runs down to the pad, so tonnage is the BOQ’s', () => {
    const base = d.steelColumns.filter((c) => c.id.endsWith('.0'))
    for (const c of base) expect(c.L).toBeCloseTo(3.5, 9)
    expect(d.totals.steelKg).toBeCloseTo(estimateTakeoff(m, d).structuralSteelKg, 3)
  })

  it('bears every base plate on its pedestal: √(A2/A1) > 1', () => {
    expect(d.basePlates).toHaveLength(6)
    for (const b of d.basePlates) expect(b.design.sqrtRatio).toBeGreaterThan(1)
  })

  it('anchors every base plate in the pedestal by ACI 318-14 Ch. 17: rods outside the flanges, 6·da to the faces, every case checked', () => {
    for (const b of d.basePlates) {
      const ped = d.pedestals!.find((p) => p.node === b.node)!.design
      expect(b.anchors).toBeDefined()
      const a = b.anchors!
      // W310x79: d = 307 — rod centre 153.5 + max(40, 1.75·25) = 197.25 off the web line
      expect(b.design.rodX).toBeCloseTo(307 / 2 + 43.75, 6)
      expect(ped.side / 2 - b.design.rodX).toBeGreaterThanOrEqual(6 * a.da)
      expect(a.check.edgeOK && a.check.spacingOK).toBe(true)
      expect(a.hef).toBeLessThanOrEqual(ped.height * 1000 - 100)
      // four edges inside 1.5·hef — the §17.4.2.3 h′ef is what the concrete saw
      expect(a.check.hefUsed).toBeLessThanOrEqual(a.hef)
      expect(a.check.ok).toBe(true)
      expect(b.ok).toBe(true)
    }
  })

  it('each pad is designed around its pedestal, and stands 150 mm proud of it all round', () => {
    for (const f of d.footings) {
      const ped = d.pedestals!.find((p) => p.node === f.node)!.design
      expect(f.design.B * 1000).toBeGreaterThanOrEqual(ped.side + 300 - 1e-6)
    }
  })

  it('the footing carries the pedestal’s weight', () => {
    const plain = designStructure(grid({ ...steel, material: undefined, shape: undefined, b: 254, h: 306 }), soil)!
    expect(plain.pedestals).toEqual([])
    const f = d.footings[0], w = 24 * 0.36 * soil.H
    expect(f.P).toBeGreaterThanOrEqual(w)
  })

  it('cages each pedestal: its bars from the pad to under the top cover, two anchor-bolt tie sets in the top 125 mm (§410.7.6.1.6)', () => {
    const { cages } = buildStructureCages(m, d)
    for (const p of d.pedestals!) {
      const c = cages.find((x) => x.member === pedestalMark(p.node))!
      const at = m.nodes.find((n) => n.id === p.node)!
      const verts = c.runs.filter((r) => r.role === 'vertical')
      expect(verts).toHaveLength(p.design.bars)
      for (const v of verts) {
        const ys = v.path.map((q) => q[1])
        expect(Math.max(...ys)).toBeCloseTo(at.y - 0.04, 6)                  // 40 cover
        expect(Math.min(...ys)).toBeCloseTo(at.y - p.design.height, 6)       // pad top
        expect(v.dia).toBe(p.design.barDia)
      }
      // a tie SET is a hoop plus its cross ties, stacked a diameter apart
      const topSets = new Set(c.runs
        .filter((r) => (r.role === 'tie' || r.role === 'hoop') && r.path[0]![1] > at.y - 0.125)
        .map((r) => Math.round((r.path[0]![1] - at.y) / 0.03)))
      expect(topSets.size).toBeGreaterThanOrEqual(2)
    }
  })

  it('sets the footing dowels out on the pedestal’s bars, not on the steel section’s nominal ones', () => {
    const { cages } = buildStructureCages(m, d)
    const p = d.pedestals![0]!
    const ped = cages.find((x) => x.member === pedestalMark(p.node))!
    const ftg = cages.find((x) => x.member === `F-${p.node}`)!
    const dowels = ftg.runs.filter((r) => r.role === 'dowel')
    expect(dowels).toHaveLength(p.design.bars)
    const key = (q: readonly number[]) => `${q[0]!.toFixed(3)},${q[2]!.toFixed(3)}`
    const barsAt = new Set(ped.runs.filter((r) => r.role === 'vertical').map((r) => key(r.path[0]!)))
    for (const dw of dowels) expect(barsAt.has(key(dw.path[dw.path.length - 1]!))).toBe(true)
  })

  it('bills each pedestal: side²·h of concrete, 4·side·h of forms, its cage’s steel, and the plates and rods on top', () => {
    const t = estimateTakeoff(m, d)
    const rows = t.byElement.filter((e) => e.kind === 'Pedestal')
    expect(rows).toHaveLength(6)
    for (const r of rows) {
      const p = d.pedestals!.find((x) => x.node === r.id)!.design
      const s = p.side / 1000
      expect(r.concreteM3).toBeCloseTo(s * s * p.height, 9)
      expect(r.formworkM2).toBeCloseTo(4 * s * p.height, 9)
      // n-⌀20 × (h − 40 cover) alone is 2.47 kg/m each; ties on top
      expect(r.steelKg).toBeGreaterThan(p.bars * 2.466 * (p.height - 0.04))
      expect(r.steelKg).toBeLessThan(p.bars * 2.466 * p.height * 2)
    }
    const conc = t.boq.find((b) => b.item === 'Pedestal — concrete')!
    expect(conc.qty).toBeCloseTo(rows.reduce((a, r) => a + r.concreteM3, 0), 9)
    const plates = t.boq.filter((b) => b.item.startsWith('Base plate PL '))
    expect(plates.reduce((a, b) => a + b.qty, 0)).toBe(6)
    const rods = t.boq.filter((b) => b.item.startsWith('Anchor rod ⌀25'))
    expect(rods.reduce((a, b) => a + b.qty, 0)).toBe(24)
    // the plates are hardware, not part of the frame's structural tonnage
    expect(d.totals.steelKg).toBeCloseTo(t.structuralSteelKg, 3)
  })

  it('marks pedestals PD-n by type: same size, bars, ties and height share a mark', () => {
    const marks = pedestalMarks(d)
    expect(marks.size).toBe(6)
    const sig = (n: string) => { const x = d.pedestals!.find((p) => p.node === n)!.design; return `${x.side}${x.bars}${x.tieSpacing}${x.height}` }
    for (const [a, ma] of marks) for (const [b, mb] of marks) expect(ma === mb).toBe(sig(a) === sig(b))
  })

  it('an RC frame is unchanged: no pedestals, bases lowered to the pad as before', () => {
    const rc = grid({ ...steel, material: undefined, shape: undefined, b: 400, h: 400 })
    const r = designStructure(rc, soil)!
    expect(r.pedestals).toEqual([])
    expect(r.columns.filter((c) => c.id.endsWith('.0')).every((c) => c.L > 3.5)).toBe(true)
  })
})
