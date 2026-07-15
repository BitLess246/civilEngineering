import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { SIDEBAR_GROUPS, ALL_TOOLS } from '../lib/tools'
import { CommandPalette, usePaletteHotkey } from '../components/CommandPalette'

// Home — search-first tool directory on the drawing-sheet workbench theme
// (docs/design/uiux-2026-07/Redesign - Home): dark hero with drafting grid,
// ⌘K search, sample cards, and the full catalog with a sticky discipline rail.

interface Sample { to: string; tag: string; time: string; title: string; desc: string }
const SAMPLES: Sample[] = [
  { to: '/beam-design', tag: 'ACI 318-14', time: '~2 min', title: 'RC Beam — flexure & shear',
    desc: 'Size a 300×500 beam for Mu = 180 kN·m; rebar and stirrup spacing with a worked solution.' },
  { to: '/steel', tag: 'AISC 360-16', time: '~2 min', title: 'Steel Beam — LRFD',
    desc: 'Check a W-shape for §F2 flexure and §G2 shear with live utilization and a 3D section.' },
  { to: '/frame', tag: '2D FEM', time: '~3 min', title: 'Portal Frame — analysis',
    desc: 'Member forces and reactions on a 2D frame by the direct stiffness method.' },
]

const CHIPS = ['RC Beam', 'Isolated Footing', 'Steel W-shape', '3D Model Space', 'Seismic Wizard', 'Retaining Wall', 'Truss', 'Load Combos']
const chipTo: Record<string, string> = {
  'RC Beam': '/beam-design', 'Isolated Footing': '/foundation', 'Steel W-shape': '/steel',
  '3D Model Space': '/model', 'Seismic Wizard': '/seismic-wizard', 'Retaining Wall': '/retaining-wall',
  'Truss': '/truss', 'Load Combos': '/load-combinations',
}

export default function Home({ onAuth }: { onAuth: (mode: 'login' | 'signup') => void }) {
  const [palette, setPalette] = useState(false)
  usePaletteHotkey(setPalette)
  const toolCount = ALL_TOOLS.length
  const groups = useMemo(() => SIDEBAR_GROUPS.map((g, i) => ({
    num: String(i + 1).padStart(2, '0'),
    heading: g.label === 'Analysis' ? 'Analysis & Modelling' : g.label === 'Steel' ? 'Steel & Connections' : g.label === 'Estimates' ? 'Quantity Take-Off' : g.label,
    anchor: `dir-${i}`,
    tools: g.tools,
  })), [])

  const searchBox = (big: boolean) => (
    <button type="button" onClick={() => setPalette(true)}
      className={`flex items-center gap-2.5 rounded-lg border border-white/20 bg-white/[.07] text-left hover:border-[#5b9bd5] ${big ? 'flex-1 px-4 py-3' : 'w-[220px] rounded-md border-white/15 bg-white/5 px-2.5 py-1.5'}`}>
      <svg viewBox="0 0 24 24" width={big ? 16 : 13} height={big ? 16 : 13} fill="none" stroke="#7d8ea3" strokeWidth="2.4" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" /></svg>
      <span className={`flex-1 text-[#7d8ea3] ${big ? 'text-sm' : 'text-xs'}`}>{big ? `Search ${toolCount} tools — try "footing", "W-shape", "seismic"…` : 'Find a tool…'}</span>
      <span className="rounded border border-white/15 px-1 py-px font-mono text-[10px] text-[#7d8ea3]">⌘K</span>
    </button>
  )

  return (
    <div className="min-h-screen bg-[#f4f3ef]">
      {/* Top bar */}
      <nav className="no-print sticky top-0 z-50 border-b border-white/10 bg-[#0f1b2a]">
        <div className="mx-auto flex h-[52px] max-w-[1200px] items-center gap-5 px-6">
          <Link to="/" className="flex items-baseline gap-2">
            <span className="text-[15px] font-extrabold tracking-[.14em] text-white">CIVENG</span>
            <span className="text-[9px] font-semibold uppercase tracking-[.22em] text-[#7d8ea3]">Toolkit</span>
          </Link>
          <div className="hidden items-center gap-0.5 md:flex">
            <a href="#tools" className="rounded-md px-2.5 py-1.5 text-[12.5px] font-semibold text-[#b6c2d0] hover:bg-white/5 hover:text-white">Tools</a>
            <Link to="/docs" className="rounded-md px-2.5 py-1.5 text-[12.5px] font-semibold text-[#b6c2d0] hover:bg-white/5 hover:text-white">Docs</Link>
            <Link to="/validation" className="rounded-md px-2.5 py-1.5 text-[12.5px] font-semibold text-[#b6c2d0] hover:bg-white/5 hover:text-white">Validation</Link>
          </div>
          <div className="ml-auto flex items-center gap-2.5">
            <div className="hidden sm:block">{searchBox(false)}</div>
            <button onClick={() => onAuth('login')} className="px-2 py-1.5 text-[12.5px] font-semibold text-[#b6c2d0] hover:text-white">Log in</button>
            <button onClick={() => onAuth('signup')} className="rounded-md bg-[#0f4c92] px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-[#135caf]">Sign up</button>
          </div>
        </div>
      </nav>

      {/* Hero on a drafting grid */}
      <section className="border-b border-[#e3e1da] bg-[#0f1b2a] [background-image:linear-gradient(rgba(255,255,255,.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.045)_1px,transparent_1px)] [background-size:32px_32px]">
        <div className="mx-auto max-w-[1200px] px-6 pb-14 pt-16">
          <p className="font-mono text-[11px] font-medium tracking-[.2em] text-[#5b9bd5]">NSCP 2015 · ACI 318-14 · AISC 360-16</p>
          <h1 className="mt-3.5 max-w-[720px] text-4xl font-extrabold leading-[1.04] tracking-tight text-white sm:text-[52px]">The structural workbench for Philippine practice.</h1>
          <p className="mt-4 max-w-[600px] text-base leading-relaxed text-[#9db0c5]">{toolCount} code-checked calculators, 3D analysis and quantity take-off on a typed engine — every result traced to its clause, every report ready to sign.</p>
          <div className="mt-7 flex max-w-[640px] items-center gap-2.5">
            {searchBox(true)}
            <Link to="/model" className="whitespace-nowrap rounded-lg bg-[#0f4c92] px-5 py-3.5 text-sm font-bold text-white hover:bg-[#135caf]">Open workbench</Link>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            {CHIPS.map((c) => (
              <Link key={c} to={chipTo[c] ?? '#'}
                className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold text-[#b6c2d0] hover:border-[#5b9bd5] hover:bg-[#0f4c92]/35 hover:text-white">{c}</Link>
            ))}
          </div>
        </div>
      </section>

      {/* Sample cards */}
      <section className="mx-auto max-w-[1200px] px-6 pb-2 pt-9">
        <div className="grid gap-3.5 md:grid-cols-3">
          {SAMPLES.map((s) => (
            <Link key={s.to} to={s.to}
              className="flex flex-col rounded-lg border border-[#e3e1da] bg-white p-5 transition-[border-color,box-shadow] hover:border-[#0f4c92] hover:shadow-[0_2px_10px_rgba(15,27,42,.07)]">
              <div className="flex items-center justify-between">
                <span className="rounded border border-[#cddcf0] bg-[#eaf1f9] px-1.5 py-px font-mono text-[10px] font-semibold tracking-wide text-[#0f4c92]">{s.tag}</span>
                <span className="font-mono text-[10px] text-[#a39d8d]">{s.time}</span>
              </div>
              <span className="mt-3 text-[15.5px] font-bold text-[#0f1b2a]">{s.title}</span>
              <span className="mt-1.5 text-[12.5px] leading-relaxed text-[#5c6675]">{s.desc}</span>
              <span className="mt-3.5 text-xs font-bold text-[#0f4c92]">Run this example →</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Tool directory with sticky rail */}
      <section id="tools" className="mx-auto max-w-[1200px] px-6 pb-16 pt-9">
        <div className="mb-4 flex items-baseline gap-3.5">
          <h2 className="text-[19px] font-extrabold tracking-tight">Tool directory</h2>
          <span className="font-mono text-[11px] text-[#a39d8d]">{toolCount} tools · {groups.length} disciplines</span>
        </div>
        <div className="grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <div className="sticky top-[72px] hidden flex-col gap-0.5 lg:flex">
            {groups.map((g) => (
              <a key={g.anchor} href={`#${g.anchor}`}
                className="flex items-center justify-between rounded-md px-2.5 py-[7px] text-[12.5px] font-semibold text-[#5c6675] hover:bg-[#e9e7df] hover:text-[#0f1b2a]">
                {g.heading}
                <span className="font-mono text-[10px] text-[#a39d8d]">{String(g.tools.length).padStart(2, '0')}</span>
              </a>
            ))}
          </div>
          <div className="flex flex-col gap-6">
            {groups.map((g) => (
              <div key={g.anchor} id={g.anchor} className="scroll-mt-16">
                <div className="mb-2.5 flex items-baseline gap-2.5">
                  <span className="font-mono text-[10px] font-semibold text-[#a39d8d]">{g.num}</span>
                  <h3 className="text-[13px] font-bold uppercase tracking-wider text-[#3d4a5c]">{g.heading}</h3>
                  <div className="h-px flex-1 bg-[#e3e1da]" />
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {g.tools.map((t) => (
                    <Link key={t.to + t.name} to={t.to}
                      className="flex flex-col rounded-lg border border-[#e3e1da] bg-white px-4 py-3.5 transition-colors hover:border-[#0f4c92]">
                      <span className="text-[13.5px] font-bold text-[#0f1b2a]">{t.name}</span>
                      <span className="mt-0.5 font-mono text-[10.5px] text-[#8b8574]">{t.sub}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA band */}
      <section className="bg-[#0f1b2a]">
        <div className="mx-auto flex max-w-[1200px] flex-col items-start justify-between gap-5 px-6 py-10 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-xl font-extrabold text-white">Every calculation, code-referenced.</h2>
            <p className="mt-1 text-[13px] text-[#9db0c5]">Clause citations on every worked step. Validated against hand calcs — <Link to="/validation" className="text-[#5b9bd5] hover:underline">see the validation suite</Link>.</p>
          </div>
          <button onClick={() => onAuth('signup')}
            className="whitespace-nowrap rounded-md bg-[#0f4c92] px-5 py-3 text-[13px] font-bold text-white hover:bg-[#135caf]">Create free account</button>
        </div>
      </section>

      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </div>
  )
}
