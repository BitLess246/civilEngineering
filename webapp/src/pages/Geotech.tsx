import { Link } from 'react-router-dom'
import { ALL_TOOLS } from '../lib/tools'

// ─────────────────────────────────────────────────────────────────────────
// The geotechnical index.
//
// This route used to BE four calculators stacked on one screen: Rankine earth
// pressure, Coulomb earth pressure, bearing capacity and infinite-slope
// stability. They answer unrelated questions, are reached from different
// points in a job, and none of them had room for a worked solution. They now
// live at /earth-pressure, /bearing-capacity and (the infinite slope) beside
// the method of slices at /slope, where a slope-stability method belongs.
//
// The route stays, as the index for the group — so an existing link still
// lands somewhere useful, and there is one page that says what each tool is
// for and when to reach for it.
// ─────────────────────────────────────────────────────────────────────────

/** What each tool answers, and when it is the right one. */
const WHEN: Record<string, string> = {
  '/earth-pressure':
    'Thrust on a wall from the soil behind it. Rankine for a smooth vertical wall and level fill; Coulomb when there is wall friction, an inclined face or a sloping backfill; Mononobe–Okabe for the seismic case.',
  '/bearing-capacity':
    'How much a shallow footing can carry before the soil shears. Meyerhof, Hansen or Vesić — named explicitly, because they disagree by design.',
  '/retaining-wall':
    'A whole cantilever wall: stability against overturning and sliding, bearing pressure, and the reinforcement in the stem, toe and heel.',
  '/slope':
    'Will the slope stand? Circular failure by the method of slices with a critical-circle search, plus the planar infinite-slope case for a shallow mantle.',
  '/settlement':
    'How far it will sink and how long that takes — immediate, consolidation and Schmertmann, layer by layer.',
  '/lateral-pile':
    'A pile pushed sideways: Broms for the ultimate load, p-y for the deflection and moment profile.',
  '/soil-nail':
    'Reinforcing an existing slope or excavation face in place, to FHWA GEC-7.',
  '/shotcrete-facing':
    'The facing that spans between soil nails — flexure and punching at the nail head.',
  '/micropile':
    'A small-diameter drilled pile: structural capacity of the bar and casing, and grout-to-ground bond.',
  '/rock-anchor':
    'A prestressed tendon anchored in rock — tendon capacity and bond length, to PTI.',
  '/soils':
    'The borehole log itself: SPT N-values, USCS classification and the layer properties every page above reads from.',
}

/** Order the index by how a job actually runs: site data, then the ground
 *  checks, then the things you build into it. */
const ORDER = [
  '/soils',
  '/bearing-capacity', '/settlement',
  '/earth-pressure', '/retaining-wall',
  '/slope', '/soil-nail', '/shotcrete-facing',
  '/lateral-pile', '/micropile', '/rock-anchor',
]

export default function Geotech() {
  const tools = ALL_TOOLS.filter((t) => t.group === 'Geotechnical' && t.to !== '/geotech')
  const sorted = [...tools].sort((a, b) => {
    const ia = ORDER.indexOf(a.to), ib = ORDER.indexOf(b.to)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
  })

  return (
    <main className="mx-auto max-w-[1100px] px-5 py-10 sm:px-7">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Geotechnical</p>
      <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-[#0056b3]">Geotechnical tools</h1>
      <p className="mt-2 max-w-3xl text-sm text-slate-600">
        Every calculation is closed-form and cross-checked against the{' '}
        <Link to="/validation" className="text-[#0056b3] underline">validation benchmarks</Link>.
        Soil properties entered on{' '}
        <Link to="/soils" className="text-[#0056b3] underline">Soil Investigation</Link>{' '}
        can be pulled into any of these with the layer picker, so a φ typed once is the φ used everywhere.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {sorted.map((t) => (
          <Link key={t.to} to={t.to}
            className="group rounded-lg border border-[#e3e1da] bg-white p-4 transition-colors hover:border-[#0f4c92]">
            <div className="flex items-baseline gap-2">
              <h2 className="text-[13.5px] font-bold text-[#0f1b2a] group-hover:text-[#0f4c92]">{t.name}</h2>
              <span className="font-mono text-[10px] text-[#a39d8d]">{t.sub}</span>
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-[#5c6675]">
              {WHEN[t.to] ?? t.sub}
            </p>
          </Link>
        ))}
      </div>

      <p className="mt-8 max-w-3xl text-[11px] text-slate-500">
        Earth pressure, bearing capacity and slope stability used to share this one page. They are
        now three separate tools, each with a step-by-step solution: a bearing pressure and a wall
        thrust are reached at different points in a job and have nothing to say to each other.
        These remain preliminary checks — use engineering judgement and a site-specific investigation.
      </p>
    </main>
  )
}
