import { describe, it, expect } from 'vitest'
import {
  publishPageSnapshot, readPageSnapshot, formatPageSnapshot, composePageContext,
  MAX_SNAPSHOT_CHARS, MAX_PAGE_CONTEXT_CHARS, type PageSnapshot,
} from './pageContext'
import { MAX_PAGE_CHARS } from '../../../../supabase/functions/_shared/aiAssistant'

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

describe('composePageContext', () => {
  it('a page with no snapshot is still seen — the on-screen reading is sent alone', () => {
    expect(composePageContext(null, () => 'Page: Isolated Footing')).toBe('Page: Isolated Footing')
    expect(composePageContext(null, null)).toBeNull()
    expect(composePageContext(null, () => '')).toBeNull()
  })

  it('the snapshot leads, the screen gets the room that is left, and the whole fits the cap', () => {
    let room = 0
    const text = composePageContext('S'.repeat(1000), (max) => { room = max; return 'D'.repeat(max) })!
    expect(text.startsWith('S'.repeat(1000))).toBe(true)
    expect(text).toContain('On screen:')
    expect(room).toBe(MAX_PAGE_CONTEXT_CHARS - 1002)
    expect(text.length).toBeLessThanOrEqual(MAX_PAGE_CONTEXT_CHARS)
  })

  it('a snapshot that fills the budget is never cut for the screen reading', () => {
    const snapText = 'S'.repeat(MAX_PAGE_CONTEXT_CHARS - 100)
    let called = false
    expect(composePageContext(snapText, () => { called = true; return 'D' })).toBe(snapText)
    expect(called).toBe(false)
  })

  it('the browser cap is the server cap, so nothing the client sends is silently cut', () => {
    expect(MAX_PAGE_CONTEXT_CHARS).toBe(MAX_PAGE_CHARS)
  })
})
