/**
 * The icon set, as data.
 *
 * At 60 px the icon is the ONLY thing identifying a group, so "every group has
 * one" is a correctness property, not a nicety — a missing mark is an
 * unreachable eleventh of the tool catalog. These check the things that make
 * eleven drawings read as one set, and the thing that makes them navigable.
 */
import { describe, it, expect } from 'vitest'
import { GROUP_ICONS, ICON_VIEWBOX, ICON_STROKE, iconFor } from './toolGroupIcons'
import { SIDEBAR_GROUPS } from './tools'

describe('coverage', () => {
  it('draws every group the sidebar can show', () => {
    for (const g of SIDEBAR_GROUPS) {
      expect(iconFor(g.label), `no icon for "${g.label}"`).toBeTruthy()
    }
  })

  it('draws nothing the sidebar does not have', () => {
    // A stale icon is harmless on screen and a lie in this file; catching it
    // here keeps the set honest when a group is renamed.
    const labels = new Set(SIDEBAR_GROUPS.map((g) => g.label))
    for (const key of Object.keys(GROUP_ICONS)) {
      expect(labels.has(key), `icon "${key}" matches no group`).toBe(true)
    }
  })

  it('returns undefined for an unknown label rather than throwing', () => {
    expect(iconFor('Nope')).toBeUndefined()
  })
})

describe('one set, not eleven pictures', () => {
  it('shares one grid and one stroke weight', () => {
    // The single most visible failure of a hand-drawn icon set is mixed stroke
    // widths — it reads as marks borrowed from three places, which is what it
    // would be. One constant, used by the one component that renders these.
    expect(ICON_VIEWBOX).toBe('0 0 24 24')
    expect(ICON_STROKE).toBeGreaterThan(1)
    expect(ICON_STROKE).toBeLessThan(2.5)
  })

  it('keeps every drawn coordinate inside the 24×24 grid', () => {
    // A path that runs outside the box is clipped at some sizes and not at
    // others, so the set stops being a set as soon as the rail resizes.
    for (const [label, icon] of Object.entries(GROUP_ICONS)) {
      const nums = icon.paths.join(' ').match(/-?\d+(\.\d+)?/g) ?? []
      expect(nums.length, label).toBeGreaterThan(0)
      for (const n of nums) {
        const v = Number(n)
        expect(v, `${label}: ${v} outside the grid`).toBeGreaterThanOrEqual(0)
        expect(v, `${label}: ${v} outside the grid`).toBeLessThanOrEqual(24)
      }
      for (const d of icon.dots ?? []) {
        expect(d.cx - d.r, label).toBeGreaterThanOrEqual(0)
        expect(d.cx + d.r, label).toBeLessThanOrEqual(24)
        expect(d.cy - d.r, label).toBeGreaterThanOrEqual(0)
        expect(d.cy + d.r, label).toBeLessThanOrEqual(24)
      }
    }
  })

  it('uses ABSOLUTE path commands only', () => {
    // Not style: it is what makes the grid check above mean anything. In a
    // relative path `h-9` is a legal 9-unit move left, and a naive coordinate
    // scan reads it as −9 and calls it off-grid. The first version of that
    // check did exactly that. Absolute-only makes a negative number genuinely
    // a coordinate outside the box, so the guard tests the drawing instead of
    // the notation.
    for (const [label, icon] of Object.entries(GROUP_ICONS)) {
      for (const d of icon.paths) {
        const rel = d.match(/[mlhvcsqtaz]/g)
        expect(rel, `${label}: relative command in "${d}"`).toBeNull()
      }
    }
  })

  it('starts every path with a move, so none inherits the last one’s pen', () => {
    // An SVG path beginning with a line command continues from wherever the
    // previous subpath ended. In a multi-path icon that draws a stray
    // connecting stroke across the mark.
    for (const [label, icon] of Object.entries(GROUP_ICONS)) {
      for (const d of icon.paths) {
        expect(d.trim()[0], `${label}: "${d.slice(0, 12)}…"`).toMatch(/[Mm]/)
      }
    }
  })

  it('has enough in each mark to be a drawing, and not so much it is a texture', () => {
    for (const [label, icon] of Object.entries(GROUP_ICONS)) {
      expect(icon.paths.length, label).toBeGreaterThanOrEqual(1)
      expect(icon.paths.length, `${label} is too busy for 16 px`).toBeLessThanOrEqual(12)
    }
  })
})

describe('every mark says what it depicts', () => {
  it('carries a description, which is what the tooltip and the next reader use', () => {
    for (const [label, icon] of Object.entries(GROUP_ICONS)) {
      expect(icon.depicts.length, label).toBeGreaterThan(8)
      expect(icon.depicts, label).not.toMatch(/icon|symbol|glyph/i)
    }
  })

  it('never falls back to an emoji or a text glyph', () => {
    // The craft floor's rule, made mechanical: icons are drawn, not typed. An
    // emoji is a different typeface on every platform and has no stroke weight
    // to share with the rest of the set.
    const blob = JSON.stringify(GROUP_ICONS)
    expect(blob).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u)
  })
})
