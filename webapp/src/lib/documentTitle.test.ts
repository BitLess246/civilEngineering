import { describe, it, expect } from 'vitest'
import { titleFor } from './documentTitle'
import { ALL_TOOLS } from './tools'

describe('titleFor — every route names itself', () => {
  it('names a tool route from the same registry the sidebar reads', () => {
    expect(titleFor('/beam-design')).toContain('Beam Design')
    expect(titleFor('/beam-design')).toContain('Toolkit')
  })

  it('longest prefix wins, so a sub-route keeps its own name', () => {
    // '/estimate/slab' must not be captured by an '/estimate' entry.
    const slab = ALL_TOOLS.find((t) => t.to === '/estimate/slab')
    if (slab) expect(titleFor('/estimate/slab')).toContain(slab.name)
    expect(titleFor('/schedule/gantt')).not.toBe(titleFor('/schedule'))
  })

  it('covers the routes that are not tools', () => {
    expect(titleFor('/profile')).toContain('Account')
    expect(titleFor('/signin')).toContain('Sign in')
  })

  it('the landing page is the brand, with no dangling separator', () => {
    expect(titleFor('/')).not.toContain('—')
    expect(titleFor('/')).toContain('Toolkit')
  })

  it('an unknown route still gets a title rather than an empty tab', () => {
    expect(titleFor('/no-such-page').length).toBeGreaterThan(0)
  })

  it('DISCRIMINATES — this is the whole point', () => {
    // The shipped bug was one <title> for all 53 routes. A title function that
    // returned the same string everywhere would pass every assertion above
    // except this one.
    const titles = new Set(['/beam-design', '/column-design', '/soils', '/profile', '/validation'].map(titleFor))
    expect(titles.size).toBe(5)
  })
})
