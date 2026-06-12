import { Routes, Route, Link } from 'react-router-dom'
import FoundationDesign from './pages/FoundationDesign'
import PileCapDesign from './pages/PileCapDesign'
import CombinedFootingDesign from './pages/CombinedFootingDesign'
import BeamDesign from './pages/BeamDesign'
import BeamAnalysis from './pages/BeamAnalysis'
import ColumnDesign from './pages/ColumnDesign'
import SlabEstimate from './pages/SlabEstimate'
import ChbEstimate from './pages/ChbEstimate'
import ColumnEstimate from './pages/ColumnEstimate'
import BeamEstimate from './pages/BeamEstimate'
import BoxCulvertEstimate from './pages/BoxCulvertEstimate'

function Tile({ to, children }: { to: string; children: string }) {
  return (
    <Link to={to}
      className="inline-block rounded-lg bg-gradient-to-br from-[#0056b3] to-[#003f86] px-5 py-2.5 font-semibold text-white shadow-md transition hover:shadow-lg">
      {children} →
    </Link>
  )
}

function Home() {
  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="text-3xl font-extrabold tracking-tight text-[#0056b3]">
        Civil Engineering Toolkit
      </h1>
      <p className="mt-2 text-slate-600">
        Structural design tools and material take-off estimators built on a typed calculation engine
        (NSCP&nbsp;2015 / ACI&nbsp;318-14). Every tool computes live and produces a printable / PDF report.
      </p>

      <h2 className="mt-8 text-lg font-semibold text-slate-800">Structural design</h2>
      <div className="mt-3 flex flex-wrap gap-3">
        <Tile to="/foundation">Foundation Design</Tile>
        <Tile to="/pile-cap">Pile Cap Design</Tile>
        <Tile to="/combined">Combined Footing</Tile>
        <Tile to="/beam-design">Beam Design</Tile>
        <Tile to="/beam-analysis">Beam Analysis (FEM)</Tile>
        <Tile to="/column-design">Column Design</Tile>
      </div>

      <h2 className="mt-8 text-lg font-semibold text-slate-800">Material estimation (quantity take-off)</h2>
      <div className="mt-3 flex flex-wrap gap-3">
        <Tile to="/estimate/slab">Slab</Tile>
        <Tile to="/estimate/beam">Beam</Tile>
        <Tile to="/estimate/column">Column</Tile>
        <Tile to="/estimate/chb">CHB Wall</Tile>
        <Tile to="/estimate/box-culvert">Box Culvert</Tile>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/foundation" element={<FoundationDesign />} />
      <Route path="/pile-cap" element={<PileCapDesign />} />
      <Route path="/combined" element={<CombinedFootingDesign />} />
      <Route path="/beam-design" element={<BeamDesign />} />
      <Route path="/beam-analysis" element={<BeamAnalysis />} />
      <Route path="/column-design" element={<ColumnDesign />} />
      <Route path="/estimate/slab" element={<SlabEstimate />} />
      <Route path="/estimate/beam" element={<BeamEstimate />} />
      <Route path="/estimate/column" element={<ColumnEstimate />} />
      <Route path="/estimate/chb" element={<ChbEstimate />} />
      <Route path="/estimate/box-culvert" element={<BoxCulvertEstimate />} />
    </Routes>
  )
}
