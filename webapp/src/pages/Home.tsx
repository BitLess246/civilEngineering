import { Link } from 'react-router-dom'
import { TOOL_CATEGORIES } from '../lib/tools'

// Flat structural-frame line illustration — distributed load on a portal frame
// with a hint of the bending diagram. Pure SVG, no assets, scales cleanly.
function FrameIllustration() {
  return (
    <svg viewBox="0 0 320 240" className="h-full w-full" fill="none" stroke="currentColor">
      {/* distributed load arrows */}
      <g className="text-[#0056b3]" strokeWidth={1.5}>
        {[40, 80, 120, 160, 200, 240, 280].map(x => (
          <line key={x} x1={x} y1={22} x2={x} y2={48} markerEnd="url(#arrow)" />
        ))}
        <line x1={36} y1={22} x2={284} y2={22} strokeWidth={2} />
      </g>
      {/* portal frame */}
      <g className="text-slate-800" strokeWidth={3} strokeLinecap="square">
        <line x1={40} y1={50} x2={280} y2={50} />
        <line x1={40} y1={50} x2={40} y2={200} />
        <line x1={280} y1={50} x2={280} y2={200} />
      </g>
      {/* supports */}
      <g className="text-slate-800" strokeWidth={2}>
        <polygon points="40,200 28,216 52,216" className="fill-slate-800" />
        <polygon points="280,200 268,216 292,216" className="fill-slate-800" />
        <line x1={20} y1={216} x2={60} y2={216} />
        <line x1={260} y1={216} x2={300} y2={216} />
      </g>
      {/* bending hint */}
      <path d="M40 90 Q160 150 280 90" className="text-[#0056b3]" strokeWidth={1.5} strokeDasharray="4 4" />
      <defs>
        <marker id="arrow" markerWidth="6" markerHeight="6" refX="3" refY="5" orient="auto">
          <path d="M0,0 L3,6 L6,0" className="fill-[#0056b3]" stroke="none" />
        </marker>
      </defs>
    </svg>
  )
}

interface Sample { to: string; tag: string; title: string; desc: string }
const SAMPLES: Sample[] = [
  { to: '/beam-design',   tag: 'ACI 318-14', title: 'RC Beam — flexure & shear',
    desc: 'Size a 300×500 beam for Mu = 180 kN·m, get rebar and stirrup spacing with a worked solution.' },
  { to: '/steel',         tag: 'AISC 360-16', title: 'Steel Beam — LRFD',
    desc: 'Check a W-shape for §F2 flexure and §G2 shear with live utilization and a 3D section.' },
  { to: '/frame',         tag: '2D FEM',      title: 'Portal Frame — analysis',
    desc: 'Solve member forces and reactions on a 2D frame using the direct stiffness method.' },
]

export default function Home({ onAuth }: { onAuth: (mode: 'login' | 'signup') => void }) {
  const toolCount = TOOL_CATEGORIES.reduce((n, c) => n + c.tools.length, 0)

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Hero */}
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:py-24">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#0056b3]">
              NSCP 2015 · ACI 318-14 · AISC 360-16
            </p>
            <h1 className="mt-4 text-4xl font-black leading-[1.05] tracking-tight text-slate-900 sm:text-6xl">
              Structural design,<br />computed live.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-500">
              A suite of design solvers and material take-off estimators built on a typed
              calculation engine. Every input recomputes instantly and exports a clean,
              code-referenced report — no spreadsheets, no black boxes.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/beam-design"
                className="bg-[#0056b3] px-6 py-3 text-sm font-semibold text-white hover:bg-[#0066d6]">
                Open a calculator →
              </Link>
              <button onClick={() => onAuth('signup')}
                className="border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-700 hover:border-slate-800">
                Create account
              </button>
            </div>
            <div className="mt-10 flex items-center gap-7 text-xs text-slate-400">
              <span><strong className="text-slate-800">{toolCount}</strong> tools</span>
              <div className="h-3 w-px bg-slate-200" />
              <span><strong className="text-slate-800">Server-side</strong> solvers</span>
              <div className="h-3 w-px bg-slate-200" />
              <span><strong className="text-slate-800">PDF</strong> reports</span>
            </div>
          </div>
          <div className="flex items-center justify-center border border-slate-200 bg-slate-50 p-8">
            <div className="h-64 w-full max-w-sm">
              <FrameIllustration />
            </div>
          </div>
        </div>
      </section>

      {/* Standards strip */}
      <section className="border-b border-slate-200 bg-black">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          {['Reinforced Concrete', 'Structural Steel', 'Foundations', 'Frame & Truss Analysis', 'Quantity Take-Off'].map(s => (
            <span key={s} className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">{s}</span>
          ))}
        </div>
      </section>

      {/* Sample / test cases */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="mb-6 flex items-center gap-4">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Try a sample</span>
          <div className="h-px flex-1 bg-slate-200" />
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {SAMPLES.map(s => (
            <Link key={s.to} to={s.to}
              className="group flex flex-col border border-slate-200 bg-white p-6 transition-colors hover:border-[#0056b3] hover:bg-[#f4f8ff]">
              <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 group-hover:text-[#0056b3]">{s.tag}</span>
              <span className="mt-2 text-base font-semibold text-slate-900">{s.title}</span>
              <span className="mt-2 text-xs leading-relaxed text-slate-500">{s.desc}</span>
              <span className="mt-5 text-xs font-semibold text-[#0056b3] opacity-0 transition-opacity group-hover:opacity-100">
                Open tool →
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Closing CTA */}
      <section className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-6 py-12 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Browse every tool from the menu.</h2>
            <p className="mt-1 text-sm text-slate-500">Pick a category in the top navigation — Structural or Quantity Take-Off.</p>
          </div>
          <button onClick={() => onAuth('signup')}
            className="bg-[#0056b3] px-6 py-3 text-sm font-semibold text-white hover:bg-[#0066d6]">
            Create free account
          </button>
        </div>
      </section>
    </div>
  )
}
