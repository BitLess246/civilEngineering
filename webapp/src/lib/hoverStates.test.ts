import { describe, it, expect } from 'vitest'
// Vite's glob rather than `node:fs` — the app project carries no @types/node,
// the same reason pipelineComposition.test.ts reaches for `?raw`.
const SOURCES = import.meta.glob('../**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

/**
 * A hover state that resolves to its own rest state is not feedback.
 *
 * This shipped as a regression from the token migration (#755): `#135caf` and
 * `#004a99` are brand-family blues that were used as HOVER shades, and the
 * migration's hover rule only named `#0f4c92` and the `#0d3f78` family — so
 * those two fell through to the generic `brand` mapping and eleven buttons
 * stopped responding to the pointer. The visual result is subtle enough that
 * no screenshot review caught it; the pairing is mechanical enough that a test
 * can.
 *
 * Reads source rather than rendering, because the defect is a class-name pair
 * and the repo has no DOM harness.
 */

/** Class strings, so a hover in one element is not paired with a rest in another. */
const chunks = (src: string) =>
  src.split(/(`[^`]*`|"[^"]*"|'[^']*')/).filter((c) => /^["'`]/.test(c))

const PROPS = ['bg', 'text', 'border'] as const

function deadPairs(src: string): string[] {
  const found: string[] = []
  for (const c of chunks(src)) {
    for (const prop of PROPS) {
      const rest = new Set([...c.matchAll(new RegExp(`(?<![\\w:-])${prop}-(brand|brand-hover)(?![\\w-])`, 'g'))].map((m) => m[1]))
      const hov = new Set([...c.matchAll(new RegExp(`hover:${prop}-(brand|brand-hover)(?![\\w-])`, 'g'))].map((m) => m[1]))
      for (const t of rest) if (hov.has(t)) found.push(`${prop}-${t} with hover:${prop}-${t}`)
    }
  }
  return found
}

describe('hover states are distinguishable from rest', () => {
  const files = Object.keys(SOURCES)

  it('no element sets a brand hover to its own rest value', () => {
    const offenders: string[] = []
    for (const f of files) for (const d of deadPairs(SOURCES[f])) offenders.push(`${f}: ${d}`)
    expect(offenders).toEqual([])
  })

  it('DISCRIMINATES — the shipped defect is detected', () => {
    // Exactly the shape that shipped: rest and hover collapsed onto one token.
    expect(deadPairs(`className="rounded bg-brand px-5 hover:bg-brand"`)).toHaveLength(1)
    // …and a real pair is not flagged.
    expect(deadPairs(`className="rounded bg-brand px-5 hover:bg-brand-hover"`)).toEqual([])
    // …nor is a hover on a DIFFERENT property than the rest state.
    expect(deadPairs(`className="bg-brand text-on-solid hover:text-brand"`)).toEqual([])
  })

  it('does not pair across separate class strings', () => {
    // Two different elements may legitimately use bg-brand and hover:bg-brand.
    expect(deadPairs(`const a = "bg-brand"\nconst b = "hover:bg-brand"`)).toEqual([])
  })

  it('actually scanned the tree', () => {
    expect(files.length).toBeGreaterThan(100)
  })
})
