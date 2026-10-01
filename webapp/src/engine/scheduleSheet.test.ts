import { describe, it, expect } from 'vitest'
import { buildScheduleSheet } from './scheduleSheet'
import { PAPER } from './generalNotes'

const table = {
  heading: 'T', columns: [{ head: 'A', w: 10 }, { head: 'B', w: 10, align: 'end' as const }],
  rows: [['x', '11'], ['y', ''], ['z', '33']], failRows: [2],
}

describe('buildScheduleSheet', () => {
  const d = buildScheduleSheet([table], { title: 'SHEET' })
  const texts = d.primitives.filter((p) => p.kind === 'text') as { text: string; color?: string; anchor?: string }[]

  it('draws every non-empty cell once, and nothing for an empty one', () => {
    for (const t of ['A', 'B', 'x', '11', 'y', 'z', '33']) expect(texts.filter((p) => p.text === t)).toHaveLength(1)
    expect(texts.some((p) => p.text === '')).toBe(false)
  })

  it('inks a failing row differently from a passing one', () => {
    const ink = (t: string) => texts.find((p) => p.text === t)!.color
    expect(ink('z')).not.toBe(ink('x'))
    expect(ink('33')).toBe(ink('z'))
  })

  it('carries the title block and pads its bounds to the A3 proportion', () => {
    expect(texts.some((p) => p.text === 'SHEET')).toBe(true)
    const b = d.bounds
    expect((b.maxX - b.minX) / (b.maxY - b.minY)).toBeCloseTo(PAPER.A3.w / PAPER.A3.h, 6)
  })
})
