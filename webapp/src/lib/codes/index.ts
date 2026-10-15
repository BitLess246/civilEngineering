// Code Library registry — every provision, the shelves, and search.
import { RC_BEAM_PROVISIONS } from './rcBeam'
import { STEEL_PROVISIONS } from './steel'
import { LOADS_PROVISIONS } from './loads'
import type { CodeCategory, Provision, RcBeamProvision } from './types'
import { CATEGORY_LABEL } from './types'

export * from './types'
export { DEFAULT_BEAM } from './rcBeam'

export const PROVISIONS: Provision[] = [...RC_BEAM_PROVISIONS, ...STEEL_PROVISIONS, ...LOADS_PROVISIONS]

export const CODE_EDITIONS = [
  { id: 'NSCP 2015', available: true },
] as const

export const provisionById = (id: string): Provision | undefined => PROVISIONS.find((p) => p.id === id)

/** An RC-beam provision by id — narrowed, so its example can be run on a beam. */
export const rcBeamProvision = (id: string): RcBeamProvision | undefined => {
  const p = provisionById(id)
  return p?.family === 'rc-beam' ? p : undefined
}

/** Shelves in display order, with the provisions on each (empty shelves are "planned"). */
export function shelves(): { category: CodeCategory; label: string; items: Provision[] }[] {
  return (Object.keys(CATEGORY_LABEL) as CodeCategory[]).map((category) => ({
    category, label: CATEGORY_LABEL[category], items: PROVISIONS.filter((p) => p.category === category),
  }))
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')

/**
 * Provisions matching a query: every word must appear in the title, summary,
 * component, keywords, a variable's name or a clause number. Ranked title →
 * keyword → elsewhere, so "shear" puts the shear provision first.
 */
export function searchProvisions(query: string, pool: Provision[] = PROVISIONS): Provision[] {
  const words = norm(query).split(/\s+/).filter(Boolean)
  if (!words.length) return pool
  const scored = pool.map((p) => {
    const title = norm(p.title)
    const keys = norm(p.keywords.join(' ') + ' ' + p.component)
    const rest = norm([p.summary, ...Object.values(p.variables).map((v) => v.name), ...Object.values(p.refs).map((r) => `${r.clause} ${r.topic} ${r.parallel ?? ''}`)].join(' '))
    let score = 0
    for (const w of words) {
      if (title.includes(w)) score += 3
      else if (keys.includes(w)) score += 2
      else if (rest.includes(w)) score += 1
      else return { p, score: -1 }
    }
    return { p, score }
  })
  return scored.filter((s) => s.score >= 0).sort((a, b) => b.score - a.score).map((s) => s.p)
}
