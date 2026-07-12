import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { TOOL_CATEGORIES, toolGroups, type ToolCategory, type ToolDef } from '../lib/tools'

// Flat, sharp-cornered top navigation. Tool calculators live in category
// dropdowns; auth actions sit on the right. Hidden in print via `no-print`.

function ToolLink({ t, onClose }: { t: ToolDef; onClose: () => void }) {
  return (
    <Link to={t.to} role="menuitem" onClick={onClose}
      className="group flex flex-col px-4 py-2 hover:bg-[#f4f8ff]">
      <span className="text-sm font-medium text-slate-800 group-hover:text-[#0056b3]">{t.name}</span>
      <span className="text-[10px] uppercase tracking-wider text-slate-500">{t.sub}</span>
    </Link>
  )
}

function Dropdown({ category, open, onToggle, onClose }: {
  category: ToolCategory
  open: boolean
  onToggle: () => void
  onClose: () => void
}) {
  const groups = toolGroups(category)
  const grouped = groups.some(g => g.group !== '')
  return (
    <div className="relative">
      <button onClick={onToggle} aria-haspopup="menu" aria-expanded={open}
        className={`flex h-11 items-center gap-1.5 px-3 text-xs font-semibold tracking-wide transition-colors ${
          open ? 'bg-white/10 text-white' : 'text-slate-300 hover:text-white'}`}>
        {category.label}
        <span aria-hidden className={`text-[8px] transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>
      {open && (
        <div role="menu" aria-label={category.label}
          className={`absolute left-0 top-11 z-50 max-h-[calc(100vh-3.5rem)] overflow-y-auto border border-slate-200 bg-white shadow-xl ${
            grouped ? 'grid w-[36rem] grid-cols-2 gap-x-2 p-2' : 'w-64'}`}>
          {grouped
            ? groups.map(g => (
                <div key={g.group} className="mb-2 break-inside-avoid">
                  <p className="px-4 pb-1 pt-2 text-[9px] font-bold uppercase tracking-[0.18em] text-[#0056b3]">{g.group}</p>
                  {g.tools.map(t => <ToolLink key={t.to} t={t} onClose={onClose} />)}
                </div>
              ))
            : category.tools.map(t => (
                <div key={t.to} className="border-b border-slate-100 last:border-0">
                  <ToolLink t={t} onClose={onClose} />
                </div>
              ))}
        </div>
      )}
    </div>
  )
}

export function Navbar({ onAuth }: { onAuth: (mode: 'login' | 'signup') => void }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const ref = useRef<HTMLElement>(null)

  // Close any open dropdown on outside click or Escape.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpenIdx(null)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpenIdx(null); setMobileOpen(false) } }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [])

  return (
    <nav ref={ref} className="no-print sticky top-0 z-50 border-b border-white/10 bg-black">
      <div className="flex h-11 items-center px-4 sm:px-5">
        <Link to="/" onClick={() => setOpenIdx(null)} className="flex items-center gap-2.5">
          <span className="text-[11px] font-black uppercase tracking-[0.2em] text-white">CivEng</span>
          <span className="hidden h-3.5 w-px bg-white/20 sm:block" />
          <span className="hidden text-[10px] tracking-wide text-slate-500 sm:block">Structural Toolkit</span>
        </Link>

        {/* Desktop dropdowns */}
        <div className="ml-6 hidden items-center md:flex">
          {TOOL_CATEGORIES.map((c, i) => (
            <Dropdown key={c.label} category={c}
              open={openIdx === i}
              onToggle={() => setOpenIdx(openIdx === i ? null : i)}
              onClose={() => setOpenIdx(null)} />
          ))}
          <span className="flex h-11 cursor-default items-center px-3 text-xs font-semibold tracking-wide text-slate-600">
            More <span className="ml-1.5 rounded-none bg-white/10 px-1 py-0.5 text-[8px] uppercase text-slate-400">soon</span>
          </span>
        </div>

        {/* Auth (desktop) */}
        <div className="ml-auto hidden items-center gap-2 md:flex">
          <button onClick={() => onAuth('login')}
            className="px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white">
            Log in
          </button>
          <button onClick={() => onAuth('signup')}
            className="bg-[#0056b3] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#0066d6]">
            Sign up
          </button>
        </div>

        {/* Mobile toggle */}
        <button onClick={() => setMobileOpen(o => !o)}
          className="ml-auto flex h-8 w-8 items-center justify-center text-white md:hidden">
          <span className="text-lg leading-none">{mobileOpen ? '✕' : '☰'}</span>
        </button>
      </div>

      {/* Mobile panel */}
      {mobileOpen && (
        <div className="border-t border-white/10 bg-black px-4 pb-4 md:hidden">
          {TOOL_CATEGORIES.map(c => (
            <div key={c.label} className="py-2">
              <p className="px-1 py-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500">{c.label}</p>
              <div className="grid grid-cols-2 gap-1">
                {c.tools.map(t => (
                  <Link key={t.to} to={t.to} onClick={() => setMobileOpen(false)}
                    className="border border-white/10 px-2.5 py-2 text-xs text-slate-200 hover:border-[#0056b3] hover:text-white">
                    {t.name}
                  </Link>
                ))}
              </div>
            </div>
          ))}
          <div className="mt-2 flex gap-2 border-t border-white/10 pt-3">
            <button onClick={() => { setMobileOpen(false); onAuth('login') }}
              className="flex-1 border border-white/15 px-3 py-2 text-xs font-semibold text-slate-200">Log in</button>
            <button onClick={() => { setMobileOpen(false); onAuth('signup') }}
              className="flex-1 bg-[#0056b3] px-3 py-2 text-xs font-semibold text-white">Sign up</button>
          </div>
        </div>
      )}
    </nav>
  )
}
