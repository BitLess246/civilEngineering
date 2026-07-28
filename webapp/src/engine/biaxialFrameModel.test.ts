import { describe, it, expect } from 'vitest'
import {
  weakPlasticMoment, modelToBiaxialFrame, runBiaxialPushover, summarizeBiaxialPushover,
} from './biaxialFrameModel'
import { plasticMoment } from './pushoverModel'
import { modelToFrame3D } from './modelBridge'
import { generateGridModel } from './modelBuilder'
import { shapeByName } from './aiscSections'
import { deriveWSection } from './steelDesign'
import type { RectSection, StructuralModel } from './model'

const rc = (o: Partial<RectSection> = {}): RectSection => ({
  id: 's', name: 's', b: 400, h: 400, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40, ...o,
})

/** Square plan, square sections — 4-fold symmetric, so 0°/90°/180° must agree. */
const symmetricModel = (): StructuralModel =>
  generateGridModel({ baysX: [5], baysZ: [5], storeyH: [3, 3], section: rc() })

describe('weakPlasticMoment', () => {
  it('equals the strong-axis capacity for a square section', () => {
    const s = rc({ b: 400, h: 400 })
    expect(weakPlasticMoment(s)).toBeCloseTo(plasticMoment(s), 9)
  })

  it('is the strong-axis formula on the section with b and h swapped', () => {
    const s = rc({ b: 300, h: 600 })
    expect(weakPlasticMoment(s)).toBeCloseTo(plasticMoment({ ...s, b: 600, h: 300 }), 9)
    // and a deep section is genuinely weaker the other way
    expect(weakPlasticMoment(s)).toBeLessThan(plasticMoment(s))
  })

  it('uses Fy·Zy for a steel W-shape', () => {
    const shape = shapeByName('W310x79')!
    const s = rc({ material: 'steel', shape: 'W310x79', steelFy: 345 })
    expect(weakPlasticMoment(s)).toBeCloseTo((345 * deriveWSection(shape).Zy) / 1e6, 9)
    // Zy ≪ Zx for a wide flange, so the weak axis is much weaker
    expect(weakPlasticMoment(s)).toBeLessThan(0.5 * plasticMoment(s))
  })
})

describe('modelToBiaxialFrame — bridge', () => {
  const model = symmetricModel()

  it('maps members 1:1 and inherits geometry from modelToFrame3D', () => {
    const br = modelToBiaxialFrame(model)!
    const ref = modelToFrame3D(model, { useShells: false })
    expect(br.members.length).toBe(ref.members.length)
    expect(br.nodes.length).toBe(ref.nodes.length)
    for (let k = 0; k < br.members.length; k++) {
      const a = br.members[k], b = ref.members[k]
      expect(a.id).toBe(b.id)
      // section properties are inherited, never re-derived
      for (const f of ['E', 'G', 'A', 'Iy', 'Iz', 'J'] as const) expect(a[f]).toBe(b[f])
      expect(a.rot).toBe(b.rot)
    }
  })

  it('gives every member both plastic capacities and an axial capacity', () => {
    const br = modelToBiaxialFrame(model)!
    expect(br.nHingeable).toBe(br.members.length)
    for (const m of br.members) {
      expect(m.Mpy, m.id).toBeGreaterThan(0)
      expect(m.Mpz, m.id).toBeGreaterThan(0)
      expect(m.Pcap, m.id).toBeGreaterThan(0)
    }
  })

  it('leaves every member elastic under `elastic`', () => {
    const br = modelToBiaxialFrame(model, { elastic: true })!
    expect(br.nHingeable).toBe(0)
    for (const m of br.members) {
      expect(m.Mpy).toBeUndefined()
      expect(m.Mpz).toBeUndefined()
    }
  })

  it('reports — never silently drops — releases and offsets it cannot represent', () => {
    const clean = modelToBiaxialFrame(model)!
    expect(clean.unsupported.releases).toEqual([])
    expect(clean.unsupported.offsets).toEqual([])

    const withRel: StructuralModel = {
      ...model,
      members: model.members.map((m, k) => (k === 0
        ? { ...m, releases: { jEnd: { Mz: true } } }
        : k === 1 ? { ...m, offsets: { iEnd: [0, 0.2, 0] as [number, number, number] } } : m)),
    }
    const br = modelToBiaxialFrame(withRel)!
    expect(br.unsupported.releases).toEqual([model.members[0].id])
    expect(br.unsupported.offsets).toEqual([model.members[1].id])
  })
})

describe('runBiaxialPushover — skew push on the real 3-D model', () => {
  const model = symmetricModel()
  // Each push is a full nonlinear trace; several tests want the same one, so
  // memoise by option set rather than re-solving.
  const cache = new Map<string, NonNullable<ReturnType<typeof runBiaxialPushover>>>()
  const push = (o: Parameters<typeof runBiaxialPushover>[1] = {}) => {
    const k = JSON.stringify(o)
    const hit = cache.get(k)
    if (hit) return hit
    const r = runBiaxialPushover(model, { steps: 10, ...o })!
    cache.set(k, r)
    return r
  }

  it('normalises the pattern so the load factor IS the base shear', () => {
    const r = push()
    const total = r.input.loads.reduce((s, l) => s + Math.hypot(l.Fx ?? 0, l.Fz ?? 0), 0)
    expect(total).toBeCloseTo(1, 9)
  })

  it('converges at every step of the push', () => {
    for (const angleDeg of [0, 45, 90]) {
      const r = push({ angleDeg })
      const bad = r.result.steps.filter((s) => !s.converged)
      expect(bad.length, `${angleDeg}°: ${bad.length} non-converged`).toBe(0)
      expect(Math.max(...r.result.steps.map((s) => s.residual))).toBeLessThan(1e-8)
    }
  })

  it('respects plan symmetry — 0°, 90° and 180° give the same capacity', () => {
    // The model is 4-fold symmetric with square sections, so any difference here
    // is the bridge or the solver leaking an axis preference. Bit-identical is
    // the right bar: the three problems are the same problem relabelled.
    const at0 = push({ angleDeg: 0 }).peakShear
    for (const angleDeg of [90, 180]) {
      expect(Math.abs(push({ angleDeg }).peakShear - at0) / at0, `${angleDeg}°`).toBeLessThan(1e-12)
    }
    expect(at0).toBeGreaterThan(0)
  })

  it('yields hinges and reports a monotone-rising capacity curve', () => {
    const r = push({ angleDeg: 0 })
    expect(r.yieldedHinges).toBeGreaterThan(0)
    expect(r.curve.length).toBe(10)
    expect(r.peakShear).toBeGreaterThan(0)
    expect(r.controlDir).toBe('x')
    // displacement control marches the control DOF monotonically
    const d = r.curve.map((c) => Math.abs(c.disp))
    for (let k = 1; k < d.length; k++) expect(d[k]).toBeGreaterThan(d[k - 1])
  })

  it('stays elastic and linear when hinges are switched off', () => {
    const r = push({ angleDeg: 0, elastic: true })
    expect(r.yieldedHinges).toBe(0)
    // base shear proportional to displacement ⇒ constant secant
    const k = r.curve.map((c) => c.shear / c.disp)
    for (const v of k) expect(v).toBeCloseTo(k[0], 6)
  })

  it('the diagonal push engages both frame lines, so it is not simply weaker', () => {
    // A symmetric moment frame pushed on the diagonal recruits BOTH orthogonal
    // frame systems, so its base-shear capacity sits between the principal-
    // direction value and the √2 you would get if the two added freely.
    const at0 = push({ angleDeg: 0 }).peakShear
    const at45 = push({ angleDeg: 45 }).peakShear
    expect(at45).toBeGreaterThan(at0)
    expect(at45).toBeLessThan(Math.SQRT2 * at0)
  })

  it('the biaxial COUPLING is what limits the diagonal capacity', () => {
    // α controls how strongly the two bending axes interact: α = 2 is the
    // ellipse, larger α relaxes toward the uncoupled box where each axis yields
    // independently. Weakening the coupling must buy capacity on the diagonal —
    // and must change nothing at 0°, where the demand is uniaxial and the
    // coupling is never engaged. The second half is the sharper check.
    const skew2 = push({ angleDeg: 45, surface: { kind: 'power', alpha: 2 } }).peakShear
    const skew4 = push({ angleDeg: 45, surface: { kind: 'power', alpha: 4 } }).peakShear
    expect(skew4).toBeGreaterThan(skew2)

    const ax2 = push({ angleDeg: 0, surface: { kind: 'power', alpha: 2 } }).peakShear
    const ax4 = push({ angleDeg: 0, surface: { kind: 'power', alpha: 4 } }).peakShear
    expect(Math.abs(ax4 - ax2) / ax2).toBeLessThan(1e-9)
  })

  it('is independent of the hinge penalty stiffness once converged', () => {
    // `rigidity` is a numerical device, not a property of the structure, so a
    // converged capacity must not depend on it. This is the check that caught a
    // real defect: at the original backtracking depth the push failed to
    // converge at high rigidity and reported 287 kN instead of 405 kN.
    const peaks = [1e2, 1e3, 1e4].map((rigidity) => push({ angleDeg: 0, rigidity }).peakShear)
    for (const p of peaks) expect(p / peaks[0]).toBeCloseTo(1, 2)
  })
})

describe('summarizeBiaxialPushover', () => {
  const model = symmetricModel()
  const run = runBiaxialPushover(model, { angleDeg: 45, steps: 10 })!

  it('reports the headline numbers straight from the trace', () => {
    const s = summarizeBiaxialPushover(run)
    expect(s.peakShear).toBe(run.peakShear)
    expect(s.yielded).toBe(run.result.hinges.filter((h) => h.yielded).length)
    expect(s.nHingeable).toBe(run.bridge.nHingeable)
    expect(s.drift).toBeCloseTo(s.peakDisp / run.totalHeight, 12)
    expect(s.nonConverged).toBe(0)
    expect(s.warnings).toEqual([])
  })

  it('ranks hinges by utilisation and honours the limit', () => {
    const s = summarizeBiaxialPushover(run, 5)
    expect(s.worst.length).toBe(5)
    for (let k = 1; k < s.worst.length; k++) {
      expect(s.worst[k].utilisation).toBeLessThanOrEqual(s.worst[k - 1].utilisation)
    }
    // the most-utilised hinge is the most-utilised hinge in the full result
    expect(s.worst[0].utilisation).toBe(Math.max(...run.result.hinges.map((h) => h.utilisation)))
  })

  it('warns — in words — about model features the hinge element dropped', () => {
    const withRel: StructuralModel = {
      ...model,
      members: model.members.map((m, k) => (k === 0 ? { ...m, releases: { jEnd: { Mz: true } } } : m)),
    }
    const r = runBiaxialPushover(withRel, { angleDeg: 0, steps: 6 })!
    const s = summarizeBiaxialPushover(r)
    expect(s.warnings.length).toBeGreaterThan(0)
    expect(s.warnings.join(' ')).toMatch(/release/i)
    // the caution says what it means for the answer, not just that it happened
    expect(s.warnings.join(' ')).toMatch(/stiffer and stronger/i)
  })

  it('says so when nothing could yield', () => {
    const r = runBiaxialPushover(model, { angleDeg: 0, steps: 4, elastic: true })!
    const s = summarizeBiaxialPushover(r)
    expect(s.nHingeable).toBe(0)
    expect(s.warnings.join(' ')).toMatch(/purely elastic/i)
  })
})
