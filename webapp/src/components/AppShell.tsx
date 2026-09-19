import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { SIDEBAR_GROUPS, ALL_TOOLS, isGatedRoute } from '../lib/tools'
import { loadCollapsed, saveCollapsed, toggleCollapsed } from '../lib/navCollapse'
import { loadRailCollapsed, saveRailCollapsed, RAIL_W } from '../lib/navRail'
import { iconFor, ICON_VIEWBOX, ICON_STROKE } from '../lib/toolGroupIcons'
import { useToolPrefs } from '../lib/useToolPrefs'
import { visibleGroups } from '../lib/toolPrefs'
import { CommandPalette } from './CommandPalette'
import { usePaletteHotkey } from '../lib/usePaletteHotkey'
import { isEmbedLocation } from '../lib/embed'
import { SiteFooter } from './SiteFooter'
import { AccountMenu } from './AccountMenu'
import { BRAND_MARK, BRAND_TAIL, BRAND_MONOGRAM } from '../lib/brand'
import { TrialGate } from './TrialGate'
import { ErrorBoundary } from './ErrorBoundary'
import { watchScrollableRegions } from '../lib/scrollableRegions'
import { titleFor } from '../lib/documentTitle'
import { useFocusTrap } from '../lib/useFocusTrap'
import { THEMES } from '../lib/theme'
import { setTheme, useTheme } from '../lib/useTheme'

// Workbench shell (docs/design/uiux-2026-07): persistent ink-navy sidebar with
// the grouped tool catalog + ⌘K search, and a slim breadcrumb header. Wraps
// every tool route; the home page keeps its own hero navigation. Groups not
// holding the active tool collapse to their first two entries. Hidden in print.

/** Shared skip link — one markup for both shells, so keyboard entry never drifts. */
export function SkipLink() {
  return (
    <a href="#content"
      className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-3 focus-visible:top-3 focus-visible:z-[100] focus-visible:rounded-md focus-visible:bg-brand focus-visible:px-3.5 focus-visible:py-2 focus-visible:text-[13px] focus-visible:font-semibold focus-visible:text-on-solid">
      Skip to content
    </a>
  )
}

function SearchBox({ onOpen, compact }: { onOpen: () => void; compact?: boolean }) {
  return (
    <button type="button" onClick={onOpen}
      className={`flex w-full items-center gap-2 rounded-md border border-white/15 bg-sheet/5 px-2.5 text-left hover:border-white/30 ${compact ? 'py-1.5' : 'py-[7px]'}`}>
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" /></svg>
      <span className="flex-1 text-xs text-rail-muted">Find a tool…</span>
      <span className="rounded border border-white/15 px-1 py-px font-mono text-[10px] text-rail-muted">⌘K</span>
    </button>
  )
}

/** Chevron for a group header. Rotates rather than swapping glyphs, so the
 *  open and closed states are visibly the same control. */
function Caret({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor"
      strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      className={`transition-transform duration-150 ${open ? 'rotate-90' : ''}`}>
      <polyline points="9 6 15 12 9 18" />
    </svg>
  )
}

/**
 * A group's drawn mark.
 *
 * One component for both states of the sidebar, and one stroke weight for the
 * whole set — passing a size rather than swapping icons is what keeps the
 * collapsed rail and the expanded list recognisably the same navigation.
 * `vectorEffect` holds the stroke at 1.6 px however the box is scaled; without
 * it the 16 px header icon draws visibly lighter than the 22 px rail icon and
 * the set stops looking like a set.
 */
function GroupIcon({ label, size = 16 }: { label: string; size?: number }) {
  const icon = iconFor(label)
  if (!icon) return <span style={{ width: size, height: size }} aria-hidden="true" />
  return (
    <svg viewBox={ICON_VIEWBOX} width={size} height={size} aria-hidden="true"
      fill="none" stroke="currentColor" strokeWidth={ICON_STROKE}
      strokeLinecap="round" strokeLinejoin="round" className="flex-none">
      {icon.paths.map((d, i) => <path key={i} d={d} vectorEffect="non-scaling-stroke" />)}
      {(icon.dots ?? []).map((c, i) => (
        <circle key={`d${i}`} cx={c.cx} cy={c.cy} r={c.r} fill="currentColor" stroke="none" />
      ))}
    </svg>
  )
}

/**
 * One group in the COLLAPSED rail: its mark, and a flyout holding its tools.
 *
 * The flyout is the whole reason the rail is usable. Collapsing to icons and
 * making every navigation cost an expand-first would be a worse sidebar that
 * happens to be narrower; here all 53 tools stay one gesture away.
 *
 * Opened by hover AND by focus, because a rail reachable only by pointer is a
 * rail keyboard users cannot navigate. Escape closes and returns focus to the
 * icon, and the panel is only MOUNTED while open so its links are never in the
 * tab order of a closed group — the same rule the expanded list already
 * follows for a collapsed group.
 */
function RailGroup({ group, activeGroup, pathname, onNavigate }: {
  group: { label: string; tools: { to: string; name: string; sub: string }[] }
  activeGroup?: string
  pathname: string
  onNavigate?: () => void
}) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  // WHERE the flyout goes, in viewport coordinates.
  //
  // It is `position: fixed`, not `absolute`, and that is not a detail: the rail
  // is a scroll container, and a box with `overflow-y: auto` computes its
  // `overflow-x` as `auto` too however you write it — so an absolutely
  // positioned flyout is CLIPPED at the rail's 60 px edge. The element is still
  // at the right coordinates, so `getBoundingClientRect` reports it visible and
  // a DOM probe passes; only a screenshot shows the empty rail. A fixed element
  // is positioned against the viewport instead and escapes the clip.
  const [at, setAt] = useState<{ left: number; top: number } | null>(null)
  const panel = useRef<HTMLDivElement>(null)
  const place = () => {
    const r = btn.current?.getBoundingClientRect()
    if (r) setAt({ left: r.right + 6, top: r.top })
  }
  const show = () => { place(); setOpen(true) }

  // CLAMP THE PANEL INTO THE VIEWPORT, measured rather than estimated.
  //
  // Aligning the flyout with its icon is right until the icon is near the
  // bottom: on a 620 px window the last group's panel ran 81 px below the
  // fold, with no way to reach half its tools. Measured on the rendered panel
  // because its height is its tool count — Concrete is eleven rows and Timber
  // is one — so any constant here would be wrong for one of them.
  useLayoutEffect(() => {
    if (!open || !at) return
    const el = panel.current
    if (!el) return
    const h = el.offsetHeight
    const max = window.innerHeight - 8
    const want = at.top + h > max ? Math.max(8, max - h) : at.top
    if (Math.abs(want - at.top) > 0.5) setAt({ left: at.left, top: want })
  }, [open, at])
  const holdsActive = group.label === activeGroup
  const panelId = `rail-${group.label.replace(/\W+/g, '-').toLowerCase()}`

  // Closing on blur-out rather than on mouseleave alone: a keyboard user tabs
  // THROUGH the flyout's links, and a pointer-only close would shut the panel
  // under them on the first Tab.
  const onBlur = (e: React.FocusEvent) => {
    if (!wrap.current?.contains(e.relatedTarget as Node | null)) setOpen(false)
  }

  // THE FLYOUT HAD TO BE CAUGHT BEFORE IT COULD BE REACHED.
  //
  // `place()` puts the panel at `btn.right + 6`, and the panel is `position:
  // fixed` — detached from the 44 px icon it hangs off. `mouseleave` respects
  // DOM containment, so moving from icon to panel would be safe if the pointer
  // went straight there; it does not. It crosses those 6 px of RAIL, which is
  // not a descendant of this wrapper, `mouseleave` fires, and the panel
  // unmounts under a pointer that was on its way to it. A fast diagonal makes
  // it worse: the browser samples the path, so a quick flick can leave the
  // wrapper without ever reporting a point inside the panel.
  //
  // Closing on a short delay is the fix rather than closing the gap, because
  // zero gap still leaves the two boxes merely ADJACENT — a sub-pixel seam or
  // one skipped sample re-opens the same hole. The timer is cancelled by
  // re-entering either box, so the panel survives the crossing and still shuts
  // the moment the pointer genuinely leaves.
  const closeAt = useRef<number | null>(null)
  const cancelClose = () => {
    if (closeAt.current !== null) { window.clearTimeout(closeAt.current); closeAt.current = null }
  }
  const armClose = () => {
    cancelClose()
    // 300ms grace: 180ms punished fast diagonal travel and touch re-taps.
    closeAt.current = window.setTimeout(() => { closeAt.current = null; setOpen(false) }, 300)
  }
  const enter = () => { cancelClose(); show() }
  // A pending close must never outlive the component, or it fires `setOpen` on
  // an unmounted node the first time the rail is collapsed with one open.
  useEffect(() => cancelClose, [])

  return (
    <div ref={wrap} className="relative"
      onMouseEnter={enter} onMouseLeave={armClose}
      onFocus={show} onBlur={onBlur}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) { e.stopPropagation(); cancelClose(); setOpen(false); btn.current?.focus() }
      }}>
      <button ref={btn} type="button" aria-expanded={open} aria-controls={panelId}
        aria-label={`${group.label} — ${group.tools.length} tool${group.tools.length === 1 ? '' : 's'}`}
        title={group.label}
        onClick={() => { if (!open) place(); setOpen((v) => !v) }}
        className={`relative flex h-11 w-11 flex-col items-center justify-center gap-0.5 rounded-md transition-colors ${
          holdsActive ? 'bg-brand text-on-solid' : 'text-rail-muted hover:bg-sheet/10 hover:text-rail-ink'}`}>
        <GroupIcon label={group.label} size={20} />
        <span className="w-full truncate px-0.5 text-center text-[7.5px] font-semibold uppercase leading-none tracking-wide" aria-hidden="true">{group.label}</span>
      </button>
      {open && at && (
        <div ref={panel} id={panelId} role="group" aria-label={group.label} data-rail-flyout
          onMouseEnter={cancelClose} onMouseLeave={armClose}
          style={{ left: at.left, top: at.top }}
          className="fixed z-30 w-[210px] rounded-md border border-white/10 bg-rail py-1.5 shadow-xl">
          <p className="px-2.5 pb-1 text-[9.5px] font-bold uppercase tracking-[.18em] text-rail-muted">
            {group.label}
          </p>
          {group.tools.map((t) => {
            const active = t.to === pathname
            return (
              <Link key={t.to + t.name} to={t.to}
                onClick={() => { setOpen(false); onNavigate?.() }}
                aria-current={active ? 'page' : undefined}
                className={`block px-2.5 py-1.5 text-[12.5px] font-medium ${
                  active ? 'bg-brand text-on-solid' : 'text-rail-muted hover:bg-sheet/10 hover:text-rail-ink'}`}>
                {t.name}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** The collapse control. One button, one meaning, labelled for what it will
 *  DO rather than for the state it is in — "Collapse" while wide, "Expand"
 *  while narrow, which is the only wording that stays true after the click. */
function RailToggle({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle}
      aria-label={collapsed ? 'Expand the sidebar' : 'Collapse the sidebar to icons'}
      title={collapsed ? 'Expand the sidebar' : 'Collapse the sidebar to icons'}
      className="flex h-8 w-8 flex-none items-center justify-center rounded-md text-rail-muted hover:bg-sheet/10 hover:text-rail-ink">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
        strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {/* The panel edge, and the direction it will move. Not a hamburger:
            this control does not open a menu. */}
        <path d="M4 4.5V19.5" />
        <path d="M9 12H20" />
        <path d={collapsed ? 'M16 8L20 12L16 16' : 'M13 8L9 12L13 16'} />
      </svg>
    </button>
  )
}

/**
 * The tool navigation. ONE component for both the desktop rail and the mobile
 * drawer — the alternative is two lists that drift, and this one is 53 tools
 * in 12 collapsible groups with an active-route marker.
 *
 * `onNavigate` lets the drawer close itself when a tool is chosen; the desktop
 * rail passes nothing, because nothing is covering the content there.
 *
 * `trailing` sits at the end of the brand row. The drawer puts its close button
 * there rather than above its own second wordmark: reusing this component and
 * then adding a header of your own paints the brand twice, which is what the
 * first cut of the drawer did.
 */
function Sidebar({ onOpenPalette, onNavigate, className, trailing, railable = false }: {
  onOpenPalette: () => void; onNavigate?: () => void; className?: string; trailing?: ReactNode
  /** May this instance collapse to the icon rail? The DESKTOP rail may; the
   *  mobile DRAWER may not — it is already an overlay you opened on purpose,
   *  and shrinking it to icons inside its own sheet buys nothing and costs the
   *  tool names. */
  railable?: boolean
}) {
  const { pathname } = useLocation()
  // Lazy initialiser: localStorage is read once on mount, not on every render.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => loadCollapsed())
  const [rail, setRail] = useState(() => railable && loadRailCollapsed())
  const toggleRail = () => setRail((v) => { saveRailCollapsed(!v); return !v })

  // Trimmed to the disciplines this browser chose. `activeGroup` is still
  // resolved against the FULL catalog, not the trimmed list: the tool you are
  // on may belong to a group you have hidden — you reached it by link or by
  // ⌘K — and the breadcrumb and the marker should still name it correctly.
  const prefs = useToolPrefs()
  const groups = useMemo(() => visibleGroups(SIDEBAR_GROUPS, prefs), [prefs])
  const activeGroup = useMemo(
    () => SIDEBAR_GROUPS.find((g) => g.tools.some((t) => t.to === pathname))?.label,
    [pathname],
  )
  // Standing on a tool whose group is hidden. Saying so beats a sidebar that
  // silently does not contain the page you are looking at.
  const activeIsHidden = !!activeGroup && !groups.some((g) => g.label === activeGroup)

  // A collapsed group opens when you navigate into it. An explicit collapse is
  // a standing instruction for browsing, not a blindfold for wayfinding — the
  // active tool must be visible, not a dot inside a shut group.
  useEffect(() => {
    if (!activeGroup) return
    setCollapsed((c) => {
      if (!c.has(activeGroup)) return c
      const next = toggleCollapsed(c, activeGroup)
      saveCollapsed(next)
      return next
    })
  }, [activeGroup])
  const toggle = (label: string) => setCollapsed((c) => {
    const next = toggleCollapsed(c, label)
    saveCollapsed(next)
    return next
  })

  // THE COLLAPSED RAIL. A separate branch rather than a pile of conditional
  // classes on the expanded markup: the two states share no structure worth
  // reusing — one is a list of named links in collapsible groups, the other is
  // eleven targets with flyouts — and pretending otherwise produces markup
  // where neither state is readable.
  if (rail) {
    return (
      <aside style={{ width: RAIL_W }}
        className="no-print sticky top-0 hidden h-screen flex-none flex-col items-center overflow-y-auto overflow-x-visible bg-rail text-rail-ink lg:flex">
        <div className="flex w-full flex-col items-center gap-1 border-b border-white/10 py-3">
          <Link to="/" onClick={onNavigate} aria-label="Home"
            className="flex h-9 w-9 items-center justify-center rounded-md text-[13px] font-extrabold tracking-[.02em] text-rail-ink hover:bg-sheet/10">
            {BRAND_MONOGRAM}
          </Link>
          <button type="button" onClick={onOpenPalette} aria-label="Find a tool (⌘K)" title="Find a tool  ⌘K"
            className="flex h-9 w-9 items-center justify-center rounded-md text-rail-muted hover:bg-sheet/10 hover:text-rail-ink">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
              strokeWidth={ICON_STROKE} strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" /><path d="M21 21L16.5 16.5" />
            </svg>
          </button>
        </div>
        <nav aria-label="Tools" className="flex flex-1 flex-col items-center gap-1 py-2">
          {groups.map((g) => (
            <RailGroup key={g.label} group={g} activeGroup={activeGroup}
              pathname={pathname} onNavigate={onNavigate} />
          ))}
        </nav>
        <div className="w-full border-t border-white/10 py-2">
          <div className="flex justify-center"><RailToggle collapsed onToggle={toggleRail} /></div>
        </div>
      </aside>
    )
  }

  return (
    <aside className={className ?? 'no-print sticky top-0 hidden h-screen w-[230px] flex-none flex-col overflow-y-auto bg-rail text-rail-ink lg:flex'}>
      <div className="border-b border-white/10 p-4 pb-3.5">
        <div className="flex items-center justify-between gap-2">
          <Link to="/" onClick={onNavigate} className="flex items-baseline gap-2 py-1">
            <span className="text-[15px] font-extrabold tracking-[.14em] text-rail-ink">{BRAND_MARK}</span>
            <span className="text-[9px] font-semibold uppercase tracking-[.22em] text-rail-muted">{BRAND_TAIL}</span>
          </Link>
          {railable && <RailToggle collapsed={false} onToggle={toggleRail} />}
          {trailing}
        </div>
        <div className="mt-3"><SearchBox onOpen={onOpenPalette} compact /></div>
      </div>
      <nav aria-label="Tools" className="flex-1 px-2.5 pb-4 pt-1">
        {activeIsHidden && (
          <div className="mt-3 rounded-md border border-white/10 bg-sheet/[.04] px-2.5 py-2">
            <p className="text-[11px] leading-relaxed text-rail-muted">
              You are in <span className="font-semibold text-rail-ink">{activeGroup}</span>, which is
              hidden by your preferences.
            </p>
            <Link to="/profile" className="mt-1 inline-block text-[11px] font-semibold text-rail-accent hover:underline">
              Show it again →
            </Link>
          </div>
        )}
        {groups.map((g) => {
          const open = !collapsed.has(g.label)
          const panelId = `navgroup-${g.label.replace(/\W+/g, '-').toLowerCase()}`
          // A collapsed group still marks itself when it holds the active
          // route, so a shut group never hides the fact that you are inside it.
          const holdsActive = g.label === activeGroup
          return (
            <div key={g.label} className="mt-3">
              <button type="button" onClick={() => toggle(g.label)}
                aria-expanded={open} aria-controls={panelId}
                className="flex min-h-[36px] w-full items-center gap-1.5 rounded-md px-2 py-1 text-left hover:bg-sheet/5 lg:min-h-0">
                <span className={open ? 'text-rail-muted' : 'text-rail-muted'}><Caret open={open} /></span>
                {/* SAME MARK, SAME PLACE, both states. It is what makes the
                    collapse legible: the rail is this row with the words
                    taken away, not a different navigation. */}
                <span className={holdsActive ? 'text-rail-ink' : 'text-rail-muted'}>
                  <GroupIcon label={g.label} size={15} />
                </span>
                <span className={`text-[9.5px] font-bold uppercase tracking-[.18em] ${
                  holdsActive ? 'text-rail-muted' : 'text-rail-muted'}`}>{g.label}</span>
                {!open && holdsActive && (
                  <span className="h-1 w-1 rounded-full bg-rail-accent" aria-hidden="true" />
                )}
                <span className="ml-auto font-mono text-[9.5px] text-rail-muted">{String(g.tools.length).padStart(2, '0')}</span>
              </button>
              {/* Unmounted rather than hidden with CSS: a collapsed group's
                  links must not stay in the tab order or be read out. */}
              {open && (
                <div id={panelId}>
                  {g.tools.map((t) => {
                    const active = t.to === pathname
                    const gated = isGatedRoute(t.to)
                    return (
                      <Link key={t.to + t.name} to={t.to} onClick={onNavigate}
                        aria-current={active ? 'page' : undefined}
                        /* The active row is already a full brand fill; the
                           2 px accent border it used to carry on top of that
                           marked nothing the fill did not, and a thick coloured
                           side border is the most recognisable tell of a
                           generated UI. Flagged by the Impeccable detector on a
                           line this PR was touching anyway. */
                        className={`flex min-h-[44px] items-center gap-2 rounded-md px-2 py-1.5 text-[13.5px] font-medium lg:min-h-0 lg:text-[12.5px] ${
                          active ? 'bg-brand text-on-solid' : 'text-rail-muted hover:bg-sheet/5 hover:text-on-solid'}`}>
                        <span className="min-w-0 flex-1 truncate">{t.name}</span>
                        {gated && !active && (
                          <span className="flex-none font-mono text-[9px] uppercase tracking-wider opacity-70"
                            title="Needs an account — sign in to open">Sign in</span>
                        )}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>
      <div className="border-t border-white/10 p-4 text-[10.5px] leading-relaxed text-rail-muted">
        NSCP 2015 · ACI 318-14<br />AISC 360-16 · client-side engine
      </div>
    </aside>
  )
}


/**
 * Tool navigation below `lg`.
 *
 * Nothing reached the 53 tools on a phone: the rail is `hidden lg:flex` with no
 * hamburger and no drawer, so the only route between them was a 63×27px
 * unlabelled magnifier that opens a type-to-search palette. Search is not
 * browsing — it answers "where is the tool I can already name", which is the
 * one question a first-time visitor cannot ask.
 *
 * Focus is trapped (see `useFocusTrap`) because this is an `aria-modal`
 * overlay and the app already ships seven that are not — adding an eighth
 * would be choosing the bug.
 */
function NavDrawer({ open, onClose, onOpenPalette }: {
  open: boolean; onClose: () => void; onOpenPalette: () => void
}) {
  const panel = useRef<HTMLDivElement>(null)
  useFocusTrap(panel, open, onClose)

  // The page behind must not scroll under the drawer.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  if (!open) return null
  return (
    <div className="no-print fixed inset-0 z-[90] lg:hidden">
      <button type="button" aria-label="Close navigation" onClick={onClose}
        className="absolute inset-0 bg-ink/60" />
      <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Tool navigation"
        id="nav-drawer"
        className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col bg-rail text-rail-ink shadow-2xl outline-none">
        {/* Discipline jump-links: the drawer is the only mobile catalog, so a
            first-timer gets browsing, not just search. */}
        <nav aria-label="Disciplines" className="flex flex-none gap-1 overflow-x-auto border-b border-white/10 px-2.5 py-2">
          {SIDEBAR_GROUPS.map((g) => (
            <button key={g.label} type="button"
              onClick={() => document.getElementById(`navgroup-${g.label.replace(/\W+/g, '-').toLowerCase()}`)?.scrollIntoView({ block: 'start' })}
              className="flex-none rounded-md px-2 py-2 text-[11px] font-semibold text-rail-muted hover:bg-sheet/10 hover:text-rail-ink">
              {g.label}
            </button>
          ))}
        </nav>
        <Sidebar onOpenPalette={() => { onClose(); onOpenPalette() }} onNavigate={onClose}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-rail text-rail-ink"
          trailing={(
            <button type="button" onClick={onClose} aria-label="Close navigation"
              className="-mr-1.5 flex h-11 w-11 flex-none items-center justify-center rounded-md text-rail-muted hover:bg-sheet/10 hover:text-rail-ink">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>
            </button>
          )} />
      </div>
    </div>
  )
}

/** Theme picker — five shipped themes, keyboard-native. Shared by the workbench
 *  header and the landing nav so theming is a user feature in both shells. */
export function ThemeSwitch() {
  const theme = useTheme()
  return (
    <label className="hidden items-center gap-1.5 text-[11px] text-faint md:flex">
      <span className="sr-only">Theme</span>
      <select value={theme} onChange={(e) => setTheme(e.target.value as typeof theme)}
        aria-label="Theme"
        className="h-7 rounded-md border border-field-line bg-field px-1.5 text-[11px] text-muted hover:border-brand-hover hover:text-brand">
        {THEMES.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
    </label>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname, search } = useLocation()
  const [palette, setPalette] = useState(false)
  const [nav, setNav] = useState(false)
  /**
   * ?embed=1 — Model Space is being iframed into the landing page as a
   * scaled-down preview of itself. The page stays fully DRAWN (the preview is
   * meant to read as the page, not a crop of it), but the shell goes inert:
   * the pointer lock sits here, above the tool content, and only <main> —
   * where the page re-enables its walkthrough and 3D viewport — takes pointer
   * events again. A sidebar link clicked inside a poster would navigate the
   * iframe to a place the marketing page never promised, and a command
   * palette summoned over it answers a hotkey that was aimed at the page the
   * poster lives on. Both are the same rule: in embed the shell is scenery.
   */
  const embed = useMemo(() => isEmbedLocation({ pathname, search }), [pathname, search])
  usePaletteHotkey(setPalette, !embed)
  // Name the tab. One hard-coded <title> served all 53 routes, so tabs,
  // bookmarks and history were indistinguishable — and a screen reader
  // announced the same page name on arrival everywhere.
  useEffect(() => { document.title = titleFor(pathname) }, [pathname])
  // A drawer left open across a route change covers the page you just chose.
  // Every control INSIDE it already closes it; what it cannot see is a route
  // change it did not cause — the browser back button. Adjusted DURING render
  // (React's "adjusting state when a prop changes") rather than in an effect,
  // so the drawer is never painted once over the new page before closing.
  const [navRoute, setNavRoute] = useState(pathname)
  if (navRoute !== pathname) { setNavRoute(pathname); setNav(false) }

  // Wide tables become keyboard-scrollable when — and only when — they
  // actually overflow. See lib/scrollableRegions.ts for why this is measured
  // rather than declared at 84 call sites.
  useEffect(() => watchScrollableRegions(), [])

  const tool = useMemo(() => ALL_TOOLS.find((t) => t.to === pathname), [pathname])

  return (
    <div className="flex min-h-screen bg-paper" style={embed ? { pointerEvents: 'none' } : undefined}>
      {/* Skip link — the FIRST focusable element, so the keyboard route to the
          page is one Tab instead of 71. The sidebar lists 54 tools and 12 group
          toggles ahead of the content, and it is re-traversed on every
          navigation. Visually hidden until focused, then a real, visible
          control: a skip link nobody can see they have landed on is no better
          than none. */}
      <SkipLink />
      <Sidebar onOpenPalette={() => setPalette(true)} railable />
      {/* A COLUMN, so the footer can be pushed to the bottom.
          This div is stretched to the full height of a `min-h-screen` row, but
          its children stacked in normal block flow — so on any page shorter
          than the viewport (sign-in, a 404, a lazy page still loading) the
          footer rendered directly under the content with dead space beneath
          it, riding up the screen. As a column with the content region taking
          the slack, a short page puts the footer on the bottom edge and a long
          one pushes it below the fold, which is what a footer is for. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-40 border-b border-hairline bg-sheet/95 backdrop-blur">
          <div className="flex h-11 items-center gap-3 px-4 sm:px-6">
            {/* Hamburger — the only way to the 53 tools below `lg`. 44px square
                so it clears the touch-target floor. */}
            <button type="button" onClick={() => setNav(true)}
              aria-label="Open navigation" aria-expanded={nav} aria-controls="nav-drawer"
              className="-ml-1.5 flex h-11 w-11 flex-none items-center justify-center rounded-md text-muted hover:bg-brand-tint hover:text-brand lg:hidden">
              <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" /></svg>
            </button>
            <Link to="/" className="hidden min-h-[24px] items-baseline gap-1.5 sm:flex lg:hidden">
              <span className="text-[13px] font-extrabold tracking-[.14em] text-ink">{BRAND_MARK}</span>
            </Link>
            {/* `min-w-0 flex-1` is what lets the breadcrumb TRUNCATE. It had
                `min-w-0` but no `flex-1`, so it never shrank and the search pill
                painted over it — a measured 40px overlap at 390px. The action
                group is `flex-none` for the same reason, from the other side. */}
            <div className="flex min-w-0 flex-1 items-center gap-2 text-[11px] text-faint">
              <Link to="/" className="inline-flex min-h-[24px] flex-none items-center hover:text-brand">Toolkit</Link>
              {tool && (<>
                <span className="hidden sm:inline">/</span>
                <span className="hidden sm:inline">{tool.groupLabel}</span>
                <span>/</span><span className="truncate font-semibold text-ink">{tool.name}</span>
                <span className="ml-1 hidden rounded border border-brand-line bg-brand-tint px-1.5 py-px font-mono text-[9.5px] font-medium text-brand sm:inline">{tool.sub}</span>
              </>)}
            </div>
            <div className="ml-auto flex flex-none items-center gap-2.5">
            <ThemeSwitch />
            <button type="button" onClick={() => setPalette(true)}
              className="flex items-center gap-2 rounded-md border border-field-line bg-field px-2.5 py-1 text-xs text-faint hover:border-brand-hover hover:text-brand">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" /></svg>
              <span className="hidden sm:inline">Find a tool</span>
              <span className="rounded border border-field-line px-1 py-px font-mono text-[9.5px]">⌘K</span>
            </button>
            <AccountMenu />
            </div>
          </div>
        </header>
        {/* Every tool route renders through here, which is why the guest
            allowance is spent in ONE place rather than in twenty-eight route
            elements. TrialGate passes non-trial routes straight through.

            The boundary sits INSIDE the shell so a render failure keeps the
            sidebar and the header — a fallback the user cannot navigate away
            from is barely better than the blank page it replaced. Keying it on
            the location rebuilds it on every navigation, so one broken page
            does not poison the content area for the rest of the session. */}
        {/* `flex-1` is what absorbs the slack above the footer; `min-h-0`
            keeps a page that scrolls inside itself (Model Space) from being
            blown out by its own content. */}
        {/* The one region embed hands back to the visitor. The tool page
            inside re-applies its own narrower lock (Model Space leaves only
            the walkthrough and the viewport live), so this is the boundary of
            what the preview allows, not a bypass of it. */}
        <main id="content" className="min-h-0 flex-1" style={embed ? { pointerEvents: 'auto' } : undefined}>
          <ErrorBoundary key={pathname}>
            <TrialGate>{children}</TrialGate>
          </ErrorBoundary>
        </main>
        <SiteFooter />
      </div>
      <NavDrawer open={nav} onClose={() => setNav(false)} onOpenPalette={() => setPalette(true)} />
      {palette && <CommandPalette onClose={() => setPalette(false)} />}
    </div>
  )
}
