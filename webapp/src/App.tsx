import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { AppShell } from './components/AppShell'
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
import Terms from './pages/legal/Terms'
import Privacy from './pages/legal/Privacy'
import Refunds from './pages/legal/Refunds'
import Contact from './pages/legal/Contact'
import Profile from './pages/auth/Profile'
// three.js is heavy — the 3D pages load in their own lazy chunks.
const ModelSpace = lazy(() => import('./pages/ModelSpace'))
const TrussSpace = lazy(() => import('./pages/TrussSpace'))
import SteelBeam from './pages/SteelBeam'
import SteelColumn from './pages/SteelColumn'
import SlabDesign from './pages/SlabDesign'
import TorsionDesign from './pages/TorsionDesign'
import DevLength from './pages/DevLength'
import PunchingShear from './pages/PunchingShear'
import RetainingWall from './pages/RetainingWall'
import EarthPressure from './pages/EarthPressure'
import BearingCapacity from './pages/BearingCapacity'
import SoilNail from './pages/SoilNail'
import StairDesign from './pages/StairDesign'
import WoodSlab from './pages/WoodSlab'
import Micropile from './pages/Micropile'
import SlopeStability from './pages/SlopeStability'
import Settlement from './pages/Settlement'
import LateralPile from './pages/LateralPile'
import SoilInvestigation from './pages/SoilInvestigation'
import Pricing from './pages/Pricing'
import SignIn from './pages/auth/SignIn'
import SignUp from './pages/auth/SignUp'
import ForgotPassword from './pages/auth/ForgotPassword'
import ResetPassword from './pages/auth/ResetPassword'
import { RequireAuth } from './components/RequireAuth'
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
import ScheduleDashboard from './pages/ScheduleDashboard'
import ScheduleResources from './pages/ScheduleResources'
import ScheduleReports from './pages/ScheduleReports'
import ScheduleDaily from './pages/ScheduleDaily'


/**
 * Suspense fallback for a lazily-loaded page.
 *
 * It reserves roughly a screen of height. The bare `<p>` it replaces had none,
 * so the footer rendered directly beneath the one-line message and then jumped
 * down the moment the chunk arrived — the page appeared to load backwards.
 */
function PageLoading({ what }: { what: string }) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center p-8">
      <p className="text-sm text-slate-500">Loading {what}…</p>
    </div>
  )
}
export default function App() {
  const nav = useNavigate()

  // Home carries its own hero navigation; every tool route lives inside the
  // workbench shell (sidebar + breadcrumb header + command palette).
  return (
    <>
      <Routes>
        <Route path="/" element={<Home onAuth={(m) => nav(m === 'signup' ? '/signup' : '/signin')} />} />
        <Route path="*" element={
          <AppShell>
            <Routes>
        <Route path="/docs" element={<Documentation />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/refunds" element={<Refunds />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/validation" element={<Validation />} />
        <Route path="/foundation" element={<FoundationDesign />} />
        <Route path="/pile-cap" element={<PileCapDesign />} />
        <Route path="/combined" element={<CombinedFootingDesign />} />
        <Route path="/beam-design" element={<BeamDesign />} />
        <Route path="/tbeam-design" element={<TBeamDesign />} />
        <Route path="/prestressed-beam" element={<PrestressedBeam />} />
        <Route path="/beam-analysis" element={<BeamAnalysis />} />
        <Route path="/column-design" element={<ColumnDesign />} />
        <Route path="/frame" element={<RequireAuth><FrameAnalysis /></RequireAuth>} />
        <Route path="/load-path" element={<LoadPath />} />
        <Route path="/model" element={
          <Suspense fallback={<PageLoading what="3D model space" />}>
            <ModelSpace />
          </Suspense>
        } />
        <Route path="/truss" element={
          <Suspense fallback={<PageLoading what="truss space" />}>
            <TrussSpace />
          </Suspense>
        } />
        {/* Steel Design was one page with three tabs; it is now four pages,
            one per calculator, each with its own trial allowance and its own
            printable report. /steel keeps working and lands on the beam. */}
        <Route path="/steel" element={<Navigate to="/steel/beam" replace />} />
        <Route path="/steel/beam" element={<SteelBeam />} />
        <Route path="/steel/column" element={<SteelColumn />} />
        <Route path="/slab-design" element={<SlabDesign />} />
        <Route path="/torsion" element={<TorsionDesign />} />
        <Route path="/dev-length" element={<DevLength />} />
        <Route path="/punching-shear" element={<PunchingShear />} />
        <Route path="/retaining-wall" element={<RetainingWall />} />
        {/* The geotechnical index is gone. It listed the tools the sidebar
            already lists, so it was a page you passed THROUGH rather than
            used. Redirected to the tool most people arriving at "geotechnical"
            actually wanted — bearing capacity — rather than 404ing a route the
            docs link to. */}
        <Route path="/geotech" element={<Navigate to="/bearing-capacity" replace />} />
        <Route path="/earth-pressure" element={<EarthPressure />} />
        <Route path="/bearing-capacity" element={<BearingCapacity />} />
        <Route path="/soil-nail" element={<SoilNail />} />
        <Route path="/stair" element={<StairDesign />} />
        <Route path="/wood-slab" element={<WoodSlab />} />
        <Route path="/micropile" element={<Micropile />} />
        <Route path="/slope" element={<SlopeStability />} />
        <Route path="/settlement" element={<Settlement />} />
        <Route path="/lateral-pile" element={<LateralPile />} />
        <Route path="/soils" element={<RequireAuth><SoilInvestigation /></RequireAuth>} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/rock-anchor" element={<RockAnchor />} />
        <Route path="/seismic-wizard" element={<RequireAuth><SeismicWizard /></RequireAuth>} />
        <Route path="/water-tank" element={<WaterTank />} />
        <Route path="/shotcrete-facing" element={<ShotcreteFacing />} />
        <Route path="/bolted-connection" element={<BoltedConnection />} />
        <Route path="/welded-connection" element={<WeldedConnection />} />
        <Route path="/estimate/slab" element={<RequireAuth><SlabEstimate /></RequireAuth>} />
        <Route path="/estimate/beam" element={<RequireAuth><BeamEstimate /></RequireAuth>} />
        <Route path="/estimate/column" element={<RequireAuth><ColumnEstimate /></RequireAuth>} />
        <Route path="/estimate/chb" element={<RequireAuth><ChbEstimate /></RequireAuth>} />
        <Route path="/estimate/box-culvert" element={<RequireAuth><BoxCulvertEstimate /></RequireAuth>} />
              <Route path="/load-combinations" element={<LoadCombinations />} />
        <Route path="/plumbing" element={<PlumbingDesign />} />
        <Route path="/schedule" element={<RequireAuth><Schedule /></RequireAuth>} />
        <Route path="/schedule/gantt" element={<RequireAuth><ScheduleGantt /></RequireAuth>} />
        <Route path="/schedule/network" element={<RequireAuth><ScheduleNetwork /></RequireAuth>} />
        <Route path="/schedule/dashboard" element={<RequireAuth><ScheduleDashboard /></RequireAuth>} />
        <Route path="/schedule/resources" element={<RequireAuth><ScheduleResources /></RequireAuth>} />
        <Route path="/schedule/reports" element={<RequireAuth><ScheduleReports /></RequireAuth>} />
        <Route path="/schedule/daily" element={<RequireAuth><ScheduleDaily /></RequireAuth>} />
            </Routes>
          </AppShell>
        } />
      </Routes>
    </>
  )
}
