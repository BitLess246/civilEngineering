import { describe, it, expect } from 'vitest'
import {
  beamMomentRatios, momentRatioLimits, sectionStrength,
} from './beamMomentRatios'
import { cutBeam, type CutInput } from './beamSection'
import { concreteBeamMn } from './scwb'
import type { RebarCage, RebarRun, Vec3 } from './rebarModel'
import { buildStructureCages, structureMomentRatios } from './cageBuilder'
import { designStructure } from './pipeline'
import { generateGridModel, buildGravityLoads } from './modelBuilder'

const along: Vec3 = [1, 0, 0]
const origin: Vec3 = [0, 0.5, 0]                 // the beam's TOP
const L = 6

/** A bar of `dia` running x0 → x1 at height `up` above the soffit. */
const bar = (mark: string, role: RebarRun['role'], dia: number, up: number, x0: number, x1: number): RebarRun =>
  ({ mark, dia, role, member: 'B1', bendDia: [], count: 1, path: [[x0, up, 0.0], [x1, up, 0.0]] })

const hoops = () => Array.from({ length: 30 }, (_, k) => ({
  mark: `S${k}`, dia: 10, role: 'stirrup' as const, member: 'B1', bendDia: [40, 40, 40, 40],
  path: [[0.1 + k * 0.2, 0.05, -0.1], [0.1 + k * 0.2, 0.05, 0.1],
    [0.1 + k * 0.2, 0.45, 0.1], [0.1 + k * 0.2, 0.45, -0.1]] as Vec3[],
  closed: true, count: 1,
}))

const cutFor = (runs: RebarRun[]): CutInput => ({
  cage: { member: 'B1', runs: [...runs, ...hoops()] } as RebarCage,
  along, origin, b: 0.3, h: 0.5, soffit: 0,
})

describe('momentRatioLimits', () => {
  it('is ½ and ¼ for a special moment frame (§418.6.3.2)', () => {
    expect(momentRatioLimits('smf')).toEqual({ atFace: 1 / 2, along: 1 / 4, clause: '§418.6.3.2' })
  })
  it('is ⅓ and ⅕ for an intermediate one (§418.4.2.2)', () => {
    expect(momentRatioLimits('imf')).toEqual({ atFace: 1 / 3, along: 1 / 5, clause: '§418.4.2.2' })
  })
  it('is nothing at all for a gravity frame — there is no reversal rule', () => {
    expect(momentRatioLimits('gravity')).toBeNull()
  })
})

describe('sectionStrength', () => {
  it('takes d to the CENTROID of the steel in tension, not to a nominal cover', () => {
    // Two layers of top steel: the centroid sits lower than a single layer, and
    // the lever arm follows it. Assuming one layer overstates Mn− at exactly
    // the support where the ratio is tightest.
    const one = cutFor([bar('T1', 'top', 25, 0.44, 0, L), bar('T2', 'top', 25, 0.44, 0, L)])
    const two = cutFor([bar('T1', 'top', 25, 0.44, 0, L), bar('T2', 'top', 25, 0.38, 0, L)])
    const a = sectionStrength(cutBeam(one, 3, 'x'), 28, 415)
    const b = sectionStrength(cutBeam(two, 3, 'x'), 28, 415)
    expect(a.AsTop).toBeCloseTo(b.AsTop, 6)
    expect(b.MnNeg).toBeLessThan(a.MnNeg)
  })

  it('agrees with the shared concreteBeamMn for a single layer', () => {
    const c = cutFor([bar('T1', 'top', 20, 0.44, 0, L), bar('T2', 'top', 20, 0.44, 0, L)])
    const s = sectionStrength(cutBeam(c, 3, 'x'), 28, 415)
    const As = 2 * (Math.PI / 4) * 400
    expect(s.MnNeg).toBeCloseTo(concreteBeamMn(300, 440, As, 28, 415), 6)
  })

  it('reports zero for a face with no bars rather than a spurious strength', () => {
    const s = sectionStrength(cutBeam(cutFor([bar('T1', 'top', 20, 0.44, 0, L)]), 3, 'x'), 28, 415)
    expect(s.MnPos).toBe(0)
    expect(s.AsBot).toBe(0)
  })
})

describe('§418.6.3.2 / §418.4.2.2 — the strength envelope', () => {
  /** 4-⌀25 top, 2-⌀16 bottom: heavy hogging, token sagging. */
  const lopsided = cutFor([
    ...[-0.09, -0.03, 0.03, 0.09].map((z, k) => ({
      ...bar(`T${k}`, 'top', 25, 0.44, 0, L), path: [[0, 0.44, z], [L, 0.44, z]] as Vec3[],
    })),
    bar('B1', 'bottom', 16, 0.06, 0, L),
    bar('B2', 'bottom', 16, 0.06, 0, L),
  ])

  it('catches a face whose sagging strength is under half the hogging', () => {
    const r = beamMomentRatios(lopsided, 0.15, L - 0.15, 28, 415, 'smf')
    expect(r.applies).toBe(true)
    expect(r.ok).toBe(false)
    const faces = r.checks.filter((c) => c.rule === 'at-face')
    expect(faces).toHaveLength(2)
    for (const f of faces) {
      expect(f.ok).toBe(false)
      expect(f.provided).toBeLessThan(f.required)
    }
  })

  it('passes the SAME beam as an intermediate frame at ⅓, where ½ failed', () => {
    // The two systems differ only in the fraction, and a beam can sit between
    // them — which is the check earning its keep rather than being a formality.
    const bal = cutFor([
      ...[-0.09, 0.09].map((z, k) => ({ ...bar(`T${k}`, 'top', 25, 0.44, 0, L), path: [[0, 0.44, z], [L, 0.44, z]] as Vec3[] })),
      ...[-0.09, 0.09].map((z, k) => ({ ...bar(`B${k}`, 'bottom', 16, 0.06, 0, L), path: [[0, 0.06, z], [L, 0.06, z]] as Vec3[] })),
    ])
    const smf = beamMomentRatios(bal, 0.15, L - 0.15, 28, 415, 'smf')
    const imf = beamMomentRatios(bal, 0.15, L - 0.15, 28, 415, 'imf')
    expect(smf.checks.filter((c) => c.rule === 'at-face').every((c) => c.ok)).toBe(false)
    expect(imf.checks.filter((c) => c.rule === 'at-face').every((c) => c.ok)).toBe(true)
  })

  it('catches a curtailment that leaves a section under a quarter of the end', () => {
    // Top steel heavy at the supports and cut off early; through the middle
    // only the two bottom bars remain, and they are under ¼ of the end.
    const curtailed = cutFor([
      ...[-0.09, 0.09].map((z, k) => ({ ...bar(`TT${k}`, 'top', 32, 0.44, 0, L), path: [[0, 0.44, z], [L, 0.44, z]] as Vec3[] })),
      ...[-0.03, 0.03].map((z, k) => ({ ...bar(`TX${k}`, 'top', 32, 0.44, 0, 1.0), path: [[0, 0.44, z], [1.0, 0.44, z]] as Vec3[] })),
      ...[-0.03, 0.03].map((z, k) => ({ ...bar(`TY${k}`, 'top', 32, 0.44, L - 1.0, L), path: [[L - 1.0, 0.44, z], [L, 0.44, z]] as Vec3[] })),
      bar('B1', 'bottom', 10, 0.06, 0, L),
    ])
    const r = beamMomentRatios(curtailed, 0.15, L - 0.15, 28, 415, 'smf')
    const along = r.checks.filter((c) => c.rule === 'along' && !c.ok)
    expect(along.length).toBeGreaterThan(0)
    // and it is the SAGGING strength in the middle that is short
    expect(along.some((c) => c.where.includes('Mn+'))).toBe(true)
  })

  it('measures the floor against the largest strength at EITHER face', () => {
    // "the maximum moment strength provided at face of either joint" — one
    // heavily reinforced end sets the floor for the whole beam, including the
    // lightly reinforced far end.
    const oneHeavyEnd = cutFor([
      ...[-0.09, 0.09].map((z, k) => ({ ...bar(`T${k}`, 'top', 16, 0.44, 0, L), path: [[0, 0.44, z], [L, 0.44, z]] as Vec3[] })),
      ...[-0.03, 0.03].map((z, k) => ({ ...bar(`TX${k}`, 'top', 32, 0.44, 0, 1.2), path: [[0, 0.44, z], [1.2, 0.44, z]] as Vec3[] })),
      ...[-0.09, 0.09].map((z, k) => ({ ...bar(`B${k}`, 'bottom', 16, 0.06, 0, L), path: [[0, 0.06, z], [L, 0.06, z]] as Vec3[] })),
    ])
    const r = beamMomentRatios(oneHeavyEnd, 0.15, L - 0.15, 28, 415, 'smf')
    const floors = r.checks.filter((c) => c.rule === 'along').map((c) => c.required)
    expect(new Set(floors.map((f) => f.toFixed(6))).size).toBe(1)   // one floor, everywhere
    expect(floors[0]).toBeGreaterThan(0)
  })

  it('says nothing at all about a gravity beam', () => {
    const r = beamMomentRatios(lopsided, 0.15, L - 0.15, 28, 415, 'gravity')
    expect(r.applies).toBe(false)
    expect(r.ok).toBe(true)
    expect(r.checks).toEqual([])
  })

  it('does not throw on a degenerate span', () => {
    expect(beamMomentRatios(lopsided, 3, 3, 28, 415, 'smf').applies).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// AND ON A REAL FRAME — the clause has to bite on placed bars, not only on
// hand-built cages. This is the piece that failed before the design and the
// cage were taught the rule: a heavily loaded SMF beam came out at
// Mn+/Mn− ≈ 0.31, because the sagging demand at a support is nil under
// gravity and the bottom face collected the §409.6.1.2 minimum.
// ─────────────────────────────────────────────────────────────────────────
describe('structureMomentRatios, on a designed frame', () => {
  const section = { id: 's1', name: 'C1', b: 350, h: 650, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
  const soil = { qAllow: 300, gammaSoil: 18, gammaConc: 24, H: 1.5 }
  const frame = (system: 'gravity' | 'imf' | 'smf', sdl: number, ll: number) => {
    const m = generateGridModel({ baysX: [8, 8], baysZ: [8], storeyH: [3.5, 3.5], section })
    m.loads = buildGravityLoads(m, sdl, ll)
    const d = designStructure(m, soil as never, {}, { seismicSystem: system })!
    const { cages } = buildStructureCages(m, d)
    return { m, d, rows: structureMomentRatios(m, d, cages) }
  }

  it('checks nothing on a gravity frame — the clause does not apply', () => {
    const { rows } = frame('gravity', 10, 12)
    expect(rows).toEqual([])
  })

  it('passes every beam of a heavily loaded SMF frame', () => {
    const { d, rows } = frame('smf', 14, 20)
    expect(d.system).toBe('smf')
    expect(rows.length).toBe(d.beams.length)
    const failing = rows.filter((r) => !r.ratios.ok)
    expect(failing.map((r) => r.id)).toEqual([])
  })

  it('leaves the ratio GOVERNING, not comfortably clear — it is a real limit', () => {
    // Utilisation just over 1.0 everywhere is what a rule that decided the
    // bar count looks like. Far above it would mean something else governs and
    // this test proves nothing.
    const { rows } = frame('smf', 14, 20)
    const tight = Math.min(...rows.flatMap((r) => r.ratios.checks
      .filter((c) => c.required > 0).map((c) => c.provided / c.required)))
    expect(tight).toBeGreaterThanOrEqual(1)
    expect(tight).toBeLessThan(1.35)
  })

  it('measures at the joint FACES, so the span checked is the clear span', () => {
    const { m, rows } = frame('smf', 10, 12)
    const r = rows[0]
    const mem = m.members.find((x) => x.id === r.id)!
    const ni = m.nodes.find((n) => n.id === mem.i)!, nj = m.nodes.find((n) => n.id === mem.j)!
    const centres = Math.hypot(nj.x - ni.x, nj.z - ni.z)
    expect(r.Ln).toBeLessThan(centres)
    expect(r.Ln).toBeCloseTo(centres - section.b / 1000, 6)  // half a column each end
  })

  it('makes an IMF cheaper than an SMF — ⅓ asks for less bottom steel than ½', () => {
    const bot = (system: 'imf' | 'smf') => {
      const { rows } = frame(system, 14, 20)
      return rows.reduce((t, r) => t + r.ratios.stations[0].AsBot, 0)
    }
    expect(bot('imf')).toBeLessThan(bot('smf'))
  })
})
