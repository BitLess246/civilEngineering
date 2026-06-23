import { lazy, Suspense, useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Navbar } from './components/Navbar'
import { AuthModal } from './components/AuthModal'
import Home from './pages/Home'
import FoundationDesign from './pages/FoundationDesign'
import PileCapDesign from './pages/PileCapDesign'
import CombinedFootingDesign from './pages/CombinedFootingDesign'
import BeamDesign from './pages/BeamDesign'
import BeamAnalysis from './pages/BeamAnalysis'
import ColumnDesign from './pages/ColumnDesign'
import FrameAnalysis from './pages/FrameAnalysis'
import LoadPath from './pages/LoadPath'
// three.js is heavy — the 3D pages load in their own lazy chunks.
const ModelSpace = lazy(() => import('./pages/ModelSpace'))
const TrussSpace = lazy(() => import('./pages/TrussSpace'))
import SteelDesign from './pages/SteelDesign'
import SlabEstimate from './pages/SlabEstimate'
import ChbEstimate from './pages/ChbEstimate'
import ColumnEstimate from './pages/ColumnEstimate'
import BeamEstimate from './pages/BeamEstimate'
import BoxCulvertEstimate from './pages/BoxCulvertEstimate'

export default function App() {
  const [auth, setAuth] = useState<'login' | 'signup' | null>(null)

  return (
    <>
      <Navbar onAuth={setAuth} />
      <Routes>
        <Route path="/" element={<Home onAuth={setAuth} />} />
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
      {auth && <AuthModal mode={auth} onClose={() => setAuth(null)} />}
    </>
  )
}
