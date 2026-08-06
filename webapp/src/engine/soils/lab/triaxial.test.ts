import { describe, it, expect } from 'vitest'
import { triaxial, fitTangent, failurePoint, type TriaxialSpecimen, type MohrCircle } from './triaxial'
import { mohrChart } from './plots'
import { evaluateTest, summarise, readTriaxial, labSpec, isImplemented } from './index'
import type { LabTest } from '../model'

// ─────────────────────────────────────────────────────────────────────────
// ASTM D2850 / D4767 / D7181. The reduction is the whole test, and the trap is
// specific: the envelope is the COMMON TANGENT to the circles, while the line
// through their crowns (the Kf line) has slope sin φ. Reading tan φ off the
// second overstates φ by several degrees.
//
// So the tests plant a KNOWN c and φ, build circles that touch that envelope
// exactly, and demand the pair back — then check tangency directly, by
// measuring the distance from every centre to the fitted line.
// ─────────────────────────────────────────────────────────────────────────

const DEG = Math.PI / 180

/**
 * A specimen whose Mohr circle is exactly tangent to τ = c + σ·tan φ.
 *
 * From the tangency condition radius = c·cos φ + p·sin φ with p = σ3 + radius:
 *   q = (c·cos φ + σ3·sin φ)/(1 − sin φ)
 */
function tangentSpecimen(sigma3: number, c: number, phi: number): TriaxialSpecimen {
  const s = Math.sin(phi * DEG)
  const q = (c * Math.cos(phi * DEG) + sigma3 * s) / (1 - s)
  return { cellPressure: sigma3, deviatorStress: 2 * q }
}

/** Perpendicular distance from a circle's centre to τ = c + σ·tan φ. */
const distanceToEnvelope = (circle: MohrCircle, c: number, phi: number) =>
  (c + circle.center * Math.tan(phi * DEG)) * Math.cos(phi * DEG)

describe('the envelope is the common tangent to the circles', () => {
  it('recovers a planted c′ = 15 kPa, φ′ = 30°', () => {
    const r = triaxial({
      testType: 'CD',
      specimens: [100, 200, 300].map((s3) => tangentSpecimen(s3, 15, 30)),
    })
    expect(r.total!.cohesion).toBeCloseTo(15, 8)
    expect(r.total!.frictionAngle).toBeCloseTo(30, 8)
    expect(r.total!.r2).toBeCloseTo(1, 10)
  })

  it('recovers a cohesionless c′ = 0, φ′ = 36°', () => {
    const r = triaxial({
      testType: 'CD',
      specimens: [50, 100, 200, 400].map((s3) => tangentSpecimen(s3, 0, 36)),
    })
    expect(r.total!.cohesion).toBeCloseTo(0, 8)
    expect(r.total!.frictionAngle).toBeCloseTo(36, 8)
  })

  it('touches every circle exactly — distance from centre equals radius', () => {
    // This is the property, not a proxy for it: an envelope fitted through the
    // crowns of the circles would fail here by tens of kPa.
    const r = triaxial({
      testType: 'CD',
      specimens: [75, 150, 225, 300].map((s3) => tangentSpecimen(s3, 22, 28)),
    })
    const { cohesion, frictionAngle } = r.total!
    for (const c of r.circles) {
      expect(distanceToEnvelope(c, cohesion, frictionAngle)).toBeCloseTo(c.radius, 8)
    }
  })

  it('is NOT the line through the tops of the circles', () => {
    // sin φ = tan α, so a Kf line at α = 30° is φ = 35.264°. Reading that 30°
    // as a friction angle is the classic error, and it costs 5.3°.
    const phi = Math.asin(Math.tan(30 * DEG)) / DEG
    expect(phi).toBeCloseTo(35.264, 3)
    const r = triaxial({ testType: 'CD', specimens: [100, 200, 300].map((s3) => tangentSpecimen(s3, 0, phi)) })
    expect(r.total!.kf.alpha).toBeCloseTo(30, 8)
    expect(r.total!.frictionAngle).toBeCloseTo(phi, 8)
    expect(r.total!.frictionAngle - r.total!.kf.alpha).toBeGreaterThan(5)
  })

  it('σ1 = σ3·Nφ + 2c√Nφ holds for the recovered pair', () => {
    // The textbook form of the same relation, as an independent check.
    const c = 12, phi = 26
    const r = triaxial({ testType: 'CD', specimens: [80, 160, 240].map((s3) => tangentSpecimen(s3, c, phi)) })
    const nPhi = Math.tan((45 + phi / 2) * DEG) ** 2
    for (const circle of r.circles) {
      expect(circle.sigma1).toBeCloseTo(circle.sigma3 * nPhi + 2 * c * Math.sqrt(nPhi), 6)
    }
  })

  it('declines an impossible envelope instead of reporting φ = 90°', () => {
    // A Kf line at 45° means sin φ = 1. Transcribed cell pressures do this.
    const bad = fitTangent([
      { sigma3: 0, sigma1: 100, center: 50, radius: 50 },
      { sigma3: 0, sigma1: 300, center: 150, radius: 150 },
    ])
    expect(bad).toBeUndefined()
  })

  it('refuses φ when the Kf line reaches 45°, and disbelieves it just below', () => {
    // Exactly 45° has no φ at all; a hair under it has one arithmetically, and
    // the module reports it while saying no soil sustains it. Silently printing
    // φ = 89.7° is the failure mode both halves of this guard exist to stop.
    const r = triaxial({
      testType: 'CD',
      specimens: [{ cellPressure: 0, deviatorStress: 100 }, { cellPressure: 0.001, deviatorStress: 300 }],
    })
    expect(r.total!.frictionAngle).toBeGreaterThan(80)
    expect(r.notes.join(' ')).toMatch(/above anything a soil sustains/)
  })
})

describe('the stresses ON the failure plane', () => {
  // The pair the results table prints, and the one it is easy to get wrong:
  // the crown of the circle is τmax on a plane at 45°, which is NOT where the
  // specimen failed and is larger by 1/cos φ.
  const r = triaxial({
    testType: 'CD',
    specimens: [100, 200, 300].map((s3) => tangentSpecimen(s3, 15, 30)),
  })

  it('is attached to every circle once an envelope exists', () => {
    expect(r.circles.every((c) => c.failure)).toBe(true)
    const one = triaxial({ testType: 'UU', specimens: [{ cellPressure: 100, deviatorStress: 90 }] })
    expect(one.circles[0].failure).toBeUndefined()   // no envelope, no tangency
  })

  it('matches σf = p − r·sin φ and τf = r·cos φ', () => {
    const phi = (30 * Math.PI) / 180
    for (const c of r.circles) {
      expect(c.failure!.sigma).toBeCloseTo(c.center - c.radius * Math.sin(phi), 8)
      expect(c.failure!.tau).toBeCloseTo(c.radius * Math.cos(phi), 8)
    }
  })

  it('lies ON the envelope and ON the circle — it is the tangency', () => {
    const { cohesion, frictionAngle } = r.total!
    const tan = Math.tan((frictionAngle * Math.PI) / 180)
    for (const c of r.circles) {
      const f = c.failure!
      // on the line τ = c + σ·tan φ
      expect(f.tau).toBeCloseTo(cohesion + f.sigma * tan, 8)
      // and on the circle: distance from the centre is the radius
      expect(Math.hypot(f.sigma - c.center, f.tau)).toBeCloseTo(c.radius, 8)
    }
  })

  it('carries LESS shear than the crown, by exactly cos φ', () => {
    for (const c of r.circles) {
      expect(c.failure!.tau).toBeLessThan(c.radius)
      expect(c.radius * Math.cos((30 * Math.PI) / 180)).toBeCloseTo(c.failure!.tau, 8)
      // quoting τmax would overstate the failure shear by 1/cos 30° = 15.5%
      expect(c.radius / c.failure!.tau).toBeCloseTo(1 / Math.cos((30 * Math.PI) / 180), 8)
    }
  })

  it('puts the failure plane at θ = 45 + φ/2', () => {
    expect(r.circles[0].failure!.theta).toBeCloseTo(60, 8)         // 45 + 30/2
    // and the arc from the σ1 end to the tangency subtends 2θ
    const c = r.circles[0], f = c.failure!
    const twoTheta = (Math.atan2(f.tau, f.sigma - c.center) * 180) / Math.PI
    expect(twoTheta).toBeCloseTo(2 * f.theta, 6)
  })

  it('degenerates correctly for a φ = 0 saturated UU test', () => {
    // Horizontal envelope: the failure plane IS the plane of maximum shear, at
    // 45°, and τf = su exactly.
    const uu = triaxial({
      testType: 'UU',
      specimens: [50, 100, 200].map((c) => ({ cellPressure: c, deviatorStress: 90 })),
    })
    for (const c of uu.circles) {
      expect(c.failure!.theta).toBeCloseTo(45, 6)
      expect(c.failure!.tau).toBeCloseTo(c.radius, 6)
      expect(c.failure!.tau).toBeCloseTo(uu.undrainedStrength!, 6)
      expect(c.failure!.sigma).toBeCloseTo(c.center, 6)
    }
  })

  it('is computed once — the chart reads the same point the table prints', () => {
    // failurePoint is exported so this identity is checkable rather than
    // duplicated: two readings of one construction is how they drift apart.
    const c = r.circles[1]
    expect(failurePoint(c, r.total!)).toEqual(c.failure)
  })

  it('is attached in the EFFECTIVE basis from the effective envelope', () => {
    const cu = triaxial({
      testType: 'CU',
      specimens: [100, 200, 300].map((s3, i) => {
        const sp = tangentSpecimen(s3, 5, 32)
        return { cellPressure: s3 + 40 * (i + 1), deviatorStress: sp.deviatorStress, porePressure: 40 * (i + 1) }
      }),
    })
    const e = cu.effective!
    for (const c of cu.effectiveCircles!) {
      expect(c.failure!.tau).toBeCloseTo(e.cohesion + c.failure!.sigma * Math.tan((e.frictionAngle * Math.PI) / 180), 8)
      expect(c.failure!.theta).toBeCloseTo(45 + 32 / 2, 6)
    }
    // the total circles use the TOTAL envelope, so their planes differ
    expect(cu.circles[0].failure!.theta).not.toBeCloseTo(cu.effectiveCircles![0].failure!.theta, 3)
  })
})

describe('UU on a saturated clay', () => {
  const uu = (su: number, cells: number[]) =>
    triaxial({ testType: 'UU', specimens: cells.map((c) => ({ cellPressure: c, deviatorStress: 2 * su })) })

  it('gives φ = 0 and c = su, whatever the cell pressures', () => {
    const r = uu(45, [50, 100, 200])
    expect(r.total!.frictionAngle).toBeCloseTo(0, 8)
    expect(r.total!.cohesion).toBeCloseTo(45, 8)
    expect(r.undrainedStrength).toBeCloseTo(45, 8)
    // every circle the same diameter — the signature of a saturated UU test
    expect(new Set(r.circles.map((c) => c.radius))).toHaveProperty('size', 1)
  })

  it('says an apparent friction angle means the specimens were not saturated', () => {
    const r = triaxial({
      testType: 'UU',
      specimens: [
        { cellPressure: 50, deviatorStress: 80 },
        { cellPressure: 150, deviatorStress: 130 },
        { cellPressure: 300, deviatorStress: 210 },
      ],
    })
    expect(r.total!.frictionAngle).toBeGreaterThan(2)
    expect(r.notes.join(' ')).toMatch(/not fully saturated/)
    expect(r.notes.join(' ')).toMatch(/Use su/)
  })

  it('reports su but no envelope from a single specimen', () => {
    const r = triaxial({ testType: 'UU', specimens: [{ cellPressure: 100, deviatorStress: 90 }] })
    expect(r.total).toBeUndefined()
    expect(r.undrainedStrength).toBeCloseTo(45, 10)
    expect(r.notes.join(' ')).toMatch(/infinitely many tangents/)
  })
})

describe('CU: total and effective are two envelopes of one test', () => {
  // Planted effective envelope c′ = 5, φ′ = 32°, with a positive pore pressure
  // at failure — the total circles are the effective ones shifted RIGHT by u.
  const build = (u: number[]) =>
    triaxial({
      testType: 'CU',
      specimens: [100, 200, 300].map((s3eff, i) => {
        const sp = tangentSpecimen(s3eff, 5, 32)
        return { cellPressure: s3eff + u[i], deviatorStress: sp.deviatorStress, porePressure: u[i] }
      }),
    })

  it('recovers φ′ from the effective circles and reports both pairs', () => {
    const r = build([40, 80, 120])
    expect(r.effective!.frictionAngle).toBeCloseTo(32, 8)
    expect(r.effective!.cohesion).toBeCloseTo(5, 8)
    expect(r.total).toBeDefined()
    expect(r.total!.frictionAngle).toBeLessThan(r.effective!.frictionAngle)
    expect(r.notes.join(' ')).toMatch(/not interchangeable/)
  })

  it('shifts the circles left by u without changing their diameter', () => {
    const r = build([40, 80, 120])
    r.circles.forEach((c, i) => {
      expect(r.effectiveCircles![i].radius).toBeCloseTo(c.radius, 10)
      expect(c.center - r.effectiveCircles![i].center).toBeCloseTo([40, 80, 120][i], 10)
    })
  })

  it('draws no effective envelope when only some specimens recorded u', () => {
    const r = triaxial({
      testType: 'CU',
      specimens: [
        { cellPressure: 140, deviatorStress: 200, porePressure: 40 },
        { cellPressure: 280, deviatorStress: 340 },
        { cellPressure: 420, deviatorStress: 480, porePressure: 120 },
      ],
    })
    expect(r.effective).toBeUndefined()
    expect(r.effectiveCircles).toBeUndefined()
    expect(r.notes.join(' ')).toMatch(/2 of 3 specimens/)
  })

  it('says total-stress parameters from a CU test apply to nothing in particular', () => {
    const r = triaxial({
      testType: 'CU',
      specimens: [100, 200, 300].map((s3) => tangentSpecimen(s3, 10, 20)),
    })
    expect(r.notes.join(' ')).toMatch(/neither the drained strength nor su/)
  })

  it('flags a pore pressure that puts σ′3 below zero', () => {
    const r = triaxial({
      testType: 'CU',
      specimens: [
        { cellPressure: 100, deviatorStress: 120, porePressure: 140 },
        { cellPressure: 200, deviatorStress: 220, porePressure: 90 },
        { cellPressure: 300, deviatorStress: 320, porePressure: 130 },
      ],
    })
    expect(r.notes.join(' ')).toMatch(/cannot sustain tension/)
  })
})

describe('input the engine refuses', () => {
  it('rejects a specimen that failed at zero deviator stress', () => {
    expect(() => triaxial({ testType: 'CD', specimens: [{ cellPressure: 100, deviatorStress: 0 }] }))
      .toThrow(/deviator stress/i)
  })
  it('rejects a negative cell pressure', () => {
    expect(() => triaxial({ testType: 'CD', specimens: [{ cellPressure: -10, deviatorStress: 50 }] }))
      .toThrow(/cannot be negative/i)
  })
  it('rejects an empty series', () => {
    expect(() => triaxial({ testType: 'CD', specimens: [] })).toThrow(/at least one specimen/i)
  })
  it('warns that two specimens fit a line with nothing left over', () => {
    const r = triaxial({ testType: 'CD', specimens: [100, 200].map((s) => tangentSpecimen(s, 10, 30)) })
    expect(r.notes.join(' ')).toMatch(/no residual/)
  })
})

// ── Plumbing ──────────────────────────────────────────────────────────────

const labTest = (data: Record<string, unknown>): LabTest =>
  ({ id: 'x1', type: 'triaxial', standard: 'd4767', status: 'complete', data })

describe('triaxial through the lab registry', () => {
  const specimens = [100, 200, 300].map((s3) => tangentSpecimen(s3, 15, 30))

  it('is an implemented test with a form and a registry calculation', () => {
    expect(isImplemented('triaxial')).toBe(true)
    expect(labSpec('triaxial')?.formKind).toBe('triaxial-specimens')
    expect(labSpec('triaxial')?.calculation).toBe('triaxial.envelope')
  })

  it('summarises a CD series by its friction angle', () => {
    const { outcome } = evaluateTest(labTest({ testType: 'CD', specimens }))
    expect(outcome?.kind).toBe('triaxial')
    expect(summarise(outcome!)).toEqual({ label: 'φ', value: expect.closeTo(30, 6), unit: '°' })
  })

  it('summarises a UU series by su, not by an apparent φ', () => {
    const { outcome } = evaluateTest(labTest({
      testType: 'UU',
      specimens: [50, 100, 200].map((c) => ({ cellPressure: c, deviatorStress: 90 })),
    }))
    const s = summarise(outcome!)
    expect(s.label).toBe('su')
    expect(s.value).toBeCloseTo(45, 8)
  })

  it("summarises a CU series by φ′ when the pore pressures make one available", () => {
    const { outcome } = evaluateTest(labTest({
      testType: 'CU',
      specimens: specimens.map((s, i) => ({ ...s, cellPressure: s.cellPressure + 30 * (i + 1), porePressure: 30 * (i + 1) })),
    }))
    expect(summarise(outcome!).label).toBe("φ'")
  })

  it('drops a specimen missing a stress, and keeps an absent u absent', () => {
    const d = readTriaxial(labTest({
      testType: 'CD',
      specimens: [...specimens, { cellPressure: 400 }],
    }))
    expect(d?.specimens.length).toBe(3)
    expect(d?.specimens.every((s) => s.porePressure === undefined)).toBe(true)
  })

  it('falls back to UU rather than trusting an unknown test type', () => {
    expect(readTriaxial(labTest({ testType: 'CIU', specimens }))?.testType).toBe('UU')
    expect(readTriaxial(labTest({ specimens }))?.testType).toBe('UU')
  })

  it('surfaces an impossible specimen as an error, not a crash', () => {
    const { outcome, error } = evaluateTest(labTest({
      testType: 'CD', specimens: [{ cellPressure: 100, deviatorStress: -5 }, ...specimens],
    }))
    expect(outcome).toBeUndefined()
    expect(error).toMatch(/deviator stress/i)
  })
})

// ── The Mohr diagram ──────────────────────────────────────────────────────

describe('the Mohr circle chart', () => {
  const cu = triaxial({
    testType: 'CU',
    specimens: [100, 200, 300].map((s3, i) => {
      const sp = tangentSpecimen(s3, 5, 32)
      return { cellPressure: s3 + 40 * (i + 1), deviatorStress: sp.deviatorStress, porePressure: 40 * (i + 1) }
    }),
  })
  const d = mohrChart(cu)
  const pts = d.primitives.flatMap((p) =>
    p.kind === 'line' ? [[p.x1, p.y1], [p.x2, p.y2]]
      : p.kind === 'circle' ? [[p.cx, p.cy]]
        : p.kind === 'path' ? p.cmds.map((c) => [c.x, c.y])
          : [])

  it('draws nothing outside its frame', () => {
    for (const [x, y] of pts) {
      expect(x).toBeGreaterThanOrEqual(18 - 1e-6)
      expect(x).toBeLessThanOrEqual(18 + 96 + 1e-6)
      expect(y).toBeGreaterThanOrEqual(8 - 1e-6)
      expect(y).toBeLessThanOrEqual(8 + 62 + 1e-6)
    }
  })

  it('uses ONE scale for both axes, or the circles are ellipses', () => {
    // Each arc's radius is in paper mm; recover the scale from it and from the
    // σ span its own endpoints cover, and demand they agree.
    const arcs = d.primitives.filter((p) => p.kind === 'path')
    expect(arcs.length).toBe(cu.circles.length + cu.effectiveCircles!.length)
    for (const a of arcs) {
      const arc = a.cmds.find((c) => c.c === 'A')!
      const [m, end] = [a.cmds[0], a.cmds[1]]
      // the drawn diameter along σ must be twice the drawn radius: an unequal
      // aspect ratio breaks exactly this identity
      expect(end.x - m.x).toBeCloseTo(2 * arc.rx, 6)
      expect(arc.rx).toBeCloseTo(arc.ry, 10)
    }
  })

  it('marks the TANGENT point on each circle, not its crown', () => {
    // The crown (p, q) sits above the envelope and is the Kf-line point; a dot
    // there reads as "the envelope passes through here", which is the misreading
    // the whole reduction exists to avoid.
    const marks = d.primitives.filter((p) => p.kind === 'circle' && p.r < 1)
    expect(marks.length).toBe(cu.circles.length + cu.effectiveCircles!.length)
    const phi = (cu.total!.frictionAngle * Math.PI) / 180
    const c0 = cu.circles[0]
    const expected = c0.center - c0.radius * Math.sin(phi)
    // the marker is left of the crown by r·sin φ, a real distance for φ = 26°
    expect(c0.center - expected).toBeGreaterThan(0.4 * c0.radius)
    // and it lies ON the envelope: τ = c + σ·tan φ
    const tau = c0.radius * Math.cos(phi)
    expect(tau).toBeCloseTo(cu.total!.cohesion + expected * Math.tan(phi), 8)
  })

  it('prints both pairs, labelled, and never just one', () => {
    const text = d.primitives.filter((p) => p.kind === 'text').map((p) => p.text).join(' | ')
    expect(text).toMatch(/total:\s+c = /)
    expect(text).toMatch(/effective:\s+c' = /)
    expect(text).toMatch(/φ' = 32\.0°/)
    expect(text).toMatch(/Mohr circles — CU/)
  })

  it('says so when a single circle admits no tangent', () => {
    const one = triaxial({ testType: 'UU', specimens: [{ cellPressure: 100, deviatorStress: 90 }] })
    const text = mohrChart(one).primitives.filter((p) => p.kind === 'text').map((p) => p.text).join(' | ')
    expect(text).toMatch(/infinitely many tangents/)
    expect(text).toMatch(/su = 45\.0 kPa/)
  })
})
