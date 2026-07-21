import { lazy, Suspense, useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { AuthModal } from './components/AuthModal'
import Home from './pages/Home'
import FoundationDesign from './pages/FoundationDesign'
import PileCapDesign from './pages/PileCapDesign'
import CombinedFootingDesign from './pages/CombinedFootingDesign'
import BeamDesign from './pages/BeamDesign'
import TBeamDesign from './pages/TBeamDesign'
import PrestressedBeam from './pages/PrestressedBeam'
import BeamAnalysis from './pages/BeamAnalysis'
import ColumnDesign from './pages/ColumnDesign'
import FrameAnalysis from './pages/FrameAnalysis'
import LoadPath from './pages/LoadPath'
import Documentation from './pages/Documentation'
import Validation from './pages/Validation'
// three.js is heavy — the 3D pages load in their own lazy chunks.
const ModelSpace = lazy(() => import('./pages/ModelSpace'))
const TrussSpace = lazy(() => import('./pages/TrussSpace'))
import SteelDesign from './pages/SteelDesign'
import SlabDesign from './pages/SlabDesign'
import TorsionDesign from './pages/TorsionDesign'
import DevLength from './pages/DevLength'
import PunchingShear from './pages/PunchingShear'
import RetainingWall from './pages/RetainingWall'
import Geotech from './pages/Geotech'
import SoilNail from './pages/SoilNail'
import StairDesign from './pages/StairDesign'
import WoodSlab from './pages/WoodSlab'
import Micropile from './pages/Micropile'
import RockAnchor from './pages/RockAnchor'
import SeismicWizard from './pages/SeismicWizard'
import WaterTank from './pages/WaterTank'
import ShotcreteFacing from './pages/ShotcreteFacing'
import BoltedConnection from './pages/BoltedConnection'
import WeldedConnection from './pages/WeldedConnection'
import SlabEstimate from './pages/SlabEstimate'
import ChbEstimate from './pages/ChbEstimate'
import ColumnEstimate from './pages/ColumnEstimate'
import BeamEstimate from './pages/BeamEstimate'
import BoxCulvertEstimate from './pages/BoxCulvertEstimate'
import LoadCombinations from './pages/LoadCombinations'
import PlumbingDesign from './pages/PlumbingDesign'
import Schedule from './pages/Schedule'
import ScheduleGantt from './pages/ScheduleGantt'
import ScheduleNetwork from './pages/ScheduleNetwork'

export default function App() {
  const [auth, setAuth] = useState<'login' | 'signup' | null>(null)

  // Home carries its own hero navigation; every tool route lives inside the
  // workbench shell (sidebar + breadcrumb header + command palette).
  return (
    <>
      <Routes>
        <Route path="/" element={<Home onAuth={setAuth} />} />
        <Route path="*" element={
          <AppShell>
            <Routes>
        <Route path="/docs" element={<Documentation />} />
        <Route path="/validation" element={<Validation />} />
        <Route path="/foundation" element={<FoundationDesign />} />
        <Route path="/pile-cap" element={<PileCapDesign />} />
        <Route path="/combined" element={<CombinedFootingDesign />} />
        <Route path="/beam-design" element={<BeamDesign />} />
        <Route path="/tbeam-design" element={<TBeamDesign />} />
        <Route path="/prestressed-beam" element={<PrestressedBeam />} />
        <Route path="/beam-analysis" element={<BeamAnalysis />} />
        <Route path="/column-design" element={<ColumnDesign />} />
        <Route path="/frame" element={<FrameAnalysis />} />
        <Route path="/load-path" element={<LoadPath />} />
        <Route path="/model" element={
          <Suspense fallback={<p className="p-8 text-center text-sm text-slate-500">Loading 3D model space…</p>}>
            <ModelSpace />
          </Suspense>
        } />
        <Route path="/truss" element={
          <Suspense fallback={<p className="p-8 text-center text-sm text-slate-500">Loading truss space…</p>}>
            <TrussSpace />
          </Suspense>
        } />
        <Route path="/steel" element={<SteelDesign />} />
        <Route path="/slab-design" element={<SlabDesign />} />
        <Route path="/torsion" element={<TorsionDesign />} />
        <Route path="/dev-length" element={<DevLength />} />
        <Route path="/punching-shear" element={<PunchingShear />} />
        <Route path="/retaining-wall" element={<RetainingWall />} />
        <Route path="/geotech" element={<Geotech />} />
        <Route path="/soil-nail" element={<SoilNail />} />
        <Route path="/stair" element={<StairDesign />} />
        <Route path="/wood-slab" element={<WoodSlab />} />
        <Route path="/micropile" element={<Micropile />} />
        <Route path="/rock-anchor" element={<RockAnchor />} />
        <Route path="/seismic-wizard" element={<SeismicWizard />} />
        <Route path="/water-tank" element={<WaterTank />} />
        <Route path="/shotcrete-facing" element={<ShotcreteFacing />} />
        <Route path="/bolted-connection" element={<BoltedConnection />} />
        <Route path="/welded-connection" element={<WeldedConnection />} />
        <Route path="/estimate/slab" element={<SlabEstimate />} />
        <Route path="/estimate/beam" element={<BeamEstimate />} />
        <Route path="/estimate/column" element={<ColumnEstimate />} />
        <Route path="/estimate/chb" element={<ChbEstimate />} />
        <Route path="/estimate/box-culvert" element={<BoxCulvertEstimate />} />
              <Route path="/load-combinations" element={<LoadCombinations />} />
        <Route path="/plumbing" element={<PlumbingDesign />} />
        <Route path="/schedule" element={<Schedule />} />
        <Route path="/schedule/gantt" element={<ScheduleGantt />} />
        <Route path="/schedule/network" element={<ScheduleNetwork />} />
            </Routes>
          </AppShell>
        } />
      </Routes>
      {auth && <AuthModal mode={auth} onClose={() => setAuth(null)} />}
    </>
  )
}
