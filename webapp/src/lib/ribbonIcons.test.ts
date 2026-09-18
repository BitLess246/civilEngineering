/**
 * The ribbon's icon set, and the ribbon's shape.
 *
 * Two halves, and they guard different things. The DATA half re-applies to
 * `RIBBON_ICONS` every property `toolGroupIcons.test.ts` established for the
 * sidebar set — one grid, one stroke, absolute commands, every path a fresh
 * pen — because two sets drawn to different rules stop being one family the
 * moment they appear on the same screen, and they now do. The MARKUP half
 * reads `ModelSpace.tsx` and `panelKit.tsx` as source, which is how this repo
 * checks a layout it cannot screenshot: the rendered ribbon needs a browser,
 * so what is asserted here is that the properties which produce it are present.
 */
import { describe, it, expect } from 'vitest'
import { RIBBON_ICONS, ribbonIcon, ACTION_ICONS, actionIcon } from './ribbonIcons'
import { GROUP_ICONS } from './toolGroupIcons'
import { HEADER_PX } from './workspaceFit'
import { TAB_GROUPS, UTILITY_TABS, type Tab } from '../components/modelSpace/tabs'

const SOURCES = import.meta.glob('../**/*.tsx', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>
const src = (endsWith: string) =>
  Object.entries(SOURCES).find(([f]) => f.endsWith(endsWith))?.[1] ?? ''

/**
 * Source with its comments removed.
 *
 * FOURTH TIME THIS SESSION. A guard that scans a whole file for a string keeps
 * finding it in the COMMENT that explains why it was removed — the glyph check
 * below passed for exactly that reason on its first run, matching `↶ ↷ ⎙`
 * inside the note recording that they are gone. An assertion about what the
 * code DOES has to read code.
 */
const code = (s: string) =>
  s.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')   // JSX comments
    .replace(/\/\*[\s\S]*?\*\//g, ' ')        // block comments
    .replace(/^\s*\/\/.*$/gm, ' ')            // line comments

const everyTab = (): Tab[] =>
  [...TAB_GROUPS.flatMap((g) => g.tabs.map((t) => t.id)), ...UTILITY_TABS.map((t) => t.id)]

describe('coverage', () => {
  it('draws every tab the ribbon can show', () => {
    // At 20 px over a 10.5 px label the mark is half of what identifies a tab.
    // Derived from TAB_GROUPS rather than from a list kept here, so adding a
    // tab without a mark fails instead of shipping a hole in the row.
    for (const id of everyTab()) {
      expect(ribbonIcon(id), `no mark for tab "${id}"`).toBeTruthy()
    }
  })

  it('draws nothing the ribbon does not have', () => {
    const live = new Set<string>(everyTab())
    for (const key of Object.keys(RIBBON_ICONS)) {
      expect(live.has(key), `mark "${key}" matches no tab`).toBe(true)
    }
  })

  it('shares no key with the sidebar set, so neither can shadow the other', () => {
    // They are keyed differently on purpose — tab ids here, group LABELS there.
    // An overlap would mean one lookup could answer for the other set's mark.
    const overlap = Object.keys(RIBBON_ICONS).filter((k) => k in GROUP_ICONS)
    expect(overlap).toEqual([])
  })

  it('returns undefined for an unknown tab rather than throwing', () => {
    expect(ribbonIcon('nope')).toBeUndefined()
  })
})

/** The ribbon's two maps together: tab marks and action marks are drawn to
 *  the same rules, and the action marks are the ones that were exempt until
 *  they stopped being text glyphs. */
const ALL_RIBBON = { ...RIBBON_ICONS, ...ACTION_ICONS }

describe('the File block draws its actions too', () => {
  it('has a mark for each of the four global controls', () => {
    for (const id of ['undo', 'redo', 'pdf', 'guide']) {
      expect(actionIcon(id), `no mark for action "${id}"`).toBeTruthy()
    }
  })

  it('no longer types them as glyphs in the ribbon markup', () => {
    // `↶ ↷ ⎙` were text in the one ribbon that draws everything else. They
    // also sized themselves, which is what made the File block wrap into a
    // column and take the ribbon from 63 px to 251 at 390 px wide.
    const page = code(src('ModelSpace.tsx'))
    const ribbon = page.slice(page.indexOf('data-tour="tab-bar"'), page.indexOf('grid grid-cols-1 gap-4 p-4'))
    expect(ribbon.length, 'the ribbon slice came out empty').toBeGreaterThan(200)
    for (const glyph of ['↶', '↷', '⎙']) {
      expect(ribbon, `glyph ${glyph} still in the ribbon`).not.toContain(glyph)
    }
    expect(ribbon).toMatch(/<ActionBtn\b/)
  })

  it('gives an action the same box as a tab, so the row stays one shape', () => {
    const kit = src('panelKit.tsx')
    const widths = [...kit.matchAll(/flex w-\[(\d+)px\] flex-col items-center/g)].map((m) => m[1])
    expect(widths.length, 'TabBtn and ActionBtn').toBe(2)
    expect(widths[0]).toBe(widths[1])
  })

  it('never marks an action as a location', () => {
    // `aria-current="page"` on a button that exports a PDF is a lie to a
    // screen reader; only the tabs carry it.
    const kit = src('panelKit.tsx')
    const action = kit.slice(kit.indexOf('export function ActionBtn'))
    expect(action.slice(0, action.indexOf('export function', 10)))
      .not.toContain('aria-current')
  })
})

describe('one family with the sidebar, not a second style', () => {
  it('keeps every drawn coordinate inside the 24×24 grid', () => {
    for (const [id, icon] of Object.entries(ALL_RIBBON)) {
      const nums = icon.paths.join(' ').match(/-?\d+(\.\d+)?/g) ?? []
      expect(nums.length, id).toBeGreaterThan(0)
      for (const n of nums) {
        const v = Number(n)
        expect(v, `${id}: ${v} outside the grid`).toBeGreaterThanOrEqual(0)
        expect(v, `${id}: ${v} outside the grid`).toBeLessThanOrEqual(24)
      }
      for (const d of icon.dots ?? []) {
        expect(d.cx - d.r, id).toBeGreaterThanOrEqual(0)
        expect(d.cx + d.r, id).toBeLessThanOrEqual(24)
        expect(d.cy - d.r, id).toBeGreaterThanOrEqual(0)
        expect(d.cy + d.r, id).toBeLessThanOrEqual(24)
      }
    }
  })

  it('uses ABSOLUTE path commands only', () => {
    // Not style: it is what makes the grid check above mean anything. In a
    // relative path `h-9` is a legal 9-unit move left and a coordinate scan
    // reads it as −9. Absolute-only makes a negative number genuinely a
    // coordinate outside the box.
    for (const [id, icon] of Object.entries(ALL_RIBBON)) {
      for (const d of icon.paths) {
        expect(d.match(/[mlhvcsqtaz]/g), `${id}: relative command in "${d}"`).toBeNull()
      }
    }
  })

  it('starts every SUBPATH with a move, so none inherits the last one’s pen', () => {
    // Stricter than the sidebar's version, because these paths use internal
    // `M`s — the load arrows are shaft-and-head in one `d`. An `L` after a
    // subpath break would draw a stray stroke across the mark, so every
    // segment between moves is checked, not just the first character.
    for (const [id, icon] of Object.entries(ALL_RIBBON)) {
      for (const d of icon.paths) {
        expect(d.trim()[0], `${id}: "${d.slice(0, 14)}…"`).toBe('M')
        for (const part of d.split('M').slice(1)) {
          expect(part.trim().length, `${id}: empty subpath`).toBeGreaterThan(0)
        }
      }
    }
  })

  it('has enough in each mark to be a drawing, and not so much it is a texture', () => {
    for (const [id, icon] of Object.entries(ALL_RIBBON)) {
      expect(icon.paths.length, id).toBeGreaterThanOrEqual(1)
      expect(icon.paths.length, `${id} is too busy for 20 px`).toBeLessThanOrEqual(12)
    }
  })

  it('says what each mark depicts, and never falls back to an emoji', () => {
    for (const [id, icon] of Object.entries(ALL_RIBBON)) {
      expect(icon.depicts.length, id).toBeGreaterThan(8)
      expect(icon.depicts, id).not.toMatch(/icon|symbol|glyph/i)
    }
    expect(JSON.stringify(ALL_RIBBON))
      .not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u)
  })
})

describe('ONE renderer, which is what makes one stroke weight true', () => {
  it('has no second <svg> hand-rolled around an icon set', () => {
    // `ICON_STROKE` being a shared constant only guarantees one weight if one
    // component reads it. Both call sites must go through `DrawnIcon`; a file
    // that maps over `icon.paths` itself has forked the renderer.
    for (const [file, s] of Object.entries(SOURCES)) {
      if (file.endsWith('DrawnIcon.tsx')) continue
      expect(s.includes('icon.paths.map'), `${file} draws its own icon svg`).toBe(false)
    }
  })

  it('renders the ribbon marks through it', () => {
    expect(src('panelKit.tsx')).toMatch(/<DrawnIcon\b[^>]*ribbonIcon\(/)
  })
})

describe('the ribbon is an Office ribbon', () => {
  const ribbon = src('ModelSpace.tsx')
  const kit = src('panelKit.tsx')

  it('freezes in place exactly under the app header', () => {
    // The offset is `HEADER_PX`, which is the header's MEASURED box — 45, not
    // the 44 that `h-11` reads, because the class sets the content height and
    // the `border-b` hairline is a pixel on top of it. Parking at `top-11`
    // tucked the ribbon's first pixel row behind the header. The two must
    // agree, so both are asserted against the one constant.
    expect(HEADER_PX).toBe(45)
    expect(ribbon).toMatch(new RegExp(`sticky top-\\[${HEADER_PX}px\\] z-30`))
    expect(ribbon, 'the class-derived offset came back').not.toMatch(/sticky top-11/)
    const shell = src('AppShell.tsx')
    expect(shell, 'header is no longer sticky at the top').toMatch(/sticky top-0 z-40/)
    expect(shell, `header height changed — ${HEADER_PX} is now wrong`)
      .toMatch(/flex h-11 items-center/)
    expect(shell, 'header lost the border the extra pixel comes from')
      .toMatch(/sticky top-0 z-40 border-b/)
  })

  it('scrolls sideways rather than growing into a tower', () => {
    // Measured wrapping: 76 px at 1280 and up, 138 at 1024 and 768, 264 at
    // 390 — where a FROZEN 264 px band is most of a phone screen, so the fix
    // for one ask defeated the other. One band at every width, panned.
    expect(ribbon).toMatch(/flex min-w-0 flex-1 items-stretch overflow-x-auto/)
    expect(ribbon, 'the wrapping row came back').not.toMatch(/flex min-w-0 flex-1 flex-wrap/)
  })

  it('names that scroll region, because focus can land in it', () => {
    // The same `tabIndex`/`aria-label` pairing the audit's scroll-region pass
    // established for the data tables: a focusable box that announces nothing.
    expect(ribbon).toMatch(/overflow-x-auto"\n\s*tabIndex=\{0\} role="group" aria-label="[^"]+"/)
  })

  it('stacks the mark over the word, at a fixed command width', () => {
    // `flex-col` is the icon-over-label; the fixed width is what keeps the row
    // of marks straight instead of each command sizing to its own word.
    expect(kit).toMatch(/flex w-\[\d+px\] flex-col items-center/)
  })

  it('puts each group’s name UNDER its commands, once per group', () => {
    // Three labelled groups plus Utilities plus File. Counted rather than
    // merely present: a label rendered once for the whole row is the layout
    // this replaces.
    const labels = ribbon.match(/font-bold uppercase tracking-\[\.14em\] text-faint/g) ?? []
    expect(labels.length).toBe(3)   // the map's label, Utilities, File
    expect(ribbon).toMatch(/role="group" aria-label=\{g\.label\}/)
    expect(ribbon).toMatch(/aria-label="Utilities"/)
    expect(ribbon).toMatch(/aria-label="File"/)
  })

  it('rules BETWEEN the blocks and not before the first', () => {
    // A rule at the start of the row dangles — the defect the previous layout
    // hit when the ribbon wrapped. `i > 0` is the whole fix.
    expect(ribbon).toMatch(/\{i > 0 && <Rule \/>\}/)
  })

  it('draws that rule the full height of what it separates', () => {
    // A 16px stub beside a two-row block reads as a stray mark.
    expect(kit).toMatch(/self-stretch/)
    expect(kit, 'the rule still has a fixed height').not.toMatch(/h-4 w-px shrink-0 bg-hairline/)
  })

  it('does not duplicate the group name to a screen reader', () => {
    // The visible label and the group's aria-label are the same word. Marking
    // the visible one `aria-hidden` is what stops "Model, Model".
    for (const m of ribbon.matchAll(/<span aria-hidden className="[^"]*tracking-\[\.14em\][^"]*">/g)) {
      expect(m[0]).toContain('aria-hidden')
    }
    expect(ribbon).not.toMatch(/<span className="[^"]*tracking-\[\.14em\] text-faint">\{g\.label\}/)
  })
})

describe('the ribbon order IS the page order', () => {
  // `tabs.ts` opens by saying a guard reads the source order of the
  // `tab === '…'` blocks in `ModelSpace.tsx` and requires the two to agree.
  // It did not: `tours.test.ts` reads that same order, but compares it against
  // the WALKTHROUGH, not against `TAB_GROUPS`. The claim was true of the
  // intent and not of the code — the file header asserted a guard into
  // existence. Here it is.
  const page = src('ModelSpace.tsx')
  const pageOrder = [...page.matchAll(/tab === '([a-z-]+)'/g)]
    .map((m) => m[1])
    .filter((t, i, a) => a.indexOf(t) === i)     // first appearance wins

  it('found the page’s panel blocks at all', () => {
    // A regex that matched nothing would make the comparison vacuously true.
    expect(pageOrder.length).toBeGreaterThanOrEqual(10)
  })

  it('renders a panel for every tab the ribbon offers', () => {
    const missing = everyTab().filter((id) => !pageOrder.includes(id))
    expect(missing, 'ribbon tab with no panel behind it').toEqual([])
  })

  it('offers a ribbon command for every panel the page has', () => {
    const live = new Set<string>(everyTab())
    const orphans = pageOrder.filter((t) => !live.has(t))
    expect(orphans, 'panel no ribbon command reaches').toEqual([])
  })

  it('lists them in the same sequence, which is what the groups claim', () => {
    // TAB_GROUPS says the tabs are a SEQUENCE — model, analyse, results — and
    // the guide says "left to right". Both are false the moment the panels are
    // written in a different order from the ribbon, and nothing on screen
    // would show it. Utilities are excluded: they are explicitly not in the
    // sequence (see `UTILITY_TABS`).
    const sequenced = TAB_GROUPS.flatMap((g) => g.tabs.map((t) => t.id as string))
    const asWritten = pageOrder.filter((t) => sequenced.includes(t))
    expect(asWritten).toEqual(sequenced)
  })
})
