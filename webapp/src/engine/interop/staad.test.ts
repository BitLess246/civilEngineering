import { describe, it, expect } from 'vitest'
import { toStaad, fromStaad, listTokens, fmt, resolveSteelName } from './staad'
import type { StructuralModel, ModelLoad, RectSection } from '../model'
import { generateGridModel, buildGravityLoads } from '../modelBuilder'
import { modelToFrame3D } from '../modelBridge'
import { solveFrame3D, applyF3Combo } from '../frame3d'
// A real STAAD.Pro 2023 input deck — the input echo of docs/benchmarks/staad-gridframe-2026-08-19.anl.
import fixture from './__fixtures__/gridframe.std?raw'

const RC: RectSection = { id: 't', name: 't', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40, material: 'concrete' }

/** Total downward gravity load per category, kN — the invariant both programs must agree on. */
function gravityTotals(m: StructuralModel): Record<string, number> {
  const nm = new Map(m.nodes.map((n) => [n.id, n]))
  const len = (id: string) => {
    const q = m.members.find((x) => x.id === id)!, a = nm.get(q.i)!, b = nm.get(q.j)!
    return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
  }
  const area = (pid: string) => {
    const [a, b, c, d] = m.plates.find((p) => p.id === pid)!.corners.map((i) => nm.get(i)!)
    const s = (p: typeof a, q: typeof a) => [q.x - p.x, q.y - p.y, q.z - p.z]
    const x = (u: number[], v: number[]) => Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0])
    return (x(s(a, b), s(a, c)) + x(s(a, c), s(a, d))) / 2
  }
  const out: Record<string, number> = {}
  const add = (l: ModelLoad, F: number) => { out[l.cat] = (out[l.cat] ?? 0) + F }
  for (const l of m.loads) {
    if (l.kind === 'area') add(l, l.q * area(l.plate))
    else if (l.kind === 'member-udl') add(l, l.w * len(l.member))
    else if (l.kind === 'member-point') add(l, l.P)
    else if (l.kind === 'node') add(l, -(l.Fy ?? 0))
  }
  return out
}

describe('STAAD list / number formatting', () => {
  it('compresses runs of three or more into TO ranges', () => {
    expect(listTokens([5, 1, 2, 3, 7, 8])).toEqual(['1', 'TO', '3', '5', '7', '8'])
  })
  it('writes six significant figures without trailing zeros', () => {
    expect(fmt(6.000004)).toBe('6')
    expect(fmt(-0.15)).toBe('-0.15')
    expect(fmt(2.487e7)).toBe('2.487E+7')
  })
})

describe('import — a real STAAD.Pro 2023 deck (docs/benchmarks/staad-gridframe-2026-08-19.anl)', () => {
  const r = fromStaad(fixture)
  const m = r.model

  it('reads the geometry: 468 joints, 152 members, 400 shell elements, 6 fixed supports', () => {
    expect(m.nodes.length).toBe(468)
    expect(m.members.length).toBe(152)
    expect(m.plates.length).toBe(400)
    expect(m.supports.length).toBe(6)
    expect(m.supports.every((s) => s.fixity === 'fixed')).toBe(true)
    expect(m.shellElements).toBe(true)
    expect(m.storeys.map((s) => s.elevation)).toEqual([3.50001, 6.50001])
  })

  it('reads PRIS YD/ZD as h×b and the concrete grade from STRENGTH FCU', () => {
    const col = m.sections.find((s) => s.id === 'M1')!
    expect([col.b, col.h]).toEqual([400, 400])
    expect(col.fc).toBeCloseTo(27.58, 2)
    const beam = m.sections.find((s) => s.id === 'M17')!
    expect([beam.b, beam.h]).toEqual([300, 500])
    expect(m.members.find((q) => q.id === 'M1')!.role).toBe('column')
    expect(m.members.find((q) => q.id === 'M17')!.role).toBe('beam')
    expect(m.plates[0].thickness).toBeCloseTo(150, 9)
  })

  it('applied load matches STAAD\'s own statics check: D 1380.39 kN (self weight + PR 8.33423), L 288.00 kN', () => {
    const tot = gravityTotals(m)
    expect(tot.D).toBeCloseTo(1380.39, 1)    // STAAD: SUMMATION FORCE-Y = -1380.39 (LOADING 1)
    expect(tot.L).toBeCloseTo(288.00, 1)     // STAAD: -288.00 (LOADING 2)
  })

  it('local PR on an element whose incidence normal points DOWN is a downward pressure', () => {
    const q = m.loads.find((l) => l.kind === 'area' && l.cat === 'L') as Extract<ModelLoad, { kind: 'area' }>
    expect(q.q).toBeCloseTo(2.4, 9)
  })

  it('solved by Zeta, the imported model reproduces STAAD\'s support reactions (LOAD 101 = 1.4D, 102 = 1.2D + 1.6L)', () => {
    // STAAD .anl, SUPPORT REACTIONS: joint → [FX, FY, FZ, MX] per combination
    const staad: Record<string, Record<string, number[]>> = {
      101: { N1: [10.22, 243.06, 7.97, 9.16], N2: [0, 480.16, 15.69, 18.02], N3: [-10.22, 243.06, 7.97, 9.16],
        N4: [10.22, 243.06, -7.97, -9.16], N5: [0, 480.16, -15.69, -18.02], N6: [-10.22, 243.06, -7.97, -9.16] },
      102: { N1: [11.70, 262.00, 9.08, 10.43], N2: [0, 534.64, 18.22, 20.92], N3: [-11.70, 262.00, 9.08, 10.43],
        N4: [11.70, 262.00, -9.08, -10.43], N5: [0, 534.64, -18.22, -20.92], N6: [-11.70, 262.00, -9.08, -10.43] },
    }
    const br = modelToFrame3D(m)
    for (const [lc, f] of [['101', { D: 1.4 }], ['102', { D: 1.2, L: 1.6 }]] as const) {
      const res = solveFrame3D(br.nodes, br.members, br.supports, applyF3Combo(br.loads, f), undefined, br.shells)!
      const sum = res.reactions.reduce((s, x) => s + x.F[1], 0)
      expect(sum).toBeCloseTo(lc === '101' ? 1.4 * 1380.39 : 1.2 * 1380.39 + 1.6 * 288, 0)
      for (const [node, [fx, fy, fz, mx]] of Object.entries(staad[lc])) {
        const r = res.reactions.find((x) => x.node === node)!
        // Different shell elements (DKT here) and G (E/2.4 vs STAAD's 9.28e6):
        // axial within 1 %, shears within 2 % (± 0.1 kN), moments within 4 %.
        expect(Math.abs(r.F[1] / fy - 1)).toBeLessThan(0.01)
        expect(Math.abs(r.F[0] - fx)).toBeLessThan(0.02 * Math.abs(fx) + 0.1)
        expect(Math.abs(r.F[2] - fz)).toBeLessThan(0.02 * Math.abs(fz) + 0.1)
        expect(Math.abs(r.M[0] - mx)).toBeLessThan(0.04 * Math.abs(mx) + 0.1)
      }
    }
  })

  it('beam-end forces at the columns, against STAAD\'s own MEMBER END FORCES (LOAD 101) — moments within 9 %, shears within 18 %, all on the high side', () => {
    // STAAD .anl, members 13–26 — the first segment of each 2-bay beam, at its
    // column joint: [MOM-Z, SHEAR-Y] at the start, local axes, kN·m / kN
    const staad: Record<number, [number, number]> = {
      13: [47.43, 44.38], 14: [58.43, 42.14], 15: [47.43, 44.38], 16: [58.43, 42.14], 17: [42.50, 52.25],
      18: [85.37, 113.19], 19: [42.50, 52.25], 20: [37.99, 42.19], 21: [64.01, 46.53], 22: [37.99, 42.19],
      23: [64.01, 46.53], 24: [34.22, 52.11], 25: [68.48, 109.58], 26: [34.22, 52.11],
    }
    const br = modelToFrame3D(m)
    const res = solveFrame3D(br.nodes, br.members, br.supports, applyF3Combo(br.loads, { D: 1.4 }), undefined, br.shells)!
    for (const [k, [Mz, Vy]] of Object.entries(staad)) {
      const f = res.members.find((x) => x.id === `M${k}`)!.f
      // The reactions agree to < 1 % (above), so this is not the frame: it is
      // how the two programs' SHELLS share the slab's load between slab and
      // beam near a column (DKT here vs STAAD's element, and G = E/2.4 vs its
      // 9.28e6). Ours always routes MORE through the beam — the conservative side.
      expect(f[5]).toBeGreaterThanOrEqual(Mz)
      expect(f[1]).toBeGreaterThanOrEqual(Vy)
      expect(f[5] / Mz - 1).toBeLessThan(0.09)
      expect(f[1] / Vy - 1).toBeLessThan(0.18)
    }
  })

  it('reports what it did not import instead of dropping it silently', () => {
    expect(r.combos.map((c) => c.id)).toEqual([101, 102, 103, 104, 105])
    expect(r.combos[1].factors).toEqual({ 1: 1.2, 2: 1.6 })
    expect(r.warnings.some((w) => w.includes('LOAD COMB'))).toBe(true)
  })
})

describe('export → import round trip', () => {
  const base = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3.5, 3], column: { ...RC, b: 400, h: 400 }, beam: RC, girder: { ...RC, b: 250, h: 450 } })
  const model: StructuralModel = { ...base, loads: buildGravityLoads(base, 1.5, 2.4) }

  it('tributary mode: geometry, sections, supports and load totals survive; panels come back from metadata', () => {
    const { text, warnings } = toStaad(model)
    expect(text).toMatch(/^STAAD SPACE/)
    expect(text).toContain('MEMBER LOAD')
    expect(text).not.toContain('ELEMENT INCIDENCES')
    expect(warnings.some((w) => w.includes('tributary'))).toBe(true)
    for (const line of text.split('\n')) if (!line.startsWith('*')) expect(line.length).toBeLessThanOrEqual(79)

    const back = fromStaad(text).model
    expect(back.nodes.length).toBe(model.nodes.length)
    expect(back.members.length).toBe(model.members.length)
    expect(back.plates.length).toBe(model.plates.length)
    expect(back.shellElements).toBeUndefined()
    expect(back.supports.length).toBe(model.supports.length)
    expect(back.members.map((q) => q.role)).toEqual(model.members.map((q) => (q.role === 'girder' ? 'beam' : q.role)))
    // sections restored losslessly from *ZETA-SECTION
    model.members.forEach((q, k) => {
      const a = model.sections.find((s) => s.id === q.section)!, b = back.sections.find((s) => s.id === back.members[k].section)!
      expect({ ...b, id: a.id, name: a.name }).toEqual(a)
    })
    // area loads restored once, not doubled by the expanded trapezoids
    const t0 = gravityTotals(model), t1 = gravityTotals(back)
    for (const c of ['D', 'L']) expect(t1[c]).toBeCloseTo(t0[c], 6)
    expect(back.loads.filter((l) => l.kind === 'area').length).toBe(model.loads.filter((l) => l.kind === 'area').length)
  })

  it('a deck stripped of Zeta metadata still carries the same total load (STAAD\'s view of it)', () => {
    const plain = toStaad(model).text.split('\n').filter((l) => !l.startsWith('*ZETA')).join('\n')
    const back = fromStaad(plain).model
    expect(back.plates.length).toBe(0)
    const t0 = gravityTotals(model), t1 = gravityTotals(back)
    for (const c of ['D', 'L']) expect(t1[c]).toBeCloseTo(t0[c], 6)
  })

  it('shell mode: panels go out as SHELL elements with PR GY, and the same Zeta analysis comes back', () => {
    const shellModel = { ...model, shellElements: true }
    const { text } = toStaad(shellModel)
    expect(text).toContain('ELEMENT INCIDENCES SHELL')
    expect(text).toMatch(/PR GY -/)
    const back = fromStaad(text).model
    expect(back.shellElements).toBe(true)
    const solve = (mm: StructuralModel) => {
      const br = modelToFrame3D(mm)
      return solveFrame3D(br.nodes, br.members, br.supports, applyF3Combo(br.loads, { D: 1.2, L: 1.6 }), undefined, br.shells)!
    }
    const a = solve(shellModel), b = solve(back)
    const ids = new Map(model.nodes.map((n, k) => [n.id, back.nodes[k].id]))
    for (const ra of a.reactions) {
      const rb = b.reactions.find((x) => x.node === ids.get(ra.node))!
      for (let k = 0; k < 3; k++) expect(rb.F[k]).toBeCloseTo(ra.F[k], 6)
    }
  })

  it('steel shapes, BETA, releases, offsets, tension-only and springs round-trip', () => {
    const steel: RectSection = { ...RC, id: 's', name: 'W310x38.7', b: 165, h: 310, material: 'steel', shape: 'W310x38.7', steelFy: 345, steelFu: 450 }
    const m0 = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [4], section: steel })
    m0.members[0].axisRotation = 0                        // column turned 90° from its default
    m0.members[4] = { ...m0.members[4], connections: { iEnd: 'simple' }, releases: { jEnd: { Mx: true } }, offsets: { iEnd: [0, -0.15, 0] }, axialMode: 'tension-only' }
    m0.supports[1] = { node: m0.supports[1].node, fixity: 'spring', kx: 5000, ky: 80000, kz: 0 }
    const { text } = toStaad(m0)
    expect(text).toContain('BETA -90 MEMB 1')
    expect(text).toContain('START MY MZ')
    expect(text).toContain('MEMBER TENSION')
    expect(text).toMatch(/FIXED BUT FZ MX MY MZ KFX 5000 KFY 80000/)
    const back = fromStaad(text).model
    expect(back.sections[0].shape).toBe('W310x38.7')
    expect(back.sections[0].steelFy).toBe(345)
    expect(back.members[0].axisRotation).toBe(0)
    expect(back.members[4].releases).toEqual({ iEnd: { My: true, Mz: true }, jEnd: { Mx: true } })
    expect(back.members[4].offsets).toEqual({ iEnd: [0, -0.15, 0] })
    expect(back.members[4].axialMode).toBe('tension-only')
    expect(back.supports.find((s) => s.node === back.nodes[1].id)).toEqual({ node: back.nodes[1].id, fixity: 'spring', kx: 5000, ky: 80000, kz: 0 })
    // and STAAD analyses the stiffness Zeta analysed
    const br0 = modelToFrame3D(m0), br1 = modelToFrame3D(back)
    for (const f of ['A', 'Iz', 'Iy', 'J'] as const) expect(br1.members[3][f]).toBeCloseTo(br0.members[3][f], 6)
  })
})

describe('import — decks written by hand or by other versions', () => {
  it('honours UNIT changes, abbreviations, imperial steel tables, built-in materials and load conversions', () => {
    const deck = [
      'STAAD SPACE Portal',
      'UNIT FEET KIP',
      'JOINT COORD',
      '1 0 0 0; 2 0 12 0; 3 20 12 0; 4 20 0 0',
      'MEMB INCI',
      '1 1 2; 2 2 3; 3 4 3',
      'MEMB PROP AMERICAN',
      '1 3 TABLE ST W12X26',
      '2 TA ST W16X31',
      'CONSTANTS',
      'E STEEL ALL',
      'SUPPORTS',
      '1 4 PINNED',
      'UNIT METER KN',
      'LOAD 1 LOADTYPE DEAD TITLE DEAD',
      'MEMBER LOAD',
      '2 UNI GY -10',
      '2 CON GY -20 2',
      'LOAD 2 LOADTYPE WIND TITLE WIND X',
      'JOINT LOAD',
      '2 FX 15',
      'MEMBER LOAD',
      '1 UNI GX 2',
      'LOAD 3 LOADTYPE LIVE TITLE LIVE',
      'MEMBER LOAD',
      '2 TRAP GY -4 -8 1 5',
      'FINISH',
    ].join('\n')
    const { model: m, warnings } = fromStaad(deck)
    expect(m.name).toBe('Portal')
    expect(m.nodes[1].y).toBeCloseTo(12 * 0.3048, 9)
    expect(m.sections[0].shape).toBe('W310x38.7')                // W12×26 → 26·1.488 = 38.7 kg/m
    expect(m.sections[1].shape).toBe('W410x46.1')                // W16×31
    expect(m.supports.map((s) => s.fixity)).toEqual(['pin', 'pin'])
    const tot = gravityTotals(m)
    expect(tot.D).toBeCloseTo(10 * 20 * 0.3048 + 20, 6)
    expect(tot.L).toBeCloseTo((4 + 8) / 2 * 4, 6)                 // trapezoid → ten exact slice resultants
    const wind = m.loads.filter((l) => l.cat === 'W' && l.kind === 'node') as Extract<ModelLoad, { kind: 'node' }>[]
    expect(wind.reduce((s, l) => s + (l.Fx ?? 0), 0)).toBeCloseTo(15 + 2 * 12 * 0.3048, 6)
    expect(warnings.some((w) => w.includes('ten point loads'))).toBe(true)
    expect(warnings.some((w) => w.includes('end reactions'))).toBe(true)
  })

  it('resolves metric and imperial steel names, and refuses what is not in the catalogue', () => {
    expect(resolveSteelName('W310X38.7')?.name).toBe('W310x38.7')
    expect(resolveSteelName('W14X90')?.name).toMatch(/^W360x/)
    expect(resolveSteelName('UB305X165X40')).toBeUndefined()
  })
})
