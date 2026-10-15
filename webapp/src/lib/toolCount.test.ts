import { describe, it, expect } from 'vitest'
import { ALL_TOOLS, TOOL_COUNT, isReferenceGroup } from './tools'

describe('TOOL_COUNT', () => {
  it('counts tools, not the Reference pages (docs, code library, validation, pricing)', () => {
    const ref = ALL_TOOLS.filter((t) => isReferenceGroup(t.groupLabel)).map((t) => t.to).sort()
    expect(ref).toEqual(['/codes', '/docs', '/pricing', '/validation'])
    expect(TOOL_COUNT).toBe(ALL_TOOLS.length - ref.length)
  })
})
