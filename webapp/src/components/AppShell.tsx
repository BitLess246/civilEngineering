import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { SIDEBAR_GROUPS, ALL_TOOLS } from '../lib/tools'
import { loadCollapsed, saveCollapsed, toggleCollapsed } from '../lib/navCollapse'
import { useToolPrefs } from '../lib/useToolPrefs'
import { visibleGroups } from '../lib/toolPrefs'
import { CommandPalette } from './CommandPalette'
import { usePaletteHotkey } from '../lib/usePaletteHotkey'
import { isEmbedLocation } from '../lib/embed'
import { SiteFooter } from './SiteFooter'
import { AccountMenu } from './AccountMenu'
import { BRAND_MARK, BRAND_TAIL } from '../lib/brand'
import { TrialGate } from './TrialGate'
import { ErrorBoundary } from './ErrorBoundary'
import { watchScrollableRegions } from '../lib/scrollableRegions'
import { titleFor } from '../lib/documentTitle'

// Workbench shell (docs/design/uiux-2026-07): persistent ink-navy sidebar with
// the grouped tool catalog + ⌘K search, and a slim breadcrumb header. Wraps
// every tool route; the home page keeps its own hero navigation. Groups not
// holding the active tool collapse to their first two entries. Hidden in print.

function SearchBox({ onOpen, compact }: { onOpen: () => void; compact?: boolean }) {
  return (
    <button type="button" onClick={onOpen}
      className={`flex w-full items-center gap-2 rounded-md border border-white/15 bg-sheet/5 px-2.5 text-left hover:border-white/30 ${compact ? 'py-1.5' : 'py-[7px]'}`}>
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#7d8ea3" strokeWidth="2.4" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" /></svg>
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

function Sidebar({ onOpenPalette }: { onOpenPalette: () => void }) {
  const { pathname } = useLocation()
  // Lazy initialiser: localStorage is read once on mount, not on every render.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => loadCollapsed())

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

  // A collapsed group is NOT force-opened when you navigate into it. Doing that
  // means the user's explicit collapse is silently undone by an ordinary
  // navigation, and it has to be re-done every time. Instead the header marks
  // itself (dot + lit label) when it holds the active route, so a shut group
  // never hides where you are — which was the only reason to force it open.
  const toggle = (label: string) => setCollapsed((c) => {
    const next = toggleCollapsed(c, label)
    saveCollapsed(next)
    return next
  })

  return (
    <aside className="no-print sticky top-0 hidden h-screen w-[230px] flex-none flex-col overflow-y-auto bg-rail text-rail-ink lg:flex">
      <div className="border-b border-white/10 p-4 pb-3.5">
        <Link to="/" className="flex items-baseline gap-2">
          <span className="text-[15px] font-extrabold tracking-[.14em] text-rail-ink">{BRAND_MARK}</span>
          <span className="text-[9px] font-semibold uppercase tracking-[.22em] text-rail-muted">{BRAND_TAIL}</span>
        </Link>
        <div className="mt-3"><SearchBox onOpen={onOpenPalette} compact /></div>
      </div>
      <nav className="flex-1 px-2.5 pb-4 pt-1">
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
                className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left hover:bg-sheet/5">
                <span className={open ? 'text-rail-muted' : 'text-rail-muted'}><Caret open={open} /></span>
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
                    return (
                      <Link key={t.to + t.name} to={t.to}
                        aria-current={active ? 'page' : undefined}
                        className={`flex items-center gap-2 rounded-md border-l-2 px-2 py-1.5 text-[12.5px] font-medium ${
                          active ? 'border-rail-accent bg-brand/55 text-on-solid' : 'border-transparent text-rail-muted hover:bg-sheet/5 hover:text-on-solid'}`}>
                        {t.name}
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

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname, search } = useLocation()
  const [palette, setPalette] = useState(false)
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
      <a href="#content"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-3 focus-visible:top-3 focus-visible:z-[100] focus-visible:rounded-md focus-visible:bg-brand focus-visible:px-3.5 focus-visible:py-2 focus-visible:text-[13px] focus-visible:font-semibold focus-visible:text-on-solid">
        Skip to content
      </a>
      <Sidebar onOpenPalette={() => setPalette(true)} />
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
            <Link to="/" className="flex items-baseline gap-1.5 lg:hidden">
              <span className="text-[13px] font-extrabold tracking-[.14em] text-ink">{BRAND_MARK}</span>
            </Link>
            <div className="flex min-w-0 items-center gap-2 text-[11px] text-faint">
              <Link to="/" className="hover:text-brand">Workbench</Link>
              {tool && (<>
                <span>/</span><span>{tool.groupLabel}</span>
                <span>/</span><span className="truncate font-semibold text-ink">{tool.name}</span>
                <span className="ml-1 hidden rounded border border-brand-line bg-brand-tint px-1.5 py-px font-mono text-[9.5px] font-medium text-brand sm:inline">{tool.sub}</span>
              </>)}
            </div>
            <div className="ml-auto flex items-center gap-2.5">
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
      {palette && <CommandPalette onClose={() => setPalette(false)} />}
    </div>
  )
}
