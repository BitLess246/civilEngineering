// The CPM node's editable DUR cell, pinned as source (vitest runs without a
// DOM here — see ErrorBoundary.test.tsx).
//
// index.css styles every text/number input UNLAYERED: white `--field`
// background, 0.5 rem × 0.75 rem padding. Unlayered CSS beats Tailwind's
// layered utilities, so the cell's plain `bg-transparent` lost: white text on
// a white field, padded out of a 22 px cell — the duration read as blank.

import { describe, it, expect } from 'vitest'
import src from './CriticalPathDiagram.tsx?raw'
import css from '../index.css?raw'

describe('CPM duration cell', () => {
  const input = src.slice(src.indexOf('<input type="number"'))
  const cls = /className="([^"]*)"/.exec(input)![1]!.split(/\s+/)

  it('the global field rule it has to beat is still unlayered', () => {
    // if this moves into @layer base, the `!` below can go
    expect(css).toMatch(/^input:not\(\[type="checkbox"\]\)/m)
  })

  it('overrides the field background, padding, border and radius with !important', () => {
    for (const c of ['!bg-transparent', '!p-0', '!border-0', '!rounded-none']) expect(cls).toContain(c)
    expect(cls).not.toContain('bg-transparent')   // the plain utility that lost
    expect(cls).toContain('text-white')
  })
})

describe('no short field is clipped by the global field padding', () => {
  // The same rule, anywhere: a field given a fixed height of 32 px or less has
  // ~16 px of vertical padding forced on it and its text is cut off (the header
  // theme select read "Drafting sheet" with its top sliced away). Such a field
  // must override the padding with `!p-*` / `!py-*`.
  const sources = import.meta.glob('../{components,pages}/**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

  it('every select / text-like input with h-4…h-8 overrides the vertical padding', () => {
    const bad: string[] = []
    for (const [file, s] of Object.entries(sources)) {
      for (const m of s.matchAll(/<(select|input)\b/g)) {
        let seg = s.slice(m.index!, m.index! + 700)
        const next = /<(select|input|option|\/select)\b/.exec(seg.slice(1))
        if (next) seg = seg.slice(0, next.index + 1)
        if (/type="(checkbox|radio|range|button|submit|color|file)"/.test(seg)) continue
        const cls = /className="([^"]*)"/.exec(seg)?.[1]
        if (!cls || !/(^|\s)h-([4-8]|\[\d+px\])(\s|$)/.test(cls)) continue
        if (!/(^|\s)!p[yt]?-/.test(cls)) bad.push(`${file}:${s.slice(0, m.index).split('\n').length}`)
      }
    }
    expect(bad).toEqual([])
  })
})
