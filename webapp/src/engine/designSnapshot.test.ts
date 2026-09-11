import { describe, it, expect } from 'vitest'
import { generateGridModel, buildGravityLoads } from './modelBuilder'
import { designStructure } from './pipeline'
import { modelToFrame3D } from './modelBridge'
import { analyzeFrame3D } from './frame3d'
import { buildStructureCages } from './cageBuilder'
import type { RectSection } from './model'
import {
  digest, canonicalNumber, shortId, modelDigest, analysisDigest, designDigest,
  detailingDigest, buildDesignSnapshot, snapshotRows, snapshotStamp,
  ENGINE_VERSION, CODE_BASIS,
} from './designSnapshot'

const section: RectSection = { id: 's1', name: '300×500', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
const soil = { qAllow: 200, gammaSoil: 18, gammaConc: 24, H: 1.5 }

function frame() {
  const m = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3, 3], section, slabThickness: 200 })
  m.loads = buildGravityLoads(m, 4.8, 2.4)
  return m
}
const solve = (m: ReturnType<typeof frame>) => {
  const br = modelToFrame3D(m, {})
  return analyzeFrame3D(br.nodes, br.members, br.supports, br.loads, {}, undefined, br.diaphragmGroups, br.shells)!
}

// ─────────────────────────────────────────────────────────────────────────
// THE PRIMITIVE
// ─────────────────────────────────────────────────────────────────────────
describe('digest', () => {
  it('is 64 bits of hex, and stable across runs', () => {
    const d = digest({ a: 1, b: [2, 3] })
    expect(d).toMatch(/^[0-9a-f]{16}$/)
    expect(digest({ a: 1, b: [2, 3] })).toBe(d)
  })
  it('does not care what order the keys were set in', () => {
    expect(digest({ a: 1, b: 2 })).toBe(digest({ b: 2, a: 1 }))
  })
  it('changes for any change in the content', () => {
    const base = digest({ a: 1, b: 2 })
    expect(digest({ a: 1, b: 3 })).not.toBe(base)
    expect(digest({ a: 1 })).not.toBe(base)
    expect(digest({ a: 1, b: 2, c: 0 })).not.toBe(base)
  })
  it('ignores an explicitly undefined field — absent and undefined are the same model', () => {
    expect(digest({ a: 1, b: undefined })).toBe(digest({ a: 1 }))
  })
  it('collapses −0 to 0, which JSON does not', () => {
    expect(canonicalNumber(-0)).toBe(0)
    expect(digest({ v: -0 })).toBe(digest({ v: 0 }))
  })
  it('survives last-bit float noise but not a real difference', () => {
    // 12 significant digits: a change in the 16th digit is float noise from a
    // different CPU, a change in the 10th is a different answer.
    const a = 1.23456789012345
    expect(digest({ a })).toBe(digest({ a: a + Number.EPSILON * a }))
    expect(digest({ a })).not.toBe(digest({ a: 1.2345678902 }))
  })
  it('a non-finite number does not poison the digest', () => {
    expect(canonicalNumber(Infinity)).toBe(0)
    expect(canonicalNumber(NaN)).toBe(0)
    expect(digest({ a: NaN })).toMatch(/^[0-9a-f]{16}$/)
  })
})

describe('shortId', () => {
  it('is the grouped, upper-case head of a digest — quotable and comparable', () => {
    expect(shortId('0123456789abcdef')).toBe('0123-4567-89AB')
  })
})

// ─────────────────────────────────────────────────────────────────────────
// THE MODEL DIGEST — a property of the STRUCTURE, not of how it was drawn
// ─────────────────────────────────────────────────────────────────────────
describe('modelDigest', () => {
  const m = frame()

  it('is unchanged by reordering the arrays — two engineers, same frame, same id', () => {
    const shuffled = {
      ...m,
      nodes: [...m.nodes].reverse(),
      members: [...m.members].reverse(),
      sections: [...m.sections].reverse(),
      supports: [...m.supports].reverse(),
      loads: [...m.loads].reverse(),
    }
    expect(modelDigest(shuffled)).toBe(modelDigest(m))
  })

  it('is unchanged by renaming the project — a rename is not a redesign', () => {
    expect(modelDigest({ ...m, name: 'Something else entirely' })).toBe(modelDigest(m))
    // …nor by renaming a storey, which is a label on an elevation
    expect(modelDigest({ ...m, storeys: m.storeys.map((s) => ({ ...s, name: 'X' })) })).toBe(modelDigest(m))
  })

  it('CHANGES for a millimetre of node movement', () => {
    const moved = { ...m, nodes: m.nodes.map((n, k) => (k === 0 ? { ...n, x: n.x + 0.001 } : n)) }
    expect(modelDigest(moved)).not.toBe(modelDigest(m))
  })

  it('changes for a section, a load, a support or a modelling flag', () => {
    const base = modelDigest(m)
    expect(modelDigest({ ...m, sections: m.sections.map((s) => ({ ...s, b: s.b + 1 })) })).not.toBe(base)
    expect(modelDigest({ ...m, loads: [...m.loads, { kind: 'node', node: m.nodes[0].id, Fx: 10, cat: 'E' }] })).not.toBe(base)
    expect(modelDigest({ ...m, supports: m.supports.map((s) => ({ ...s, fixity: 'pin' as const })) })).not.toBe(base)
    expect(modelDigest({ ...m, diaphragm: true })).not.toBe(base)
    expect(modelDigest({ ...m, storeys: m.storeys.map((s) => ({ ...s, elevation: s.elevation + 0.1 })) })).not.toBe(base)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// THE RESULT DIGESTS
// ─────────────────────────────────────────────────────────────────────────
describe('analysisDigest / designDigest / detailingDigest', () => {
  const m = frame()
  const a = solve(m)
  const d = designStructure(m, soil)!
  const { cages } = buildStructureCages(m, d)

  it('null when the stage was never run — an absent result is not a result', () => {
    expect(analysisDigest(null)).toBeNull()
    expect(designDigest(null)).toBeNull()
    expect(detailingDigest(null)).toBeNull()
    expect(detailingDigest([])).toBeNull()
  })

  it('reproduces on a re-run of the same inputs', () => {
    expect(analysisDigest(solve(frame()))).toBe(analysisDigest(a))
    expect(designDigest(designStructure(frame(), soil)!)).toBe(designDigest(d))
  })

  it('the analysis digest moves when the structure does', () => {
    const stiffer = frame()
    stiffer.sections = stiffer.sections.map((s) => ({ ...s, h: s.h + 100 }))
    expect(analysisDigest(solve(stiffer))).not.toBe(analysisDigest(a))
  })

  it('the design digest moves when the STEEL moves, not only when the verdict does', () => {
    const heavier = frame()
    heavier.loads = buildGravityLoads(heavier, 4.8, 6)
    const d2 = designStructure(heavier, soil)!
    // both designs pass; what differs is the bars, and the digest must see it
    expect(designDigest(d2)).not.toBe(designDigest(d))
  })

  it('the detailing digest moves when a bar path does', () => {
    const base = detailingDigest(cages)
    const nudged = cages.map((c, k) => (k === 0
      ? { ...c, runs: c.runs.map((r, i) => (i === 0 ? { ...r, path: r.path.map((p, j) => (j === 0 ? [p[0] + 0.01, p[1], p[2]] as [number, number, number] : p)) } : r)) }
      : c))
    expect(detailingDigest(nudged)).not.toBe(base)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// THE SNAPSHOT
// ─────────────────────────────────────────────────────────────────────────
describe('buildDesignSnapshot', () => {
  const m = frame()
  const a = solve(m)
  const d = designStructure(m, soil)!
  const at = new Date('2026-09-08T10:00:00Z')
  const snap = (over: Partial<Parameters<typeof buildDesignSnapshot>[0]> = {}) =>
    buildDesignSnapshot({ model: m, design: d, analysis: a, generatedAt: at, ...over })

  it('carries an id for every stage, and one over all of them', () => {
    const s = snap()
    for (const v of [s.modelDigest, s.analysisDigest, s.designDigest, s.snapshotId])
      expect(v).toMatch(/^[0-9a-f]{16}$/)
    expect(s.engineVersion).toBe(ENGINE_VERSION)
    expect(s.codeBasis).toBe(CODE_BASIS)
    expect(s.generatedAt).toBe('2026-09-08T10:00:00.000Z')
  })

  it('the snapshot id changes when ANY stage does — that is what makes it the one to quote', () => {
    const base = snap().snapshotId
    expect(snap({ analysis: null }).snapshotId).not.toBe(base)
    expect(snap({ design: null }).snapshotId).not.toBe(base)
    expect(snap({ optimized: true }).snapshotId).not.toBe(base)
    const moved = { ...m, nodes: m.nodes.map((n, k) => (k === 0 ? { ...n, y: n.y + 0.01 } : n)) }
    expect(snap({ model: moved }).snapshotId).not.toBe(base)
  })

  it('but NOT when only the letterhead or the clock does — an id you cannot reproduce is worse than none', () => {
    const base = snap().snapshotId
    expect(snap({ projectName: 'Another name' }).snapshotId).toBe(base)
    expect(snap({ projectId: 'proj_123' }).snapshotId).toBe(base)
    expect(snap({ generatedAt: new Date('2030-01-01T00:00:00Z') }).snapshotId).toBe(base)
    expect(snap({ buildId: 'deadbeef' }).snapshotId).toBe(base)
  })

  it('derives a project id when the session has no saved project, and says it derived it', () => {
    expect(snap().projectId).toBe(`derived:${shortId(modelDigest(m))}`)
    expect(snap({ projectId: 'proj_7' }).projectId).toBe('proj_7')
    expect(snap({ projectId: '' }).projectId).toMatch(/^derived:/)
  })

  it('names an unnamed project rather than printing an empty cell', () => {
    expect(snap({ projectName: '   ' }).projectName).toBe('Untitled')
  })
})

describe('snapshotRows', () => {
  const m = frame()
  it('says NOT RUN for a stage that was not run — never a bare dash', () => {
    const rows = snapshotRows(buildDesignSnapshot({ model: m, generatedAt: new Date('2026-09-08T10:00:00Z') }))
    const at = (k: string) => rows.find((r) => r[0] === k)![1]
    expect(at('Analysis ID')).toMatch(/not run/)
    expect(at('Design ID')).toMatch(/not run/)
    expect(at('Detailing ID')).toMatch(/not run/)
    expect(at('Optimizer')).toMatch(/not run/)
    expect(at('Model revision')).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/)
  })

  it('states the optimizer either way, because an optimised design is a different design', () => {
    const on = snapshotRows(buildDesignSnapshot({ model: m, optimized: true })).find((r) => r[0] === 'Optimizer')![1]
    expect(on).toMatch(/^run/)
    expect(on).toMatch(/optimizer's/)
  })

  it('prints the build only when the build knew it', () => {
    const withSha = snapshotRows(buildDesignSnapshot({ model: m, buildId: 'abcdef1234567' })).find((r) => r[0] === 'Engine version')![1]
    expect(withSha).toContain('build abcdef1')
    const without = snapshotRows(buildDesignSnapshot({ model: m })).find((r) => r[0] === 'Engine version')![1]
    expect(without).toBe(ENGINE_VERSION)
  })

  it('the generated stamp is readable, not an ISO string with a Z on it', () => {
    const v = snapshotRows(buildDesignSnapshot({ model: m, generatedAt: new Date('2026-09-08T10:00:00Z') })).find((r) => r[0] === 'Generated')![1]
    expect(v).toBe('2026-09-08 10:00:00 UTC')
  })
})

describe('snapshotStamp', () => {
  it('fits a footer and identifies the run', () => {
    const s = buildDesignSnapshot({ model: frame() })
    const stamp = snapshotStamp(s)
    expect(stamp).toContain(shortId(s.snapshotId))
    expect(stamp).toContain(shortId(s.modelDigest))
    expect(stamp).toContain(ENGINE_VERSION)
    expect(stamp.length).toBeLessThan(80)
  })
})

describe('modelDigest — mesh density is part of the model', () => {
  it('two models differing only in shellSubdiv hash differently', () => {
    // Without this the two would be indistinguishable, and a report printed
    // from a 2×2 mesh would carry the same id as one printed from 6×6 — a
    // stale result reported as current, which is the failure this file exists
    // to prevent.
    const base = { ...frame(), shellElements: true }
    const a = modelDigest({ ...base, shellSubdiv: 2 })
    const b = modelDigest({ ...base, shellSubdiv: 6 })
    expect(a).not.toBe(b)
    // absent and 1 are the same model — 1 IS the default mesh
    expect(modelDigest({ ...base, shellSubdiv: undefined }))
      .toBe(modelDigest({ ...base, shellSubdiv: undefined }))
    expect(modelDigest({ ...base, shellSubdiv: 2 })).not.toBe(modelDigest(base))
    expect(modelDigest({ ...base, shellSubdiv: 1 })).toBe(modelDigest(base))
  })
})
