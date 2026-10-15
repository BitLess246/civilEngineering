import { describe, it, expect } from 'vitest'
import { PROVISIONS, provisionById, searchProvisions, shelves, DEFAULT_BEAM, checkState, flowPath, BEAM_LAYERS } from './index'
import { effDepth, shearFlow, phiFlow, flexureWalk } from './rcBeam'
import { phiFromStrain } from '../../engine/flexure'
import { designBeam } from '../../engine/beamDesign'
import { ALL_TOOLS } from '../tools'

describe('provision records hold together', () => {
  it('every equation names variables and a reference the record defines', () => {
    for (const p of PROVISIONS) {
      for (const e of p.equations) {
        expect(p.refs[e.ref], `${p.id}/${e.id} ref`).toBeDefined()
        for (const v of e.vars) expect(p.variables[v], `${p.id}/${e.id} var ${v}`).toBeDefined()
      }
    }
  })
  it('ids are unique, related ids exist, calculator links go to real tools', () => {
    expect(new Set(PROVISIONS.map((p) => p.id)).size).toBe(PROVISIONS.length)
    const routes = new Set(ALL_TOOLS.map((t) => t.to))
    for (const p of PROVISIONS) {
      for (const r of p.related) expect(provisionById(r), `${p.id} → ${r}`).toBeDefined()
      for (const c of p.calculators) expect(routes.has(c.to), c.to).toBe(true)
      expect(Object.values(p.refs).every((r) => r.edition === 'NSCP 2015' && /^§\d/.test(r.clause))).toBe(true)
    }
  })
  it('nothing claims a human review that has not happened', () => {
    for (const p of PROVISIONS) expect(p.reviewed).toBeUndefined()
  })
  it('every example evaluates every variable it lists', () => {
    for (const p of PROVISIONS) {
      const ex = p.evaluate(DEFAULT_BEAM)
      for (const k of Object.keys(ex.values)) expect(p.variables[k], `${p.id} value ${k}`).toBeDefined()
      for (const c of ex.checks) expect(p.refs[c.ref], `${p.id} check ${c.label}`).toBeDefined()
      expect(ex.lines.length).toBeGreaterThan(0)
    }
  })
})

describe('engine-matched: the worked examples are the Beam Design engine\'s numbers', () => {
  // A beam whose design lands on ONE layer, so its d is the single-layer d
  const inp = { b: 300, h: 500, cover: 40, barDia: 20, stirrupDia: 10, fc: 28, fy: 415, fyt: 275, Mu: 160, Vu: 150 }
  const dz = designBeam(inp)
  const ex = { ...DEFAULT_BEAM, ...inp, nBars: dz.bars }

  it('the design is single-layer, so both read the same d', () => {
    expect(dz.d).toBeCloseTo(effDepth(ex), 9)
  })
  it('flexure: the stress block of the provided bars', () => {
    const v = provisionById('rc-beam-flexure')!.evaluate(ex).values
    expect(v.As).toBeCloseTo(dz.AsProv, 6)
    expect(v.a).toBeCloseTo(dz.a, 6)
    expect(v.phiMn).toBeGreaterThanOrEqual(inp.Mu)       // the designed beam passes its own check
  })
  it('minimum steel: the same ρmin', () => {
    expect(provisionById('rc-beam-min-steel')!.evaluate(ex).values.rhoMin).toBeCloseTo(dz.rhoMin, 12)
  })
  it('shear: the same Vc and Vs,max', () => {
    const v = provisionById('rc-beam-shear')!.evaluate(ex).values
    expect(v.Vc).toBeCloseTo(dz.Vc, 9)
    expect(v.VsMax).toBeCloseTo(dz.VsMax, 9)
  })
})

describe('hand checks on the default beam (300 × 500, 4-⌀20, f′c 28, fy 415)', () => {
  const d = 500 - 40 - 10 - 10           // 440
  const As = 4 * Math.PI * 100           // 1256.6
  it('flexure by hand', () => {
    const v = provisionById('rc-beam-flexure')!.evaluate(DEFAULT_BEAM).values
    const a = (As * 415) / (0.85 * 28 * 300)
    expect(v.a).toBeCloseTo(a, 9)
    expect(v.Mn).toBeCloseTo((As * 415 * (d - a / 2)) / 1e6, 9)
    expect(v.phi).toBe(0.9)                                  // εt well past 0.005
  })
  it('shear by hand', () => {
    const v = provisionById('rc-beam-shear')!.evaluate(DEFAULT_BEAM).values
    expect(v.Vc).toBeCloseTo((0.17 * Math.sqrt(28) * 300 * d) / 1000, 9)
    expect(v.Vs).toBeCloseTo((2 * 25 * Math.PI * 275 * d) / 200 / 1000, 9)
    expect(v.sMax).toBe(220)                                 // light stirrups: min(d/2, 600)
  })
  it('three check states', () => {
    expect(checkState(90, 100)).toBe('pass')
    expect(checkState(100, 100)).toBe('limit')
    expect(checkState(110, 100)).toBe('fail')
  })
})

describe('search and shelves', () => {
  it('ranks by title, then keyword, then the rest, and needs every word', () => {
    expect(searchProvisions('shear')[0].id).toBe('rc-beam-shear')
    expect(searchProvisions('stirrup spacing').map((p) => p.id)).toEqual(['rc-beam-shear'])
    expect(searchProvisions('409.6.1.2').map((p) => p.id)).toEqual(['rc-beam-min-steel'])
    expect(searchProvisions('tension controlled')[0].id).toBe('rc-beam-phi')
    expect(searchProvisions('timber joist')).toEqual([])
    expect(searchProvisions('  ').length).toBe(PROVISIONS.length)
  })
  it('lists every category, with the concrete shelf populated', () => {
    const s = shelves()
    expect(s.map((x) => x.category)).toEqual(['concrete', 'steel', 'loads', 'seismic', 'foundations', 'analysis', 'masonry', 'timber'])
    expect(s[0].items.length).toBe(4)
  })
})

describe('flowcharts follow the live example', () => {
  // default beam: d = 440, Vc = 0.17·√28·300·440 = 118.7 kN, φVc = 89.0, ½φVc = 44.5
  const at = (Vu: number) => flowPath(shearFlow({ ...DEFAULT_BEAM, Vu }))
  it('shear: each band of Vu lands on its own terminal', () => {
    expect(at(30)).toEqual({ last: 1, branched: true })     // ≤ ½φVc: no stirrups
    expect(at(80)).toEqual({ last: 2, branched: true })     // ≤ φVc: minimum only
    expect(at(120)).toEqual({ last: 5, branched: true })    // Vs,req = 41.3 ≤ ⅓√f′c·bw·d = 232.8: d/2
    expect(at(300)).toEqual({ last: 6, branched: false })   // Vs,req = 281.3 > 232.8: d/4
    expect(at(600)).toEqual({ last: 4, branched: true })    // Vs,req = 681 > ⅔√f′c·bw·d = 465.7: too small
  })
  it('shear: the bands meet at the hand-computed boundaries', () => {
    const d = 440, Vc = (0.17 * Math.sqrt(28) * 300 * d) / 1000
    const third = (Math.sqrt(28) * 300 * d) / 3 / 1000
    const vuAt = (Vs: number) => 0.75 * (Vc + Vs)
    expect(at(vuAt(third) - 0.01).last).toBe(5)
    expect(at(vuAt(third) + 0.01).last).toBe(6)
    expect(at(0.75 * Vc * 0.5).last).toBe(1)
    expect(at(0.75 * Vc * 0.5 + 0.01).last).toBe(2)
  })
  it('φ: the route agrees with the engine\'s φ for every bar count', () => {
    const seen = new Set<number>()
    for (let n = 2; n <= 12; n++) {
      const i = { ...DEFAULT_BEAM, nBars: n, barDia: 28 }
      const et = provisionById('rc-beam-flexure')!.evaluate(i).values.et
      const p = flowPath(phiFlow(i))
      const phi = phiFromStrain(et, i.fy)
      if (phi === 0.9) expect(p, `n=${n}`).toEqual({ last: 1, branched: true })
      else if (et < 0.004) expect(p, `n=${n}`).toEqual({ last: 2, branched: true })
      else expect(p, `n=${n}`).toEqual({ last: 3, branched: false })
      seen.add(p.last)
    }
    expect([...seen].sort()).toEqual([1, 2, 3])                // all three outcomes are exercised
  })
  it('every decision has a branch and every branch ends in a terminal', () => {
    for (const f of [shearFlow(DEFAULT_BEAM), phiFlow(DEFAULT_BEAM)]) {
      for (const s of f.steps) if (s.kind === 'decision') { expect(s.branch).toBeDefined(); expect(s.branch!.to.kind).toBe('end') }
      expect(f.steps[f.steps.length - 1].kind).toBe('end')
      expect(f.steps.filter((s) => s.branch?.taken).length).toBeLessThanOrEqual(1)
    }
  })
})

describe('the flexure walkthrough', () => {
  const w = flexureWalk(DEFAULT_BEAM)
  it('only ever adds layers, ends with all of them, and lights a defined variable', () => {
    const flex = provisionById('rc-beam-flexure')!
    for (let k = 1; k < w.length; k++) {
      expect(w[k - 1].layers.filter((l) => !w[k].layers.includes(l)), `step ${k}`).toEqual([])
    }
    expect(new Set(w[w.length - 1].layers)).toEqual(new Set(BEAM_LAYERS.map((l) => l.id)))
    for (const s of w) if (s.hl) expect(flex.variables[s.hl], s.hl).toBeDefined()
  })
  it('quotes the same Mn as the provision', () => {
    const Mn = provisionById('rc-beam-flexure')!.evaluate(DEFAULT_BEAM).values.Mn
    expect(w[4].tex).toContain(Mn.toFixed(1))
  })
})
