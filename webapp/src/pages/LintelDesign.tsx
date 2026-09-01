import { useState } from 'react'
import { designLintel } from '../engine/lintel'
import { ReportControls } from '../components/ReportControls'
import { LintelElevation } from '../components/LintelElevation'
import { BeamSchematic } from '../components/BeamSchematic'
import { PageHeader } from '../components/calc'

function num(v: string, d = 0): number { const n = parseFloat(v); return Number.isFinite(n) ? n : d }
const f2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '—')
const f0 = (n: number) => (Number.isFinite(n) ? Math.round(n).toString() : '—')

function Field({ label, value, onChange, unit, step = 'any' }: {
  label: string; value: number; onChange: (v: number) => void; unit?: string; step?: string
}) {
  return (
    <label className="flex flex-col text-sm">
      <span className="mb-1 font-medium text-slate-600">{label}{unit ? ` (${unit})` : ''}</span>
      <input type="number" step={step} value={value} onChange={(e) => onChange(num(e.target.value))}
        className="rounded-md border border-slate-300 px-2.5 py-1.5" />
    </label>
  )
}

function Out({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-baseline justify-between border-t border-slate-100 py-1 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={`font-mono font-medium ${ok === undefined ? 'text-slate-800' : ok ? 'text-emerald-600' : 'text-red-600'}`}>{value}</span>
    </div>
  )
}

export default function LintelDesign() {
  const [opening, setOpening] = useState(2.0)
  const [bearing, setBearing] = useState(200)
  const [b, setB] = useState(200)
  const [h, setH] = useState(300)
  const [cover, setCover] = useState(40)
  const [barDia, setBarDia] = useState(12)
  const [stirrupDia, setStirrupDia] = useState(10)
  const [fc, setFc] = useState(21)
  const [fy, setFy] = useState(415)
  const [wallThickness, setWallThickness] = useState(150)
  const [wallHeightAbove, setWallHeightAbove] = useState(2.4)
  const [wallUnitWeight, setWallUnitWeight] = useState(21)
  const [archAngleDeg, setArchAngleDeg] = useState(60)
  const [udlAbove, setUdlAbove] = useState(0)
  const [live, setLive] = useState(0)

  const input = {
    opening, bearing, b, h, cover, barDia, stirrupDia, fc, fy,
    wallThickness, wallHeightAbove, wallUnitWeight, archAngleDeg, udlAbove, live,
  }
  const r = designLintel(input)
  const d = r.design
  const bars = `${d.bars}-⌀${barDia}`
  // §409.6.3.1: below φVc/2 the code asks for no shear steel at all. Printing
  // "⌀10 @ 0 mm" for that is a spacing nobody can build; say what the check
  // actually found, and say what practice does about it.
  const stirrups = d.sAdopt > 0
    ? `⌀${stirrupDia} @ ${f0(d.sAdopt)} mm`
    : 'not required (Vu ≤ φVc/2)'

  const report = {
    docCode: 'S-LT',
    ok: r.ok,
    governing: r.loads.arching
      ? `arching triangle · ${f2(r.loads.masonry)} kN of wall over a ${f2(r.span)} m span`
      : `NO arch — the whole rectangle, ${f2(r.loads.masonry)} kN over a ${f2(r.span)} m span`,
    stats: [
      { label: 'Main steel', value: bars, unit: '' },
      { label: 'Design moment', value: f2(r.Mu), unit: 'kN·m' },
      { label: 'Stirrups', value: d.sAdopt > 0 ? `⌀${stirrupDia} @${f0(d.sAdopt)}` : 'none req.', unit: d.sAdopt > 0 ? 'mm' : '' },
    ],
    checks: [
      { name: 'Flexure Mu/φMn', ratio: d.phiMnMax > 0 ? r.Mu / d.phiMnMax : 0, ok: d.flexOK },
      { name: 'Bearing on jamb', ratio: r.bearingLimit > 0 ? r.bearingStress / r.bearingLimit : 0, ok: r.bearingOK },
    ],
    data: [
      ['Clear opening', `${f2(opening)} m`],
      ['Bearing each end', `${bearing} mm`],
      ['Effective span (§6.3.2.1)', `${f2(r.span)} m`],
      ['Lintel section', `${b} × ${h} mm`],
      ['Wall thickness / height above', `${wallThickness} mm / ${f2(wallHeightAbove)} m`],
      ['Masonry unit weight', `${f2(wallUnitWeight)} kN/m³`],
      ['Arch base angle', `${f0(archAngleDeg)}°`],
      ['Arch forms?', r.loads.arching ? `yes — triangle ${f2(r.loads.triangleHeight)} m tall` : 'no — wall too short'],
      ['Masonry on the lintel', `${f2(r.loads.masonry)} kN`],
      ['Lintel self weight', `${f2(r.loads.selfWeight)} kN/m`],
      ...(r.loads.udlArched > 0
        ? [['Load carried round by the arch', `${f2(r.loads.udlArched)} kN/m`] as [string, string]]
        : []),
      ['Design moment Mu', `${f2(r.Mu)} kN·m`],
      ['Design shear Vu', `${f2(r.Vu)} kN`],
      ['As required', `${f0(d.As)} mm²`],
      ['Bearing stress', `${f2(r.bearingStress)} / ${f2(r.bearingLimit)} MPa`],
    ] as [string, string][],
    steps: [],
  }

  return (
    <div>
      <PageHeader title="Lintel beam over an opening" badges={['NSCP 2015', 'ACI 318-14']} />
      <main className="mx-auto max-w-3xl px-5 py-6">
        <ReportControls title="Lintel Design" badges={['NSCP 2015', 'ACI 318-14']} report={report} />
        <p className="mt-2 text-sm text-slate-600">
          A lintel is an ordinary RC beam; what makes it its own calculation is the load.
          Masonry over an opening <strong>arches</strong>: a triangle of wall bears on the lintel and
          the rest is carried round to the jambs — unless the wall above is too short for the arch to
          close, when the whole rectangle comes down instead. That case is decided here from the
          geometry rather than left to be remembered.
        </p>

        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-[1.05rem] font-bold text-[#0056b3]">Opening &amp; lintel</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Clear opening" unit="m" value={opening} onChange={setOpening} />
            <Field label="Bearing each end" unit="mm" value={bearing} onChange={setBearing} />
            <Field label="Width b" unit="mm" value={b} onChange={setB} />
            <Field label="Depth h" unit="mm" value={h} onChange={setH} />
          </div>
          <h2 className="mb-3 mt-5 text-[1.05rem] font-bold text-[#0056b3]">The wall it carries</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Wall thickness" unit="mm" value={wallThickness} onChange={setWallThickness} />
            <Field label="Wall height above" unit="m" value={wallHeightAbove} onChange={setWallHeightAbove} />
            <Field label="Masonry unit wt" unit="kN/m³" value={wallUnitWeight} onChange={setWallUnitWeight} />
            <Field label="Arch base angle" unit="°" value={archAngleDeg} onChange={setArchAngleDeg} />
            <Field label="Other dead line load" unit="kN/m" value={udlAbove} onChange={setUdlAbove} />
            <Field label="Live line load" unit="kN/m" value={live} onChange={setLive} />
          </div>
          <h2 className="mb-3 mt-5 text-[1.05rem] font-bold text-[#0056b3]">Materials</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="f′c" unit="MPa" value={fc} onChange={setFc} />
            <Field label="fy" unit="MPa" value={fy} onChange={setFy} />
            <Field label="Main bar Ø" unit="mm" value={barDia} onChange={setBarDia} />
            <Field label="Stirrup Ø" unit="mm" value={stirrupDia} onChange={setStirrupDia} />
            <Field label="Cover" unit="mm" value={cover} onChange={setCover} />
          </div>
        </section>

        <section data-pdf-drawing className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm
          [background-image:linear-gradient(#f0eee7_1px,transparent_1px),linear-gradient(90deg,#f0eee7_1px,transparent_1px)] [background-size:22px_22px]">
          <h2 className="mb-3 text-[1.05rem] font-bold text-[#0056b3]">Elevation — what reaches the lintel</h2>
          <LintelElevation
            opening={opening} span={r.span} bearing={bearing} b={b} h={h}
            wallHeightAbove={wallHeightAbove} triangleHeight={r.loads.triangleHeight}
            arching={r.loads.arching} masonry={r.loads.masonry}
            bars={d.sAdopt > 0 ? `${bars} · ⌀${stirrupDia} @${f0(d.sAdopt)}` : bars} />
          <div className="mt-3 border-t border-slate-100 pt-3">
            <p className="mb-1 text-[11px] font-semibold text-[#0f4c92]">SECTION</p>
            <BeamSchematic b={b} h={h} cover={cover} barDia={barDia} stirrupDia={stirrupDia}
              bars={d.bars} d={d.d} layers={d.layers} comprLayers={d.comprLayers}
              comprBars={d.comprBars} comprBarDia={16} naDepth={d.cNA} flexOK={d.flexOK} />
          </div>
        </section>

        <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-1 text-[1.05rem] font-bold text-[#0056b3]">Results</h2>
          <Out label="Effective span (§6.3.2.1)" value={`${f2(r.span)} m`} />
          <Out label="Arch forms" value={r.loads.arching ? `yes — ${f2(r.loads.triangleHeight)} m triangle` : 'no — whole rectangle bears'}
            ok={r.loads.arching} />
          <Out label="Masonry on the lintel" value={`${f2(r.loads.masonry)} kN`} />
          <Out label="Design moment Mu" value={`${f2(r.Mu)} kN·m`} />
          <Out label="Design shear Vu" value={`${f2(r.Vu)} kN`} />
          <Out label="As required" value={`${f0(d.As)} mm²`} />
          <Out label="Bars" value={bars} ok={d.flexOK} />
          <Out label="Stirrups" value={stirrups} />
          {d.sAdopt === 0 && (
            <p className="pt-1 text-[11px] text-slate-500">
              The shear is under half the concrete's own capacity, so §409.6.3.1 requires no
              stirrups. A lintel is normally given nominal ties anyway, for the cage — that is a
              practice decision, not this check.
            </p>
          )}
          <Out label="Bearing stress" value={`${f2(r.bearingStress)} ≤ ${f2(r.bearingLimit)} MPa`} ok={r.bearingOK} />
          {r.notes.length > 0 && (
            <ul className="mt-3 list-disc space-y-1 rounded border border-amber-200 bg-amber-50 px-4 py-2 text-[12.5px] text-amber-900">
              {r.notes.map((n, k) => <li key={k}>{n}</li>)}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}
