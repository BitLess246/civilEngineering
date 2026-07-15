import { useMemo, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { SIDEBAR_GROUPS, ALL_TOOLS } from '../lib/tools'
import { CommandPalette, usePaletteHotkey } from './CommandPalette'

// Workbench shell (docs/design/uiux-2026-07): persistent ink-navy sidebar with
// the grouped tool catalog + ⌘K search, and a slim breadcrumb header. Wraps
// every tool route; the home page keeps its own hero navigation. Groups not
// holding the active tool collapse to their first two entries. Hidden in print.

function SearchBox({ onOpen, compact }: { onOpen: () => void; compact?: boolean }) {
  return (
    <button type="button" onClick={onOpen}
      className={`flex w-full items-center gap-2 rounded-md border border-white/15 bg-white/5 px-2.5 text-left hover:border-white/30 ${compact ? 'py-1.5' : 'py-[7px]'}`}>
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#7d8ea3" strokeWidth="2.4" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" /></svg>
      <span className="flex-1 text-xs text-[#7d8ea3]">Find a tool…</span>
      <span className="rounded border border-white/15 px-1 py-px font-mono text-[10px] text-[#7d8ea3]">⌘K</span>
    </button>
  )
}

function Sidebar({ onOpenPalette }: { onOpenPalette: () => void }) {
  const { pathname } = useLocation()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  return (
    <aside className="no-print sticky top-0 hidden h-screen w-[230px] flex-none flex-col overflow-y-auto bg-[#0f1b2a] text-[#e8eaed] lg:flex">
      <div className="border-b border-white/10 p-4 pb-3.5">
        <Link to="/" className="flex items-baseline gap-2">
          <span className="text-[15px] font-extrabold tracking-[.14em] text-white">CIVENG</span>
          <span className="text-[9px] font-semibold uppercase tracking-[.22em] text-[#7d8ea3]">Toolkit</span>
        </Link>
        <div className="mt-3"><SearchBox onOpen={onOpenPalette} compact /></div>
      </div>
      <nav className="flex-1 px-2.5 pb-4 pt-1">
        {SIDEBAR_GROUPS.map((g) => {
          const isActiveGroup = g.tools.some((t) => t.to === pathname)
          const open = isActiveGroup || g.tools.length <= 3 || expanded.has(g.label)
          const shown = open ? g.tools : g.tools.slice(0, 2)
          return (
            <div key={g.label} className="mt-3">
              <div className="flex items-baseline justify-between px-2 pb-1">
                <span className="text-[9.5px] font-bold uppercase tracking-[.18em] text-[#7d8ea3]">{g.label}</span>
                <span className="font-mono text-[9.5px] text-[#55677c]">{String(g.tools.length).padStart(2, '0')}</span>
              </div>
              {shown.map((t) => {
                const active = t.to === pathname
                return (
                  <Link key={t.to + t.name} to={t.to}
                    className={`flex items-center gap-2 rounded-md border-l-2 px-2 py-1.5 text-[12.5px] font-medium ${
                      active ? 'border-[#5b9bd5] bg-[#0f4c92]/55 text-white' : 'border-transparent text-[#b6c2d0] hover:bg-white/5 hover:text-white'}`}>
                    {t.name}
                  </Link>
                )
              })}
              {shown.length < g.tools.length && (
                <button type="button" onClick={() => setExpanded((s) => new Set(s).add(g.label))}
                  className="px-2 pt-1 text-[11px] text-[#55677c] hover:text-[#9db0c5]">▸ {g.tools.length - shown.length} more</button>
              )}
            </div>
          )
        })}
      </nav>
      <div className="border-t border-white/10 p-4 text-[10.5px] leading-relaxed text-[#55677c]">
        NSCP 2015 · ACI 318-14<br />AISC 360-16 · client-side engine
      </div>
    </aside>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const [palette, setPalette] = useState(false)
  usePaletteHotkey(setPalette)
  const tool = useMemo(() => ALL_TOOLS.find((t) => t.to === pathname), [pathname])

  return (
    <div className="flex min-h-screen bg-[#f4f3ef]">
      <Sidebar onOpenPalette={() => setPalette(true)} />
      <div className="min-w-0 flex-1">
        <header className="no-print sticky top-0 z-40 border-b border-[#e3e1da] bg-white/95 backdrop-blur">
          <div className="flex h-11 items-center gap-3 px-4 sm:px-6">
            <Link to="/" className="flex items-baseline gap-1.5 lg:hidden">
              <span className="text-[13px] font-extrabold tracking-[.14em] text-[#0f1b2a]">CIVENG</span>
            </Link>
            <div className="flex min-w-0 items-center gap-2 text-[11px] text-[#7a7568]">
              <Link to="/" className="hover:text-[#0f4c92]">Workbench</Link>
              {tool && (<>
                <span>/</span><span>{tool.groupLabel}</span>
                <span>/</span><span className="truncate font-semibold text-[#0f1b2a]">{tool.name}</span>
                <span className="ml-1 hidden rounded border border-[#cddcf0] bg-[#eaf1f9] px-1.5 py-px font-mono text-[9.5px] font-medium text-[#0f4c92] sm:inline">{tool.sub}</span>
              </>)}
            </div>
            <button type="button" onClick={() => setPalette(true)}
              className="ml-auto flex items-center gap-2 rounded-md border border-[#d6d3c9] bg-[#fcfbf8] px-2.5 py-1 text-xs text-[#8b8574] hover:border-[#0f4c92] hover:text-[#0f4c92]">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" /></svg>
              <span className="hidden sm:inline">Find a tool</span>
              <span className="rounded border border-[#d6d3c9] px-1 py-px font-mono text-[9.5px]">⌘K</span>
            </button>
          </div>
        </header>
        {children}
      </div>
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </div>
  )
}
