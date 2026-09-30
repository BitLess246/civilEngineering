import { describe, it, expect } from 'vitest'
import { cpmNodeLabel } from './cpmLabel'

describe('cpmNodeLabel', () => {
  it('shows the work, not the location the id already carries', () => {
    expect(cpmNodeLabel('Columns L2 — concrete pour')).toBe('concrete pour')
    expect(cpmNodeLabel('Floor 3 — formwork & shoring')).toBe('formwork & shoring')
  })

  it('a footing node no longer starts with a stray dash', () => {
    expect(cpmNodeLabel('Footings — formwork & rebar')).toBe('formwork & rebar')
  })

  it('keeps a name with no location whole, and marks a cut with an ellipsis', () => {
    expect(cpmNodeLabel('Backfill & compaction')).toBe('Backfill & compaction'.slice(0, 17) + '…')
    expect(cpmNodeLabel('Excavation & site preparation')).toBe('Excavation & site…')
    expect(cpmNodeLabel('Excavation & site preparation')).toHaveLength(18)
    expect(cpmNodeLabel('Roof')).toBe('Roof')
  })
})
