import { lazy, Suspense } from 'react'
import { Routes, Route, Link } from 'react-router-dom'
import FoundationDesign from './pages/FoundationDesign'
import PileCapDesign from './pages/PileCapDesign'
import CombinedFootingDesign from './pages/CombinedFootingDesign'
import BeamDesign from './pages/BeamDesign'
import BeamAnalysis from './pages/BeamAnalysis'
import ColumnDesign from './pages/ColumnDesign'
import FrameAnalysis from './pages/FrameAnalysis'
import LoadPath from './pages/LoadPath'
const ModelSpace = lazy(() => import('./pages/ModelSpace'))
const TrussSpace = lazy(() => import('./pages/TrussSpace'))
import SteelDesign from './pages/SteelDesign'
import SlabEstimate from './pages/SlabEstimate'
import ChbEstimate from './pages/ChbEstimate'
import ColumnEstimate from './pages/ColumnEstimate'
import BeamEstimate from './pages/BeamEstimate'
import BoxCulvertEstimate from './pages/BoxCulvertEstimate'

// ─── Navbar ───────────────────────────────────────────────────────────────────

function Navbar() {
  return (
    <nav className="sticky top-0 z-50 flex h-11 items-center gap-3 border-b border-white/10 bg-black px-5">
      <Link to="/" className="flex items-center gap-2.5">
        <span className="text-[11px] font-black tracking-[0.2em] text-white uppercase">CivEng</span>
        <span className="hidden h-3.5 w-px bg-white/20 sm:block" />
        <span className="hidden text-[10px] tracking-wide text-slate-500 sm:block">Structural Toolkit</span>
      </Link>
      <div className="ml-auto flex items-center gap-4">
        <span className="hidden text-[9px] font-bold tracking-widest text-slate-600 uppercase sm:block">NSCP 2015</span>
        <span className="hidden text-[9px] font-bold tracking-widest text-slate-600 uppercase sm:block">ACI 318-14</span>
        <span className="hidden text-[9px] font-bold tracking-widest text-slate-600 uppercase sm:block">AISC 360</span>
      </div>
    </nav>
  )
}

// ─── Home ─────────────────────────────────────────────────────────────────────

interface ToolDef { to: string; name: string; sub: string }

const DESIGN_TOOLS: ToolDef[] = [
  { to: '/foundation',    name: 'Foundation Design',  sub: 'Isolated pad · NSCP 2015'  },
  { to: '/pile-cap',      name: 'Pile Cap Design',    sub: 'Group pile cap'             },
  { to: '/combined',      name: 'Combined Footing',   sub: 'Rectangular / trapezoidal' },
  { to: '/beam-design',   name: 'Beam Design',        sub: 'RC beam · ACI 318-14'      },
  { to: '/beam-analysis', name: 'Beam Analysis',      sub: 'FEM multi-span solver'     },
  { to: '/column-design', name: 'Column Design',      sub: 'RC column · biaxial'       },
  { to: '/frame',         name: 'Frame Analysis',     sub: '2D stiffness method'       },
  { to: '/load-path',     name: 'Slab Load Path',     sub: 'Two-way tributary'         },
  { to: '/model',         name: '3D Model Space',     sub: 'BIM-lite viewer'           },
  { to: '/truss',         name: 'Truss Space',        sub: 'Plane truss solver'        },
  { to: '/steel',         name: 'Steel Design',       sub: 'AISC 360-16 LRFD'         },
]

const ESTIMATE_TOOLS: ToolDef[] = [
  { to: '/estimate/slab',        name: 'Slab',        sub: 'Concrete + rebar'  },
  { to: '/estimate/beam',        name: 'Beam',        sub: 'Volume & weight'   },
  { to: '/estimate/column',      name: 'Column',      sub: 'Concrete + rebar'  },
  { to: '/estimate/chb',         name: 'CHB Wall',    sub: 'Block count'       },
  { to: '/estimate/box-culvert', name: 'Box Culvert', sub: 'Culvert estimate'  },
]

function ToolCard({ to, name, sub }: ToolDef) {
  return (
    <Link to={to}
      className="group flex flex-col border border-slate-200 bg-white p-5 transition-colors duration-100 hover:border-[#0056b3] hover:bg-[#f4f8ff]">
      <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 group-hover:text-[#0056b3]">
        {sub}
      </span>
      <span className="mt-1.5 text-sm font-semibold text-slate-800">{name}</span>
      <span className="mt-4 text-xs text-slate-300 group-hover:text-[#0056b3]">→</span>
    </Link>
  )
}

function ToolSection({ label, tools }: { label: string; tools: ToolDef[] }) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-4">
        <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">{label}</span>
        <div className="h-px flex-1 bg-slate-200" />
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map(t => <ToolCard key={t.to} {...t} />)}
      </div>
    </section>
  )
}

function Home() {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Hero */}
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-14">
          <div className="flex items-stretch gap-5">
            <div className="w-[3px] bg-[#0056b3]" />
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-[#0056b3]">
                Philippines · NSCP 2015 · ACI 318-14 · AISC 360-16
              </p>
              <h1 className="mt-3 text-4xl font-black leading-none tracking-tight text-slate-900 sm:text-5xl">
                Civil Engineering<br />Toolkit
              </h1>
              <p className="mt-4 max-w-lg text-sm leading-relaxed text-slate-500">
                Structural design solvers and material take-off estimators built on a typed
                calculation engine. Every tool computes live and outputs a printable report.
              </p>
              <div className="mt-6 flex items-center gap-6 text-xs text-slate-400">
                <span><strong className="text-slate-700">11</strong> design tools</span>
                <div className="h-3 w-px bg-slate-200" />
                <span><strong className="text-slate-700">5</strong> estimators</span>
                <div className="h-3 w-px bg-slate-200" />
                <span><strong className="text-slate-700">Server-side</strong> solvers</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tool grid */}
      <div className="mx-auto max-w-5xl space-y-10 px-6 py-10">
        <ToolSection label="Structural Design" tools={DESIGN_TOOLS} />
        <ToolSection label="Quantity Take-Off" tools={ESTIMATE_TOOLS} />
      </div>
    </div>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/foundation" element={<FoundationDesign />} />
        <Route path="/pile-cap" element={<PileCapDesign />} />
        <Route path="/combined" element={<CombinedFootingDesign />} />
        <Route path="/beam-design" element={<BeamDesign />} />
        <Route path="/beam-analysis" element={<BeamAnalysis />} />
        <Route path="/column-design" element={<ColumnDesign />} />
        <Route path="/frame" element={<FrameAnalysis />} />
        <Route path="/load-path" element={<LoadPath />} />
        <Route path="/model" element={
          <Suspense fallback={<p className="p-8 text-center text-sm text-slate-400">Loading 3D model space…</p>}>
            <ModelSpace />
          </Suspense>
        } />
        <Route path="/truss" element={
          <Suspense fallback={<p className="p-8 text-center text-sm text-slate-400">Loading truss space…</p>}>
            <TrussSpace />
          </Suspense>
        } />
        <Route path="/steel" element={<SteelDesign />} />
        <Route path="/estimate/slab" element={<SlabEstimate />} />
        <Route path="/estimate/beam" element={<BeamEstimate />} />
        <Route path="/estimate/column" element={<ColumnEstimate />} />
        <Route path="/estimate/chb" element={<ChbEstimate />} />
        <Route path="/estimate/box-culvert" element={<BoxCulvertEstimate />} />
      </Routes>
    </>
  )
}
