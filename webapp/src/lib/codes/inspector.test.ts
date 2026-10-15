import { describe, it, expect } from 'vitest'
import { generateGridModel } from '../../engine/modelBuilder'
import { designStructure } from '../../engine/pipeline'
import type { RectSection } from '../../engine/model'
import { memberRows, memberSection } from '../modelMemberResults'
import { beamProvidedCapacities } from '../beamSolution'
import { inspectDesign, summarize, stateOf, NEAR_LIMIT, sceneKeyOf } from './inspector'
import { footingLayout } from '../../engine/footingLayout'
import { exampleFromQuery, fieldsFromQuery } from './links'
import { provisionById, runProvision } from './index'

const soil = { qAllow: 200, gammaSoil: 18, gammaConc: 24, H: 1.5 }
function design(section: RectSection, q = 4.8) {
  const model = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section, slabThickness: 200 })
  model.loads = model.plates.flatMap((p) => [
    { kind: 'area' as const, plate: p.id, q, cat: 'D' as const },
    { kind: 'area' as const, plate: p.id, q: 2.4, cat: 'L' as const },
  ])
  return { model, design: designStructure(model, soil)! }
}
const ok: RectSection = { id: 'S1', name: '300×500', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }

describe('state from verdict and utilisation', () => {
  it('the engine verdict wins; a pass at ≥ 90 % is near; no data is unrated', () => {
    expect(stateOf(false, 0.4)).toBe('fail')
    expect(stateOf(true, 0.5)).toBe('pass')
    expect(stateOf(true, NEAR_LIMIT)).toBe('near')
    expect(stateOf(true, null)).toBe('pass')
    expect(stateOf(null, null)).toBe('unrated')
    expect(stateOf(null, 1.2)).toBe('fail')
  })
})

describe('the inspector re-reads the design, it does not re-design', () => {
  const { model, design: d } = design(ok)
  const items = inspectDesign(model, d)

  it('covers every member the schedules list, with the same ratio and verdict', () => {
    for (const kind of ['column', 'slab', 'footing'] as const) {
      const rows = memberRows(model, d, kind)
      for (const r of rows) {
        const it = items.find((x) => x.kind === kind && x.id === r.id)!
        expect(it, `${kind} ${r.id}`).toBeDefined()
        expect(it.util).toBe(r.util)
        expect(it.state === 'fail').toBe(r.ok === false || (r.ok === null && (r.util ?? 0) > 1))
      }
    }
    expect(items.length).toBe((['beam', 'column', 'steelBeam', 'steelColumn', 'slab', 'footing', 'combined'] as const)
      .reduce((n, k) => n + memberRows(model, d, k).length, 0))
  })
  it('an RC beam is rated against its PROVIDED bars and stirrups, as its worked solution states it', () => {
    for (const it of items.filter((x) => x.kind === 'beam')) {
      const row = d.beams.find((b) => b.id === it.id)!
      const sec = memberSection(model, it.id)!
      let u = 0
      for (const s of row.sections) {
        const cap = beamProvidedCapacities({ b: sec.b, h: sec.h, cover: sec.cover, barDia: sec.barDia, comprBarDia: 16,
          stirrupDia: sec.tieDia, fc: sec.fc, fy: sec.fy, fyt: sec.fy, legs: s.design.legs, Mu: Math.abs(s.Mu), Vu: Math.abs(s.Vu) }, s.design)
        u = Math.max(u, Math.abs(s.Mu) / cap.phiMn, Math.abs(s.Vu) / cap.phiVn)
      }
      expect(it.util!).toBeCloseTo(u, 12)
      expect(it.state === 'fail').toBe(!row.ok)
      // and it is never the φMn,max ratio, which understates a working beam
      expect(it.util!).toBeGreaterThanOrEqual(memberRows(model, d, 'beam').find((r) => r.id === it.id)!.util! - 1e-12)
    }
  })
  it('sorts worst first and the summary adds up', () => {
    const rank = { fail: 0, near: 1, pass: 2, unrated: 3 }
    for (let k = 1; k < items.length; k++) expect(rank[items[k - 1].state]).toBeLessThanOrEqual(rank[items[k].state])
    const s = summarize(items)
    expect(s.pass + s.near + s.fail + s.unrated).toBe(items.length)
  })
  it('an RC beam itemises its checks, and fails exactly when one of them fails', () => {
    for (const it of items.filter((x) => x.kind === 'beam')) {
      expect(it.checks.length).toBe(5)
      expect(it.state === 'fail').toBe(it.checks.some((c) => c.state === 'fail'))
      for (const c of it.checks) expect(c.clause).toMatch(/^NSCP 2015 /)
    }
  })
  it('a beam\'s Explain link opens its provision with the member\'s own section and demand', () => {
    const it = items.find((x) => x.kind === 'beam')!
    const row = d.beams.find((b) => b.id === it.id)!
    const worst = row.sections.reduce((a, s) => (Math.abs(s.Mu) > Math.abs(a.Mu) ? s : a))
    const href = it.checks[0].explain!
    const [path, q] = href.split('?')
    expect(provisionById(path.replace('/codes/', ''))).toBeDefined()
    const ex = exampleFromQuery(new URLSearchParams(q))
    expect(ex.inp.b).toBe(300)
    expect(ex.inp.nBars).toBe(worst.design.bars)
    expect(ex.inp.Mu).toBeCloseTo(Math.abs(worst.Mu), 2)
    expect(ex.from?.route).toBe('/model')
    expect(ex.from?.label).toBe(`Model Space · ${it.id}`)
  })
})

describe('a failing design shows up as failures', () => {
  // a 200 × 250 frame under a heavy floor cannot carry it
  const weak: RectSection = { ...ok, id: 'W', name: '200×250', b: 200, h: 250 }
  const { model, design: d } = design(weak, 25)
  const items = inspectDesign(model, d)
  it('flags the members the pipeline failed, first', () => {
    const failing = d.beams.filter((b) => !b.ok).map((b) => b.id)
    expect(failing.length).toBeGreaterThan(0)
    for (const id of failing) expect(items.find((x) => x.kind === 'beam' && x.id === id)!.state).toBe('fail')
    expect(items[0].state).toBe('fail')
  })
})

describe('scene keys line up with what the 3D view draws', () => {
  const { model, design: d } = design(ok)
  const items = inspectDesign(model, d)
  it('every laid-out footing is keyed by an inspected item, and every slab by its plate', () => {
    const xz = new Map(model.nodes.map((n) => [n.id, { x: n.x, z: n.z }]))
    const { items: pads } = footingLayout(
      d.footings.map((f) => ({ node: f.node, B: f.design.B, Dc: f.design.Dc, pedestal: f.pedestal })),
      d.combined.map((cf) => ({ nodes: cf.nodes, Bx: cf.design.Bx, By1: cf.design.By1, By2: cf.design.By2, x1: cf.design.x1, Dc: cf.design.Dc })),
      xz,
    )
    const keys = new Set(items.map(sceneKeyOf))
    expect(pads.length).toBeGreaterThan(0)
    for (const p of pads) expect(keys.has(p.key), p.key).toBe(true)
    for (const s of d.slabs) expect(keys.has(s.plate), s.plate).toBe(true)
    expect(sceneKeyOf({ kind: 'combined', id: 'n1 + n2' })).toBe('cf-n1-n2')
  })
})

describe('steel members link to the steel provisions with their own numbers', () => {
  const { model } = design(ok)
  model.sections = model.sections.map((s) => ({ ...s, material: 'steel' as const, shape: 'W310x79', steelFy: 345, steelFu: 448 }))
  const d = designStructure(model, soil)!
  const items = inspectDesign(model, d)
  it('a steel beam itemises flexure, shear and deflection; its Explain reproduces its own φMn', () => {
    const it = items.find((x) => x.kind === 'steelBeam')!
    const row = d.steelBeams.find((b) => b.id === it.id)!
    expect(it.checks.map((c) => c.name)).toEqual([`Flexure, §${row.clause}`, `Shear, §${row.shearClause ?? 'G2.1'}`, 'Deflection, L/240 (simply supported bound)'])
    const href = it.checks[0].explain!
    const [path, q] = href.split('?')
    const p = provisionById(path.replace('/codes/', ''))!
    const ex = fieldsFromQuery(new URLSearchParams(q), p)
    expect(ex.inp.shape).toBe('W310x79')
    expect(ex.inp.Fy).toBe(345)
    // the provision, run on what the link carried, lands on the schedule's own φMn
    expect(runProvision(p, ex.inp).values.phiMn).toBeCloseTo(row.phiMn, 6)
    expect(it.state === 'fail').toBe(!row.ok)
  })
  it('a steel column\'s Explain reproduces its own φcPn', () => {
    const it = items.find((x) => x.kind === 'steelColumn')!
    const row = d.steelColumns.find((c) => c.id === it.id)!
    const [path, q] = it.checks[0].explain!.split('?')
    const p = provisionById(path.replace('/codes/', ''))!
    expect(runProvision(p, fieldsFromQuery(new URLSearchParams(q), p).inp).values.phiPn).toBeCloseTo(row.phiPn, 6)
  })
})
