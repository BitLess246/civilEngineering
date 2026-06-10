import { Routes, Route, Link } from 'react-router-dom'
import { factoredLoad, beta1 } from './engine/loads'
import FoundationDesign from './pages/FoundationDesign'
import PileCapDesign from './pages/PileCapDesign'
import CombinedFootingDesign from './pages/CombinedFootingDesign'

function Home() {
  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="text-3xl font-extrabold tracking-tight text-[#0056b3]">
        Civil Engineering — React preview
      </h1>
      <p className="mt-2 text-slate-600">
        New React&nbsp;+&nbsp;TypeScript app (Phase&nbsp;0). The calculation engine is being
        ported to typed modules; the UI migrates page&nbsp;by&nbsp;page.
      </p>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800">Engine smoke check</h2>
        <p className="mt-1 text-sm text-slate-600">
          P<sub>u</sub> = max(1.4D, 1.2D+1.6L), D=150, L=100 →{' '}
          <b>{factoredLoad({ dead: 150, live: 100 })} kN</b>
        </p>
        <p className="text-sm text-slate-600">
          β₁ at f′c = 35 MPa → <b>{beta1(35)}</b>
        </p>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          to="/foundation"
          className="inline-block rounded-lg bg-gradient-to-br from-[#0056b3] to-[#003f86] px-5 py-2.5 font-semibold text-white shadow-md transition hover:shadow-lg"
        >
          Foundation Design →
        </Link>
        <Link
          to="/pile-cap"
          className="inline-block rounded-lg bg-gradient-to-br from-[#0056b3] to-[#003f86] px-5 py-2.5 font-semibold text-white shadow-md transition hover:shadow-lg"
        >
          Pile Cap Design →
        </Link>
        <Link
          to="/combined"
          className="inline-block rounded-lg bg-gradient-to-br from-[#0056b3] to-[#003f86] px-5 py-2.5 font-semibold text-white shadow-md transition hover:shadow-lg"
        >
          Combined Footing →
        </Link>
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
    </Routes>
  )
}
