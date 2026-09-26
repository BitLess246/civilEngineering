import { describe, it, expect } from 'vitest'
import {
  publishPageSnapshot, readPageSnapshot, formatPageSnapshot,
  MAX_SNAPSHOT_CHARS, type PageSnapshot,
} from './pageContext'

const snap = (route: string): PageSnapshot => ({
  route,
  tool: 'Beam Design',
  inputs: [{ label: 'b', value: '300 mm' }],
  results: [{ label: 'verdict', value: 'DESIGN OK' }],
  notes: [],
})

describe('page snapshot store', () => {
  it('publishes, reads, and withdraws per route', () => {
    expect(readPageSnapshot('/beam-design')).toBeNull()
    publishPageSnapshot('/beam-design', snap('/beam-design'))
    expect(readPageSnapshot('/beam-design')?.tool).toBe('Beam Design')
    // Another route is unaffected.
    expect(readPageSnapshot('/frame')).toBeNull()
    publishPageSnapshot('/beam-design', null)
    expect(readPageSnapshot('/beam-design')).toBeNull()
  })
})

describe('formatPageSnapshot', () => {
  it('renders inputs, results and notes in the page order', () => {
    const text = formatPageSnapshot({
      ...snap('/beam-design'),
      results: [
        { label: 'Flexure Mu/φMn', value: '0.83' },
        { label: 'verdict', value: 'DESIGN OK' },
      ],
      notes: ['doubly reinforced'],
    })
    expect(text).toContain('Open calculator: Beam Design (/beam-design)')
    expect(text).toContain('Inputs: b=300 mm')
    expect(text).toContain('Flexure Mu/φMn=0.83; verdict=DESIGN OK')
    expect(text).toContain('Notes: doubly reinforced')
  })

  it('caps a runaway snapshot instead of dumping it', () => {
    const big: PageSnapshot = {
      ...snap('/beam-design'),
      results: [{ label: 'table', value: 'x'.repeat(MAX_SNAPSHOT_CHARS + 100) }],
    }
    const text = formatPageSnapshot(big)
    expect(text.length).toBeLessThanOrEqual(MAX_SNAPSHOT_CHARS + 1)
    expect(text.endsWith('…')).toBe(true)
  })
})
