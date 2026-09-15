import { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { useScrollTopOnChange } from './lib/useScrollTop'
import { isEmbedLocation } from './lib/embed'
import { usePageViews } from './lib/analytics'
import { WelcomeDialog } from './components/WelcomeDialog'
import { useToolPrefs } from './lib/useToolPrefs'
import { hasAnswered } from './lib/toolPrefs'
import Home from './pages/Home'
import NotFound from './pages/NotFound'
import { RequireAuth } from './components/RequireAuth'
import { GuestOnly } from './components/GuestOnly'
import { ModelSpaceSkeleton } from './components/ModelSpaceSkeleton'
import { routeName } from './lib/documentTitle'

// Home and NotFound load with the app; everything else is a chunk of its own.
//
// 62 of the 64 pages were STATIC imports, so opening the landing page to read
// the pitch downloaded all 53 calculators and their engines first: a 2,428 kB
// entry chunk, 758 kB over the wire. The heavy libraries were already split
// well (exceljs, the PDF renderer, the solver worker all arrive on demand) —
// what was not split was the application itself.
//
// These two stay eager deliberately. Home is the first paint for most
// arrivals, and lazily loading it only trades entry-chunk bytes for a round
// trip on the one render that must not wait. NotFound is the catch-all: a
// spinner on the way to telling someone their URL is wrong is worse than the
// few kB it costs.

// three.js is heavy, which is why these two were split long before the rest.
const ModelSpace = lazy(() => import('./pages/ModelSpace'))
const TrussSpace = lazy(() => import('./pages/TrussSpace'))
const FoundationDesign = lazy(() => import('./pages/FoundationDesign'))
const PileCapDesign = lazy(() => import('./pages/PileCapDesign'))
const CombinedFootingDesign = lazy(() => import('./pages/CombinedFootingDesign'))
const BeamDesign = lazy(() => import('./pages/BeamDesign'))
const TBeamDesign = lazy(() => import('./pages/TBeamDesign'))
const PrestressedBeam = lazy(() => import('./pages/PrestressedBeam'))
const BeamAnalysis = lazy(() => import('./pages/BeamAnalysis'))
const ColumnDesign = lazy(() => import('./pages/ColumnDesign'))
const FrameAnalysis = lazy(() => import('./pages/FrameAnalysis'))
const LoadPath = lazy(() => import('./pages/LoadPath'))
const Documentation = lazy(() => import('./pages/Documentation'))
const Validation = lazy(() => import('./pages/Validation'))
const Terms = lazy(() => import('./pages/legal/Terms'))
const Privacy = lazy(() => import('./pages/legal/Privacy'))
const Refunds = lazy(() => import('./pages/legal/Refunds'))
const Contact = lazy(() => import('./pages/legal/Contact'))
const Profile = lazy(() => import('./pages/auth/Profile'))
const SteelBeam = lazy(() => import('./pages/SteelBeam'))
const SteelColumn = lazy(() => import('./pages/SteelColumn'))
const SlabDesign = lazy(() => import('./pages/SlabDesign'))
const TorsionDesign = lazy(() => import('./pages/TorsionDesign'))
const DevLength = lazy(() => import('./pages/DevLength'))
const PunchingShear = lazy(() => import('./pages/PunchingShear'))
const RetainingWall = lazy(() => import('./pages/RetainingWall'))
const EarthPressure = lazy(() => import('./pages/EarthPressure'))
const BearingCapacity = lazy(() => import('./pages/BearingCapacity'))
const SoilNail = lazy(() => import('./pages/SoilNail'))
const StairDesign = lazy(() => import('./pages/StairDesign'))
const LintelDesign = lazy(() => import('./pages/LintelDesign'))
const WoodSlab = lazy(() => import('./pages/WoodSlab'))
const Micropile = lazy(() => import('./pages/Micropile'))
const SlopeStability = lazy(() => import('./pages/SlopeStability'))
const Settlement = lazy(() => import('./pages/Settlement'))
const LateralPile = lazy(() => import('./pages/LateralPile'))
const SoilInvestigation = lazy(() => import('./pages/SoilInvestigation'))
const Pricing = lazy(() => import('./pages/Pricing'))
const SignIn = lazy(() => import('./pages/auth/SignIn'))
const SignUp = lazy(() => import('./pages/auth/SignUp'))
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'))
const ResetPassword = lazy(() => import('./pages/auth/ResetPassword'))
const RockAnchor = lazy(() => import('./pages/RockAnchor'))
const SeismicWizard = lazy(() => import('./pages/SeismicWizard'))
const WaterTank = lazy(() => import('./pages/WaterTank'))
const ShotcreteFacing = lazy(() => import('./pages/ShotcreteFacing'))
const BoltedConnection = lazy(() => import('./pages/BoltedConnection'))
const WeldedConnection = lazy(() => import('./pages/WeldedConnection'))
const SlabEstimate = lazy(() => import('./pages/SlabEstimate'))
const ChbEstimate = lazy(() => import('./pages/ChbEstimate'))
const ColumnEstimate = lazy(() => import('./pages/ColumnEstimate'))
const BeamEstimate = lazy(() => import('./pages/BeamEstimate'))
const BoxCulvertEstimate = lazy(() => import('./pages/BoxCulvertEstimate'))
const LoadCombinations = lazy(() => import('./pages/LoadCombinations'))
const PlumbingDesign = lazy(() => import('./pages/PlumbingDesign'))
const Schedule = lazy(() => import('./pages/Schedule'))
const ScheduleGantt = lazy(() => import('./pages/ScheduleGantt'))
const ScheduleNetwork = lazy(() => import('./pages/ScheduleNetwork'))
const ScheduleDashboard = lazy(() => import('./pages/ScheduleDashboard'))
const ScheduleResources = lazy(() => import('./pages/ScheduleResources'))
const ScheduleReports = lazy(() => import('./pages/ScheduleReports'))
const ScheduleDaily = lazy(() => import('./pages/ScheduleDaily'))


/**
 * Suspense fallback for a lazily-loaded page.
 *
 * It reserves roughly a screen of height. The bare `<p>` it replaces had none,
 * so the footer rendered directly beneath the one-line message and then jumped
 * down the moment the chunk arrived — the page appeared to load backwards.
 *
 * Reserving height is the floor, not the goal: `/model` gets
 * `ModelSpaceSkeleton` instead, which is the workspace's own shape at its own
 * size, so nothing moves at all when the chunk lands.
 */
function PageLoading({ what }: { what: string }) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center p-8" role="status" aria-live="polite">
      <p className="text-sm text-muted">Loading {what}…</p>
    </div>
  )
}

/**
 * The fallback for every lazy route, naming the tool it is fetching.
 *
 * `titleFor` is the same map that names the browser tab, so the message and
 * the tab agree — "Loading Beam Design…", not "Loading…". A generic spinner
 * on 60 different routes tells the reader only that something is happening;
 * this tells them the thing they clicked is the thing that is coming.
 */
function RouteLoading() {
  const { pathname } = useLocation()
  return <PageLoading what={routeName(pathname) ?? 'the page'} />
}
/**
 * Should the first-run question be on screen?
 *
 * Mounted at the app root rather than inside a page, because there is no single
 * entry point: people arrive on the home page, on a deep link to a calculator,
 * or on a bookmark, and the question is the same wherever they land.
 *
 * It is suppressed on the auth and legal routes. Somebody halfway through a
 * password reset, or reading the terms before they buy, is in the middle of
 * something with its own stakes, and a modal about sidebar preferences on top
 * of it is an interruption at the worst possible moment. They get asked on the
 * next ordinary page instead — the answer is not urgent.
 */
const NO_ASK_ROUTES = [
  '/signin', '/signup', '/forgot-password', '/reset-password',
  '/terms', '/privacy', '/refunds', '/contact',
]

export default function App() {
  const nav = useNavigate()
  // react-router does NOT reset scroll on a route change — that is left to the
  // app. Without this, leaving a page you had scrolled deep into drops you into
  // the middle of the next one. Keyed on pathname, so a query-string or hash
  // change (an in-page anchor) does not yank the viewport.
  const { pathname, search } = useLocation()
  useScrollTopOnChange(pathname)
  // GA4 counts SPA navigations — the initial load is counted by the gtag
  // snippet in index.html, so this skips its first render (see analytics.ts).
  usePageViews()

  // `dismissed` is local to this mount and separate from the stored answer.
  // Both closing paths write a preference, so the stored value alone would be
  // enough — this just avoids the dialog flickering for the render between the
  // click and the store update.
  const prefs = useToolPrefs()
  const [dismissed, setDismissed] = useState(false)
  // Stable identity: the dialog memoises its Escape handler on this, and an
  // inline arrow here would change every render, tearing the key listener down
  // and rebuilding it each time — quietly defeating the memo on the other side.
  const closePrefs = useCallback(() => { setDismissed(true) }, [])
  // The embed preview (the landing page's scaled-down Model Space iframe)
  // never asks: the question is about the real workbench's sidebar, and a
  // modal popping over the mini viewport is the preview interrupting the
  // marketing page it sits on. The answer is still collected on the next
  // ordinary page — nothing is lost by waiting.
  const embed = useMemo(() => isEmbedLocation({ pathname, search }), [pathname, search])
  const askPrefs = !hasAnswered(prefs) && !dismissed && !NO_ASK_ROUTES.includes(pathname) && !embed

  // Home carries its own hero navigation; every tool route lives inside the
  // workbench shell (sidebar + breadcrumb header + command palette).
  return (
    <>
      {askPrefs && <WelcomeDialog onClose={closePrefs} />}
      <Routes>
        <Route path="/" element={<Home onAuth={(m) => nav(m === 'signup' ? '/signup' : '/signin')} />} />
        <Route path="*" element={
          <AppShell>
            {/* ONE boundary for the whole inner table rather than 60. The
                nearest boundary wins, so `/model` keeps its own nested
                Suspense and still gets the workspace-shaped skeleton. */}
            <Suspense fallback={<RouteLoading />}>
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
        {/* RequireAuth OUTSIDE Suspense, so a signed-out visitor is redirected
            without the lazy chunk being fetched at all. Inside, the import
            starts before the gate has an answer. */}
        <Route path="/model" element={
          <RequireAuth>
            <Suspense fallback={<ModelSpaceSkeleton />}>
              <ModelSpace />
            </Suspense>
          </RequireAuth>
        } />
        <Route path="/truss" element={<RequireAuth><TrussSpace /></RequireAuth>} />
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
        <Route path="/lintel" element={<LintelDesign />} />
        <Route path="/wood-slab" element={<WoodSlab />} />
        <Route path="/micropile" element={<Micropile />} />
        <Route path="/slope" element={<SlopeStability />} />
        <Route path="/settlement" element={<Settlement />} />
        <Route path="/lateral-pile" element={<LateralPile />} />
        <Route path="/soils" element={<RequireAuth><SoilInvestigation /></RequireAuth>} />
        <Route path="/pricing" element={<Pricing />} />
        {/* Guest-only routes. A signed-in visitor reaching one — a stale
            bookmark, the back button after signing in, an old email link —
            gets sent home rather than a sign-in form that reads as "your
            login did not take". /reset-password stays open on purpose: it is
            opened by following a fresh recovery link, which a signed-in
            session says nothing about (see GuestOnly). */}
        <Route path="/signin" element={<GuestOnly><SignIn /></GuestOnly>} />
        <Route path="/signup" element={<GuestOnly><SignUp /></GuestOnly>} />
        <Route path="/forgot-password" element={<GuestOnly><ForgotPassword /></GuestOnly>} />
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
        {/* THE INNER TABLE NEEDS ITS OWN CATCH-ALL. The outer one mounts the
            shell for every address; without this, an address matching no tool
            rendered the sidebar and header over an EMPTY content area, which
            reads as a broken app rather than a wrong URL. */}
        <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
          </AppShell>
        } />
      </Routes>
    </>
  )
}
