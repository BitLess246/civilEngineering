// ─────────────────────────────────────────────────────────────────────────
// THE CONTROL PANEL'S FURNITURE — the ribbon's tabs, and the section, chip and
// swatch pieces every tab is built from.
//
// Also the TAB LIST itself, which is the page's one statement of what order the
// tabs come in. A guard test reads the source order of the `tab === '…'` blocks
// in the page and requires the two to agree, so this is the half of that pair
// that is data rather than markup.
// ─────────────────────────────────────────────────────────────────────────
import { type ReactNode } from 'react'
import type { SolveProgress } from '../../engine/progress'
import { LAT_DIRS, type Tab } from './tabs'
import { actionIcon, ribbonIcon } from '../../lib/ribbonIcons'
import { DrawnIcon } from '../DrawnIcon'
import { useSyncExternalStore } from 'react'
import { isCollapsed, sectionsSnapshot, subscribeSections, toggleSectionInStore } from './sectionState'

/** Live solver-progress card: phase, detail, and a determinate (current/total)
 *  or indeterminate bar. Renders nothing when idle. */
export function SolverProgress({ p }: { p: SolveProgress | null }) {
  if (!p) return null
  const pct = p.total && p.current ? Math.min(100, Math.round((p.current / p.total) * 100)) : null
  return (
    <div className="col-span-full rounded-lg border border-brand/30 bg-brand-tint/60 p-2.5">
      <div className="flex items-center justify-between text-[11px] font-semibold text-brand">
        <span>⏳ {p.phase}</span>
        <span className="tabular-nums text-muted">
          {p.total && p.current ? `${p.current} / ${p.total}` : ''}{pct !== null ? ` · ${pct}%` : ''}
        </span>
      </div>
      {p.detail && (
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted">
          <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-brand opacity-70" />
          <span className="truncate font-mono">{p.detail}</span>
        </div>
      )}
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-brand-line">
        {pct !== null
          ? <div className="h-full rounded-full bg-brand transition-all duration-150" style={{ width: `${pct}%` }} />
          : <div className="h-full w-1/3 animate-pulse rounded-full bg-brand" />}
      </div>
    </div>
  )
}

export function DirPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (d: string) => onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d])
  return (
    <div className="col-span-full flex flex-col text-sm">
      <span className="mb-1 font-medium text-muted">Directions to envelope</span>
      <div className="flex gap-1.5">
        {LAT_DIRS.map((d) => (
          <label key={d} className={`inline-flex cursor-pointer items-center gap-1 rounded border px-2 py-0.5 text-xs ${value.includes(d) ? 'border-brand bg-brand-tint text-brand' : 'border-hairline text-muted'}`}>
            <input type="checkbox" className="sr-only" checked={value.includes(d)} onChange={() => toggle(d)} />{d}
          </label>
        ))}
      </div>
    </div>
  )
}

// ── Right-panel tabs ────────────────────────────────────────────────────────

/**
 * A panel section: uppercase mini-title, no card chrome — hairline separation
 * comes from the parent's divide-y.
 *
 * COLLAPSIBLE. The title row is the control: clicking it folds the section away
 * and leaves the heading and its chevron, so a tab carrying ten sections can be
 * reduced to the one being worked in. Which are folded is remembered in
 * `sectionState` — see there for why that state does not live in this component.
 *
 * `id` defaults to the title, which is right for the three dozen sections whose
 * title is a fixed string. It is NOT right where the title carries an element's
 * name ("Member — bx1.1.1"): the key would change with the selection, so folding
 * one member's panel would leave the next one open. Those callers pass an `id`.
 */
export function Sec({ id, title, hint, grid = true, children }: {
  id?: string; title: ReactNode; hint?: ReactNode; grid?: boolean; children: ReactNode
}) {
  const key = id ?? (typeof title === 'string' ? title : '')
  const state = useSyncExternalStore(subscribeSections, sectionsSnapshot, sectionsSnapshot)
  const folded = isCollapsed(state, key)
  return (
    <section className="py-3.5">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <button type="button" onClick={() => toggleSectionInStore(key)} aria-expanded={!folded}
          className="group flex min-w-0 items-baseline gap-1.5 text-left">
          <span aria-hidden
            className={`shrink-0 text-[8px] leading-none text-faint transition-transform group-hover:text-brand ${folded ? '' : 'rotate-90'}`}>
            ▶
          </span>
          <span className="text-[10px] font-bold uppercase tracking-[.12em] text-faint group-hover:text-brand">
            {title}
          </span>
        </button>
        {hint && <span className="text-[10.5px] text-faint">{hint}</span>}
      </div>
      {/* Column count follows THE RAIL, not the viewport. `lg:` is where the
          panel stops being full-width and becomes a fixed 380 px column, so
          three columns there would be ~110 px per field — the widening of the
          viewport is exactly when the panel has least room. */}
      {/* Unmounted rather than hidden: these sections hold live inputs and 3D
          previews, and a folded one should cost nothing to keep folded. */}
      {!folded && (grid
        ? <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-2">{children}</div>
        : children)}
    </section>
  )
}
/**
 * Legend chips for a display toggle — the colour, then what it means.
 *
 * On its own line under the label rather than inline beside it: in a 380 px
 * rail an inline legend wraps between the swatch and its own word, which reads
 * as a different control rather than as a key.
 */

/**
 * Legend chips for a display toggle — the colour, then what it means.
 *
 * On its own line under the label rather than inline beside it: in a 380 px
 * rail an inline legend wraps between the swatch and its own word, which reads
 * as a different control rather than as a key.
 */
export function Swatches({ items }: { items: readonly (readonly [string, string])[] }) {
  return (
    <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 pl-6 text-[11px] text-muted">
      {items.map(([color, label]) => (
        <span key={label} className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded-sm" style={{ background: color }} />{label}
        </span>
      ))}
    </div>
  )
}
/**
 * Hairline between two ribbon groups.
 *
 * FULL HEIGHT of the group block, not a 16 px stub, because the blocks are now
 * two rows tall (commands, then the group's name). A short rule floating beside
 * a tall block reads as a stray mark; a rule the height of what it separates
 * reads as the edge of a section, which is what it is.
 */
export function Rule() {
  return <span aria-hidden className="mx-1 w-px shrink-0 self-stretch bg-hairline" />
}

/**
 * A ribbon command that DOES something, rather than switching panel.
 *
 * The same box as `TabBtn` — same width, same mark-over-word — because the
 * File block sits in the same row as the tab groups and a control that is
 * nearly the same shape reads as a mistake where one that is exactly the same
 * shape reads as a section. What differs is the state it can be in: a tab is
 * current or not, an action is available or not.
 *
 * NO `aria-current`. An action is not a location.
 */
export function ActionBtn({ label, title, icon, disabled, onClick }: {
  label: string
  /** The tooltip, which carries what the short label cannot — the shortcut,
   *  the undo depth, or why the control is unavailable. */
  title: string
  icon: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} aria-label={label}
      className="flex w-[76px] flex-col items-center gap-1 rounded-[5px] px-1 py-1.5 text-[10.5px] font-semibold leading-tight text-muted transition hover:bg-brand-tint hover:text-ink disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-muted">
      <DrawnIcon icon={actionIcon(icon)} size={20} />
      <span className="w-full truncate text-center">{label}</span>
    </button>
  )
}

/**
 * One ribbon command: its drawn mark over its word.
 *
 * ICON OVER LABEL, not label alone. Twelve words in a row is a list you read
 * every time; twelve marks over twelve words is a shape you learn once and
 * then aim at. The word stays — an icon-only ribbon makes the first week worse
 * to make the second better, and this page has tabs a user may meet twice a
 * year (Pushover) beside ones they use hourly (Geometry).
 *
 * A FIXED COLUMN WIDTH, so the marks line up vertically down the ribbon and
 * the labels centre under them. Without it "Geometry" and "Modal" set their
 * own widths and the row of icons goes ragged — the difference between a
 * ribbon and a row of buttons that happen to have pictures.
 *
 * 76 px, MEASURED. At the first guess of 62 the content box was 54 and four
 * of the sixteen labels overflowed it — "Properties" wanting 62, "Geometry"
 * and "Nonlinear" 58, "Pushover" 55 — so the ribbon shipped reading
 * "Geome…  Proper…". 76 gives a 68 px content box, 6 px clear of the widest
 * word. `truncate` stays as the graceful failure for a future label or a
 * wider fallback font; it should never actually fire, and the readings above
 * are what say so.
 */
export function TabBtn({ id, label, active, onClick }: { id: Tab; label: string; active: boolean; onClick: (t: Tab) => void }) {
  return (
    <button type="button" onClick={() => onClick(id)} aria-current={active ? 'page' : undefined}
      className={`flex w-[76px] flex-col items-center gap-1 rounded-[5px] px-1 py-1.5 text-[10.5px] font-semibold leading-tight transition ${
        active ? 'bg-brand text-on-solid' : 'text-muted hover:bg-brand-tint hover:text-ink'}`}>
      <DrawnIcon icon={ribbonIcon(id)} size={20} />
      <span className="w-full truncate text-center">{label}</span>
    </button>
  )
}

/** Pass/fail pill for a schedule title — "all passed" (green) or "n failed"
 *  (red). `items` are the rows, `ok` maps a row to its verdict. */

/** Pass/fail pill for a schedule title — "all passed" (green) or "n failed"
 *  (red). `items` are the rows, `ok` maps a row to its verdict. */
export function SchedChip<T>({ items, ok }: { items: T[]; ok: (r: T) => boolean }) {
  const failed = items.reduce((n, r) => n + (ok(r) ? 0 : 1), 0)
  const good = failed === 0
  return (
    <span className={`ml-2 inline-block rounded px-1.5 py-px align-middle font-mono text-[10px] font-semibold ${
      good ? 'bg-ok-tint text-ok' : 'bg-fail-tint text-fail'}`}>
      {good ? 'all passed' : `${failed} failed`}
    </span>
  )
}

/** §424.2 computed service deflection for one beam, integrated from its own
 *  D-only / L-only moment diagrams. Shown once per member in the accordion (and
 *  therefore in the printed report, which force-expands every row). */
