import { STEEL } from './sheetInk'
import { describe, it, expect } from 'vitest'
import {
  buildColumnDetail, clearHeight, spliceWindow, tiePositions,
  offsetBentBars, OFFSET_MAX_SLOPE,
} from './columnDetail'

// C1: 400×400, 3.0 m storey, 500 deep beam, 8-⌀20 verticals, ⌀10 ties.
// ℓo 600, s_conf 100, s_out 200, Class B lap 1120 — all figures the design
// already produces (columnDesign seismicLoZone/SConf/SOut, devLength ls_B).
const c = {
  mark: 'C1', b: 400, h: 400, storey: 3.0, beamDepth: 500,
  bars: 8, barDia: 20, tieDia: 10,
  loZone: 600, sConf: 100, sOut: 200, lapB: 1120,
}

describe('clear height', () => {
  it('is the storey height less the depth framing in at the top', () => {
    // ℓu is the length that can hinge and the length §418.7.5 is written
    // against. Using the storey height overstates it by the beam depth, which
    // understates ℓo and puts the first tie in the wrong place.
    expect(clearHeight(3.0, 500)).toBeCloseTo(2.5, 9)
    expect(clearHeight(3.0, 0)).toBeCloseTo(3.0, 9)
  })
  it('never goes negative when the beam is deeper than the storey', () => {
    expect(clearHeight(0.4, 500)).toBe(0)
  })
})

describe('splice window — §418.7.4.3', () => {
  it('is the centre half of the clear height', () => {
    expect(spliceWindow(2.5)).toEqual([0.625, 1.875])
    const [a, b] = spliceWindow(2.5)
    expect(b - a).toBeCloseTo(2.5 / 2, 9)   // exactly half, centred
    expect((a + b) / 2).toBeCloseTo(1.25, 9)
  })
})

describe('tie positions', () => {
  const ties = tiePositions(2.5, 600, 100, 200)

  it('starts at s_conf/2 from the joint face — §418.7.5.3', () => {
    expect(ties[0]).toBeCloseTo(0.05, 9)                      // 100/2 = 50 mm
    expect(ties[ties.length - 1]).toBeCloseTo(2.5 - 0.05, 9)  // and mirrored at the top
  })

  it('packs the confinement zones at s_conf and opens out to s_out between', () => {
    const inBottomLo = ties.filter((z) => z <= 0.6 + 1e-9)
    const gapsLo = inBottomLo.slice(1).map((z, i) => z - inBottomLo[i])
    for (const g of gapsLo) expect(g).toBeCloseTo(0.1, 6)

    const middle = ties.filter((z) => z > 0.6 + 1e-6 && z < 2.5 - 0.6 - 1e-6)
    const gapsMid = middle.slice(1).map((z, i) => z - middle[i])
    for (const g of gapsMid) expect(g).toBeCloseTo(0.2, 6)
  })

  it('never leaves a gap wider than s_out — including at the zone transitions', () => {
    // The transition is where this goes wrong. Stepping the middle from
    // ℓo + s_out put the last confinement tie at 0.55 and the first middle tie
    // at 0.80 — a 250 mm gap against a 200 mm limit, in the drawing the sheet
    // exists to communicate. Checked across a sweep, not one fixture.
    for (const lu of [1.8, 2.2, 2.5, 3.1, 4.0]) {
      for (const lo of [0, 300, 450, 600, 900]) {
        for (const [sc, so] of [[100, 200], [75, 150], [125, 250], [100, 300]]) {
          const t = tiePositions(lu, lo, sc, so)
          const limit = so / 1000 + 1e-6
          for (let i = 1; i < t.length; i++) {
            expect(t[i] - t[i - 1]).toBeLessThanOrEqual(limit)
          }
          // and the end ties stay clear of the joint faces
          expect(t[0]).toBeGreaterThan(0)
          expect(t[t.length - 1]).toBeLessThan(lu)
        }
      }
    }
  })

  it('is symmetric about mid-height for a symmetric schedule', () => {
    const mirrored = ties.map((z) => 2.5 - z).sort((a, b) => a - b)
    ties.forEach((z, i) => expect(z).toBeCloseTo(mirrored[i], 6))
  })

  it('never places a tie outside the clear height, and never duplicates one', () => {
    for (const z of ties) { expect(z).toBeGreaterThanOrEqual(0); expect(z).toBeLessThanOrEqual(2.5) }
    expect(new Set(ties).size).toBe(ties.length)
  })

  it('caps ℓo at half the clear height — a short column is all confinement', () => {
    // A 1.0 m clear height with ℓo = 600 cannot have 600 top AND bottom; the
    // zones would overlap and the middle spacing would be applied to nothing.
    const short = tiePositions(1.0, 600, 100, 200)
    const gaps = short.slice(1).map((z, i) => z - short[i])
    for (const g of gaps) expect(g).toBeLessThanOrEqual(0.1 + 1e-6)
  })
})

describe('buildColumnDetail', () => {
  const d = buildColumnDetail(c, { detailNo: '1' })

  it('titles the sheet with the mark and returns finite bounds', () => {
    expect(d.title).toBe('TYPICAL COLUMN DETAIL — C1')
    for (const v of Object.values(d.bounds)) expect(Number.isFinite(v)).toBe(true)
    expect(d.bounds.maxX).toBeGreaterThan(d.bounds.minX)
    expect(d.bounds.maxY).toBeGreaterThan(d.bounds.minY)
  })

  it('draws one tie line per computed position', () => {
    const expected = tiePositions(2.5, 600, 100, 200).length
    // tie lines are the horizontal rebar-coloured lines inside the column
    const tieLines = d.primitives.filter((p) =>
      p.kind === 'line' && p.stroke === STEEL && Math.abs(p.y1 - p.y2) < 1e-9)
    expect(tieLines).toHaveLength(expected)
  })

  it('states the splice class and the centre-half rule', () => {
    const text = d.primitives.filter((p) => p.kind === 'text').map((p) => (p as { text: string }).text).join(' | ')
    expect(text).toContain('CLASS (B) SPLICE')
    expect(text).toContain('§418.7.4.3')
    expect(text).toContain('FIRST TIE AT 50 FROM FACE OF JOINT')
    expect(text).toContain('TIES ⌀10 — 100 C/C WITHIN ℓo, 200 C/C ELSEWHERE')
    expect(text).toContain('REMOVE LAITANCE')
  })

  it('keeps the lap inside the permitted window', () => {
    const [wz0, wz1] = spliceWindow(clearHeight(3.0, 500))
    const dims = d.primitives.filter((p) => p.kind === 'dim') as { y1: number; y2: number; text: string }[]
    const lapDim = dims.find((p) => p.text === '1120')
    expect(lapDim).toBeDefined()
    // y is negated (renderer is Y-down), so undo it before comparing
    const zLo = Math.min(-lapDim!.y1, -lapDim!.y2)
    expect(zLo).toBeGreaterThanOrEqual(wz0 - 1e-9)
    expect(zLo).toBeLessThanOrEqual(wz1 + 1e-9)
  })

  it('falls back to the compression lap when no tension lap is given', () => {
    const comp = buildColumnDetail({ ...c, lapB: undefined, lapC: 460 })
    const text = comp.primitives.filter((p) => p.kind === 'text').map((p) => (p as { text: string }).text).join(' | ')
    expect(text).toContain('COMPRESSION SPLICE')
    expect(text).not.toContain('CLASS (B)')
  })

  it('omits the confinement zones when the design reports none', () => {
    const plain = buildColumnDetail({ ...c, loZone: undefined })
    const text = plain.primitives.filter((p) => p.kind === 'text').map((p) => (p as { text: string }).text).join(' | ')
    expect(text).not.toContain('ℓo =')
    // and every tie then sits at the ordinary spacing
    const ties = tiePositions(2.5, 0, 100, 200)
    const gaps = ties.slice(1).map((z, i) => z - ties[i])
    expect(gaps.every((g) => g <= 0.2 + 1e-6)).toBe(true)
  })
})

describe('offset bent bars — §410.7.4', () => {
  it('the offset per face is HALF the change in width', () => {
    // The factor-of-two error that decides whether §410.7.4.5 forces dowels:
    // a 600 column stepping to 500 narrows 100 overall but only 50 per face.
    expect(offsetBentBars(600, 500, 25).offset).toBe(50)
    expect(offsetBentBars(500, 500, 25).offset).toBe(0)
    expect(offsetBentBars(400, 600, 25).offset).toBe(0)   // growing: no crank
  })

  it('the minimum crank length is the offset at 1 in 6 — §410.7.4.1', () => {
    // 50 mm of run needs 300 mm of rise to stay at 1:6.
    expect(offsetBentBars(600, 500, 25).minCrankLength).toBeCloseTo(300, 9)
    expect(OFFSET_MAX_SLOPE).toBeCloseTo(1 / 6, 12)
  })

  it('accepts a crank at exactly 1:6 and rejects anything steeper', () => {
    const ok = offsetBentBars(600, 500, 25, 415, 300)
    expect(ok.slope).toBeCloseTo(1 / 6, 9)
    expect(ok.slopeOK).toBe(true)
    expect(ok.notes.join(' ')).not.toContain('steeper')

    const steep = offsetBentBars(600, 500, 25, 415, 200)   // 1:4
    expect(steep.slopeOK).toBe(false)
    expect(steep.notes.join(' ')).toContain('§410.7.4.1')
    expect(steep.notes.join(' ')).toContain('300')          // the fix, stated
  })

  it('forces dowels once the face offset passes 75 mm — §410.7.4.5', () => {
    // This is the rule most often missed: a big step is not a bend problem,
    // it is a dowel detail. 600→450 is 75 per face — exactly at the limit.
    expect(offsetBentBars(600, 450, 25).dowelsRequired).toBe(false)
    const big = offsetBentBars(600, 440, 25)                // 80 per face
    expect(big.dowelsRequired).toBe(true)
    expect(big.notes.join(' ')).toContain('may NOT be bent')
    expect(big.notes.join(' ')).toContain('§410.7.4.5')
  })

  it('sizes the tie force at 1.5× the horizontal component — §410.7.4.3', () => {
    // Ab·fy is the bar force; the horizontal component is that times the slope.
    const r = offsetBentBars(600, 500, 25, 415, 300)
    const Ab = (Math.PI / 4) * 25 ** 2
    expect(r.tieForce).toBeCloseTo((1.5 * Ab * 415 * (1 / 6)) / 1e3, 6)
    // a flatter crank pulls less sideways
    const flat = offsetBentBars(600, 500, 25, 415, 600)     // 1:12
    expect(flat.tieForce).toBeLessThan(r.tieForce)
  })

  it('says nothing when the column does not change size', () => {
    const same = offsetBentBars(500, 500, 25)
    expect(same.notes).toHaveLength(0)
    expect(same.slopeOK).toBe(true)
    expect(same.dowelsRequired).toBe(false)
  })
})

describe('the sheet draws the governing lap', () => {
  const base = {
    mark: 'C1', b: 400, h: 400, storey: 3.0, beamDepth: 500,
    bars: 8, barDia: 20, tieDia: 10, loZone: 600, sConf: 100, sOut: 200,
  }
  const dimText = (d: ReturnType<typeof buildColumnDetail>) =>
    d.primitives.filter((p) => p.kind === 'dim').map((p) => (p as { text: string }).text)
  const allText = (d: ReturnType<typeof buildColumnDetail>) =>
    d.primitives.filter((p) => p.kind === 'text').map((p) => (p as { text: string }).text).join(' | ')

  it('prints the compression splice when it is the longer of the two', () => {
    // The real pipeline case: ⌀20, f'c 21, cbKtr/db at the 2.5 cap gives
    // ls_B 593 against lsc 602. Preferring tension would draw the SHORTER bar.
    const d = buildColumnDetail({ ...base, lapB: 593, lapC: 602 })
    expect(dimText(d)).toContain('602')
    expect(allText(d)).toContain('COMPRESSION SPLICE')
  })

  it('prints Class B when tension governs', () => {
    const d = buildColumnDetail({ ...base, lapB: 1120, lapC: 602 })
    expect(dimText(d)).toContain('1120')
    expect(allText(d)).toContain('CLASS (B) SPLICE')
  })

  it('still works when only one is known', () => {
    expect(dimText(buildColumnDetail({ ...base, lapC: 460 }))).toContain('460')
    expect(dimText(buildColumnDetail({ ...base, lapB: 900 }))).toContain('900')
  })
})
