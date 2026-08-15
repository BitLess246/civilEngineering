import { describe, it, expect } from 'vitest'
import { buildBeamDetail, continuousTopSteel, barExtension } from './beamDetail'

const sections = [
  { label: 'LEFT', x: 0, hogging: true, bars: 4, stirrupSpacing: 100 },
  { label: 'MID', x: 3, hogging: false, bars: 5, stirrupSpacing: 200 },
  { label: 'RIGHT', x: 6, hogging: true, bars: 6, stirrupSpacing: 100 },
]
const b = { mark: 'B1', L: 6, b: 300, h: 500, barDia: 16, stirrupDia: 10, legs: 2, sections }

describe('continuous top steel — §409.7.7', () => {
  it('takes the greater of the two adjacent spans', () => {
    // A support is ONE piece of concrete with ONE set of top bars through it.
    // Detailing each span's own answer over its own half leaves the support
    // short from whichever side asked for more — the error the "place the
    // greater reinforcement" note on every typical detail exists to prevent.
    expect(continuousTopSteel(4, 6)).toBe(6)
    expect(continuousTopSteel(6, 4)).toBe(6)
  })
  it('falls back to this span when there is no adjacent one (end support)', () => {
    expect(continuousTopSteel(4)).toBe(4)
    expect(continuousTopSteel(4, undefined)).toBe(4)
  })
})

describe('bar extension — §409.7.3.8.4', () => {
  it('is max(d, 12db), in metres', () => {
    expect(barExtension(440, 16)).toBeCloseTo(0.440, 9)   // d governs
    expect(barExtension(150, 25)).toBeCloseTo(0.300, 9)   // 12db governs
  })
})

describe('buildBeamDetail', () => {
  const d = buildBeamDetail(b, { detailNo: '1' })
  const texts = d.primitives.filter((p) => p.kind === 'text').map((p) => (p as { text: string }).text)

  it('titles with the mark and section, and returns finite bounds', () => {
    expect(d.title).toBe('TYPICAL BEAM DETAIL — B1')
    expect(texts.join(' ')).toContain('B1 (300×500)')
    for (const v of Object.values(d.bounds)) expect(Number.isFinite(v)).toBe(true)
    expect(d.bounds.maxX).toBeGreaterThan(d.bounds.minX)
    expect(d.bounds.maxY).toBeGreaterThan(d.bounds.minY)
  })

  it('calls out top steel at both supports and bottom steel at midspan', () => {
    expect(texts).toContain('4-⌀16 TOP')
    expect(texts).toContain('6-⌀16 TOP')
    expect(texts).toContain('5-⌀16 BOT')
  })

  it('applies the continuity rule when an adjacent span is supplied', () => {
    // The left support here needs 4 from this span but 8 from next door.
    const cont = buildBeamDetail({ ...b, adjacentTopLeft: 8 })
    const t = cont.primitives.filter((p) => p.kind === 'text').map((p) => (p as { text: string }).text)
    expect(t).toContain('8-⌀16 TOP')
    expect(t).not.toContain('4-⌀16 TOP')
  })

  it('draws each stirrup zone at the spacing that section adopted', () => {
    expect(texts).toContain('2L-⌀10@100')
    expect(texts).toContain('2L-⌀10@200')
    // and the support zones really are denser than the middle
    const stirrups = d.primitives.filter((p) =>
      p.kind === 'line' && p.stroke === '#b45309' && Math.abs(p.x1 - p.x2) < 1e-9) as { x1: number }[]
    const nearLeft = stirrups.filter((s) => s.x1 < 1.5).length
    const nearMid = stirrups.filter((s) => s.x1 > 2.25 && s.x1 < 3.75).length
    expect(nearLeft).toBeGreaterThan(nearMid)
  })

  it('states the two rules a bar schedule cannot carry', () => {
    const all = texts.join(' | ')
    expect(all).toContain('GREATER OF THE TWO ADJACENT SPANS')
    expect(all).toContain('§409.7.7')
    expect(all).toContain('§409.7.3.8.4')
  })

  it('survives a degenerate member without throwing', () => {
    const bare = buildBeamDetail({ ...b, L: 0, sections: [] })
    expect(bare.primitives.length).toBeGreaterThan(0)
    for (const v of Object.values(bare.bounds)) expect(Number.isFinite(v)).toBe(true)
  })
})
