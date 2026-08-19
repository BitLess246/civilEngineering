import { describe, it, expect, vi, afterEach } from 'vitest'
import { scrollTop } from './useScrollTop'

// The suite runs under `environment: 'node'` — there is no `window` — so this
// also pins the guard that keeps the helper importable from a non-browser
// context instead of throwing on module use.
const g = globalThis as { window?: unknown }

afterEach(() => { delete g.window })

describe('scrollTop', () => {
  it('is a no-op without a window rather than throwing', () => {
    expect(typeof g.window).toBe('undefined')
    expect(() => scrollTop()).not.toThrow()
  })

  it('jumps to the origin INSTANTLY when a window exists', () => {
    // Instant, not smooth: a smooth scroll from deep in a long schedule reads
    // as lag and animates past content nobody asked to see.
    const scrollTo = vi.fn()
    g.window = { scrollTo }
    scrollTop()
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' })
  })
})
