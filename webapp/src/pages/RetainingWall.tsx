import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { designRetainingWall, type RetainingWallInput } from '../engine/retainingWall'
import { Num, Card, ResultCard, Row } from '../components/qty'
import { ReportControls } from '../components/ReportControls'
import { f1, f2, f3 } from '../lib/format'

type FormState = RetainingWallInput & { gamma_c: number }

const DEFAULTS: FormState = {
  Hs: 3000, tb: 500, ts: 300, bt: 500, bh: 1500,
  gamma_s: 18, phi_deg: 30, q_sur: 0, mu: 0.5, qa: 200,
  fc: 28, fy: 415, cover: 75, barDia: 16, gamma_c: 23.6,
}

const REQUIRED: (keyof FormState)[] = [
  'Hs', 'tb', 'ts', 'bt', 'bh',
  'gamma_s', 'phi_deg', 'mu', 'qa',
  'fc', 'fy', 'cover', 'barDia', 'gamma_c',
]

function Status({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
      {ok ? '✓' : '✗'} {label}
    </span>
  )
}

export default function RetainingWall() {
  const [f, setF] = useState<FormState>(DEFAULTS)
  const set = <K extends keyof FormState>(k: K) => (v: FormState[K]) =>
    setF((s) => ({ ...s, [k]: v }))

  const allFinite = REQUIRED.every((k) => Number.isFinite(f[k] as number))
    && Number.isFinite(f.q_sur)

  const r = useMemo(
    () => (allFinite ? designRetainingWall(f) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(f), allFinite],
  )

  return (
    <div className="mx-auto max-w-6xl p-6">
      <Link to="/" className="no-print text-sm text-[#0056b3] hover:underline">← Home</Link>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-[#0056b3]">
        Retaining Wall Design
      </h1>
      <p className="no-print mt-1 text-slate-600">
        Cantilever RC retaining wall — Rankine active pressure, NSCP 2015 stability checks,
        ACI 318-14 stem design. All forces per metre of wall length.
      </p>
      <ReportControls title="Retaining Wall Design" />

      {/* Schematic legend */}
      <pre className="no-print mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[0.65rem] leading-tight text-slate-500">
{`         |← ts →|
         +-------+  ← top (Hs)
         | stem  |
─────────+───────+──────────  ← top of base
|← bt →|← ts →|←── bh ──→|
|           base  (tb)      |`}
      </pre>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* ── INPUTS ── */}
        <div className="flex flex-col gap-6">
          <Card title="Geometry (mm)">
            <Num label="Stem height Hs"    unit="mm" value={f.Hs}  onChange={set('Hs')} />
            <Num label="Base thickness tb" unit="mm" value={f.tb}  onChange={set('tb')} />
            <Num label="Stem width ts"     unit="mm" value={f.ts}  onChange={set('ts')} />
            <Num label="Toe projection bt" unit="mm" value={f.bt}  onChange={set('bt')} />
            <Num label="Heel projection bh" unit="mm" value={f.bh} onChange={set('bh')} />
          </Card>

          <Card title="Soil Parameters">
            <Num label="γs — soil unit weight" unit="kN/m³" value={f.gamma_s} onChange={set('gamma_s')} />
            <Num label="φ — friction angle"    unit="°"     value={f.phi_deg} onChange={set('phi_deg')} />
            <Num label="Surcharge q"           unit="kPa"   value={f.q_sur}   onChange={set('q_sur')} />
            <Num label="μ — base friction"     value={f.mu}                   onChange={set('mu')} />
            <Num label="qa — allowable bearing" unit="kPa"  value={f.qa}      onChange={set('qa')} />
          </Card>

          <Card title="Concrete &amp; Steel">
            <Num label="f'c"              unit="MPa" value={f.fc}      onChange={set('fc')} />
            <Num label="fy"               unit="MPa" value={f.fy}      onChange={set('fy')} />
            <Num label="Cover (stem)"     unit="mm"  value={f.cover}   onChange={set('cover')} />
            <Num label="Main bar ⌀"       unit="mm"  value={f.barDia}  onChange={set('barDia')} />
            <Num label="γc — concrete unit weight" unit="kN/m³" value={f.gamma_c} onChange={set('gamma_c')} />
          </Card>
        </div>

        {/* ── RESULTS ── */}
        {r ? (
          <div className="flex flex-col gap-6">
            <ResultCard title="Summary">
              <div className="flex flex-wrap gap-2 pb-2">
                <Status ok={r.stableOT}  label={`OT FS=${f2(r.FS_OT)}`} />
                <Status ok={r.stableSL}  label={`SL FS=${f2(r.FS_SL)}`} />
                <Status ok={r.bearingOK} label={`Bearing ${f1(r.q_max)} kPa`} />
                <Status ok={r.tensionOK} label={r.tensionOK ? 'No tension' : 'Heel tension!'} />
                <Status ok={r.shearOK}   label="Stem shear" />
              </div>
              <Row label="Base width B"      value={`${f2(r.B)} m`} />
              <Row label="Retained height H" value={`${f2(r.H)} m`} />
              <Row label="Ka (Rankine)"      value={f3(r.Ka)} />
            </ResultCard>

            <ResultCard title="Earth Pressure">
              <Row label="Active Pa = ½Ka·γs·H²" value={`${f1(r.Pa)} kN/m`} />
              <Row label="Surcharge Pq = Ka·q·H"  value={`${f1(r.Pq)} kN/m`} />
              <Row label="Total Fh"               value={`${f1(r.Fh)} kN/m`} />
              <Row label="Overturning MO"         value={`${f1(r.MO)} kN·m/m`} />
            </ResultCard>

            <ResultCard title="Vertical Loads">
              <Row label="W_stem" value={`${f1(r.W_stem)} kN/m`} sub={`arm ${f2(r.arm_stem)} m`} />
              <Row label="W_base" value={`${f1(r.W_base)} kN/m`} sub={`arm ${f2(r.arm_base)} m`} />
              <Row label="W_soil" value={`${f1(r.W_soil)} kN/m`} sub={`arm ${f2(r.arm_soil)} m`} />
              {r.W_sur > 0 && <Row label="W_sur" value={`${f1(r.W_sur)} kN/m`} sub={`arm ${f2(r.arm_sur)} m`} />}
              <Row label="ΣV"             value={`${f1(r.sumV)} kN/m`} />
              <Row label="Restoring MR"   value={`${f1(r.MR)} kN·m/m`} />
            </ResultCard>

            <ResultCard title="Stability Checks">
              <Row label="FS overturning (≥ 2.0)" value={f2(r.FS_OT)} alert={!r.stableOT} />
              <Row label="FS sliding (≥ 1.5)"     value={f2(r.FS_SL)} alert={!r.stableSL} />
            </ResultCard>

            <ResultCard title="Bearing Pressure">
              <Row label="Resultant x̄ from toe" value={`${f2(r.xbar)} m`} />
              <Row label="Eccentricity e"        value={`${f3(r.e)} m`} sub={`B/6 = ${f3(r.B/6)} m`} />
              <Row label="q_max (toe)"
                value={`${f1(r.q_max)} kPa`}
                sub={`qa = ${f.qa} kPa`}
                alert={!r.bearingOK} />
              <Row label="q_min (heel)"
                value={`${f1(r.q_min)} kPa`}
                alert={!r.tensionOK} />
            </ResultCard>

            <ResultCard title="Stem Design (at base)">
              <Row label="Effective depth d"  value={`${f1(r.d_stem)} mm`} />
              <Row label="Vu (shear demand)"  value={`${f1(r.Vu_stem)} kN/m`} />
              <Row label="φVc"                value={`${f1(r.Vc_stem)} kN/m`} alert={!r.shearOK} />
              <Row label="Mu (moment demand)" value={`${f1(r.Mu_stem)} kN·m/m`} />
              <Row label="As required"        value={`${f1(r.As_stem)} mm²/m`} />
              <Row label="As minimum"         value={`${f1(r.As_min)} mm²/m`} />
              <Row label="As design"          value={`${f1(r.As_design)} mm²/m`} />
            </ResultCard>
          </div>
        ) : (
          <p className="self-start rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
            Fill in all inputs to see results.
          </p>
        )}
      </div>
    </div>
  )
}
