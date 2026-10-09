import { describe, expect, it } from 'vitest'
import { designBeam } from '../engine/beamDesign'
import { calcBeamSection } from './calcFigures'
import { beamStressBlock } from './beamStressBlock'
import { stressDiagramGeometry, withStressDiagrams } from './beamSectionStress'

const r = designBeam({ b: 300, h: 500, cover: 40, barDia: 20, stirrupDia: 10, fc: 28, fy: 415, fyt: 415, Mu: 180, Vu: 150 })
const s = beamStressBlock(r, 28, 415)
const base = { b: 300, h: 500, d: r.d, dPrime: r.dPrime, fc: 28, fy: 415, s }

describe('stress diagrams joined to the section', () => {
  it('places the face, N.A., block and steel at the section\'s own depths (y down from the top)', () => {
    const g = stressDiagramGeometry(base)
    expect(g.yFace).toBe(0)
    expect(g.yNA).toBeCloseTo(s.c / 1000, 9)
    expect(g.yA).toBeCloseTo(s.a / 1000, 9)
    expect(g.yC).toBeCloseTo(s.a / 2000, 9)
    expect(g.ySteel).toBeCloseTo(r.d / 1000, 9)
    // linear strain through the N.A.: εs = 0.003 (d − c) / c, and it yields
    expect(g.epsS).toBeCloseTo((0.003 * (r.d - s.c)) / s.c, 9)
    expect(g.yields).toBe(true)
  })

  it('hogging flips the compression face to the bottom', () => {
    const g = stressDiagramGeometry({ ...base, hogging: true })
    expect(g.yFace).toBeCloseTo(0.5, 9)
    expect(g.ySteel).toBeCloseTo(0.5 - r.d / 1000, 9)
  })

  it('appends to the section without moving it, and grows the bounds to hold the diagrams', () => {
    const sec = calcBeamSection({ b: 300, h: 500, cover: 40, barDia: 20, stirrupDia: 10, bars: r.bars, spacing: r.sAdopt })
    const out = withStressDiagrams(sec, base)
    expect(out.primitives.slice(0, sec.primitives.length)).toEqual(sec.primitives)
    expect(out.primitives.length).toBeGreaterThan(sec.primitives.length)
    expect(out.bounds.maxX).toBeGreaterThan(sec.bounds.maxX)
    // a d dimension that starts at the compression face and ends at the steel
    const dDim = out.primitives.find((p) => p.kind === 'dim' && p.text.startsWith('d ='))
    expect(dDim && dDim.kind === 'dim' && [dDim.y1, dDim.y2]).toEqual([0, r.d / 1000])
  })

  it('draws the strain as ONE straight line through the N.A. — both triangles share a slope', () => {
    for (const inp of [base, { ...base, hogging: true }]) {
      const out = withStressDiagrams(calcBeamSection({ b: 300, h: 500, cover: 40, barDia: 20, stirrupDia: 10, bars: r.bars, spacing: r.sAdopt }), inp)
      const tri = out.primitives.filter((p) => p.kind === 'path' && p.closed && p.cmds.length === 3)
      const [comp, tens] = tri as Extract<(typeof tri)[number], { kind: 'path' }>[]
      // compression: (xs, face) → (xs + ws, face) → (xs, N.A.); tension: (xs, N.A.) → (xs − wt, steel)
      const [fc0, fc1, na] = comp.cmds.map((c) => ('x' in c ? [c.x, c.y] : [0, 0]))
      const tc = tens.cmds[1]
      const tip = 'x' in tc ? [tc.x, tc.y] : [0, 0]
      const slopeC = (fc1[0] - na[0]) / (fc1[1] - na[1])
      const slopeT = (tip[0] - na[0]) / (tip[1] - na[1])
      expect(slopeT).toBeCloseTo(slopeC, 9)
      expect(fc0[0]).toBeCloseTo(na[0], 12)
      // and the widths keep εs/εcu
      expect((na[0] - tip[0]) / (fc1[0] - fc0[0])).toBeCloseTo(stressDiagramGeometry(inp).epsS / 0.003, 9)
    }
  })
})
