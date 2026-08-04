import { useMemo, useState } from 'react'
import { designRetainingWall, type RetainingWallInput } from '../engine/retainingWall'
import { Num, Card, ResultCard, Row } from '../components/qty'
import { PageHeader, LetterheadCard, PrintReport, type LetterheadState } from '../components/calc'
import { RetainingWallSection } from '../components/RetainingWallSection'
import { WorkedSolution } from '../components/WorkedSolution'
import { buildRetainingWallSolution, retainingWallBarNote } from '../lib/retainingWallSolution'
import { initialLetterhead } from '../lib/letterhead'
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
  const [lh, setLh] = useState<LetterheadState>(() => initialLetterhead('RW-01 · Rev A'))
  const set = <K extends keyof FormState>(k: K) => (v: FormState[K]) =>
    setF((s) => ({ ...s, [k]: v }))

  const allFinite = REQUIRED.every((k) => Number.isFinite(f[k] as number))
    && Number.isFinite(f.q_sur)

  // `f` is a fresh object every render, so memoize on its VALUE identity
  const fKey = JSON.stringify(f)
  const r = useMemo(
    () => (allFinite ? designRetainingWall(f) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fKey, allFinite],
  )

  return (
    <div>
      <PageHeader title="Cantilever Retaining Wall" badges={['NSCP 2015', 'ACI 318-14']} />
      <div className="mx-auto max-w-[1500px] px-5 pb-8 sm:px-7">

      {/* The section drawing carries what the numbers cannot: which FACE each
          mat of bars goes on, and where the two thrust resultants act. */}
      {r && (
        <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4 print-avoid-break">
          <RetainingWallSection
            Hs={f.Hs} tb={f.tb} ts={f.ts} bt={f.bt} bh={f.bh}
            Pa={r.Pa} Pq={r.Pq} q_sur={f.q_sur}
            H={r.H} B={r.B}
            q_max={r.q_max} q_min={r.q_min} xbar={r.xbar} e={r.e}
            bars={retainingWallBarNote(f, r)}
          />
        </div>
      )}

      <div className="no-print mt-5 grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(340px,1fr)]">
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
              <Row label="Vu (factored)"      value={`${f1(r.Vu_stem)} kN/m`} sub="1.6H per §5.3.1(e)" />
              <Row label="φVc"                value={`${f1(r.Vc_stem)} kN/m`} alert={!r.shearOK} />
              <Row label="Mu (factored)"      value={`${f1(r.Mu_stem)} kN·m/m`} />
              <Row label="As required"        value={`${f1(r.As_stem)} mm²/m`} />
              <Row label="As minimum"         value={`${f1(r.As_min)} mm²/m`} />
              <Row label="As design"          value={`${f1(r.As_design)} mm²/m`} />
              <Row label="Vertical bars (earth face)"
                value={`⌀${f.barDia} @ ${f1(r.s_stem)} mm`}
                sub={`provides ${f1(r.As_stem_prov)} mm²/m · s,max ${f1(r.s_stem_max)} mm`} />
              <Row label="Horizontal bars"
                value={`⌀${f.barDia} @ ${f1(r.s_horiz)} mm`}
                sub={`§11.6.1 ρt = 0.0020 → ${f1(r.As_horiz)} mm²/m`} />
            </ResultCard>

            <ResultCard title="Base Slab — factored pressure">
              <Row label="ΣVu"        value={`${f1(r.sumVu)} kN/m`} sub="1.2D + 1.6L" />
              <Row label="x̄u from toe" value={`${f2(r.xbar_u)} m`} />
              <Row label="qu at toe"  value={`${f1(r.qu_toe)} kPa`} />
              <Row label="qu at heel" value={`${f1(r.qu_heel)} kPa`}
                sub={r.uplift_u ? 'triangular block — resultant outside the middle third' : undefined}
                alert={r.uplift_u} />
            </ResultCard>

            <ResultCard title="Toe (bottom steel)">
              <Row label="Projection"     value={`${f2(r.toe.L)} m`} />
              <Row label="Mu at stem face" value={`${f1(r.toe.Mu)} kN·m/m`} />
              <Row label="Vu at d from face" value={`${f1(r.toe.Vu)} kN/m`} />
              <Row label="φVc"            value={`${f1(r.toe.phiVc)} kN/m`} alert={!r.toe.shearOK} />
              <Row label="As design"      value={`${f1(r.toe.As_design)} mm²/m`}
                sub={r.toe.As_min >= r.toe.As ? '§7.6.1.1 minimum governs' : 'flexure governs'} />
              <Row label="Bars"           value={`⌀${f.barDiaBase ?? f.barDia} @ ${f1(r.toe.spacing)} mm`}
                sub={`provides ${f1(r.toe.As_prov)} mm²/m`} />
            </ResultCard>

            <ResultCard title="Heel (top steel)">
              <Row label="Projection"      value={`${f2(r.heel.L)} m`} />
              <Row label="Mu at stem face" value={`${f1(r.heel.Mu)} kN·m/m`} />
              <Row label="Vu at face"      value={`${f1(r.heel.Vu)} kN/m`} />
              <Row label="φVc"             value={`${f1(r.heel.phiVc)} kN/m`} alert={!r.heel.shearOK} />
              <Row label="As design"       value={`${f1(r.heel.As_design)} mm²/m`}
                sub={r.heel.As_min >= r.heel.As ? '§7.6.1.1 minimum governs' : 'flexure governs'} />
              <Row label="Bars"            value={`⌀${f.barDiaBase ?? f.barDia} @ ${f1(r.heel.spacing)} mm`}
                sub={`provides ${f1(r.heel.As_prov)} mm²/m`} />
              <Row label="Temperature steel"
                value={`⌀${f.barDiaBase ?? f.barDia} @ ${f1(r.s_temp_base)} mm`}
                sub={`§24.4.3.2 → ${f1(r.As_temp_base)} mm²/m`} />
            </ResultCard>
          </div>
        ) : (
          <p className="self-start rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
            Fill in all inputs to see results.
          </p>
        )}
      </div>
      {r && <WorkedSolution steps={buildRetainingWallSolution(f, r)} />}

      <div className="no-print mt-5"><LetterheadCard lh={lh} onChange={(patch) => setLh((v) => ({ ...v, ...patch }))} /></div>
      {r && (
        <PrintReport
          docTitle="Cantilever Retaining Wall" docCode="RW-01" badges={['NSCP 2015', 'ACI 318-14']}
          ok={r.stableSL && r.stableOT && r.bearingOK && r.tensionOK && r.shearOK && r.toe.shearOK && r.heel.shearOK}
          governing={`FS sliding ${f2(r.FS_SL)} · FS overturning ${f2(r.FS_OT)} · q,max ${f1(r.q_max)} kPa`}
          lh={lh}
          stats={[
            // B and H are ALREADY in metres — dividing by 1000 again printed
            // a 2.3 m base as "0.00 m" on every report this page produced.
            { label: 'Base width B', value: f2(r.B), unit: 'm' },
            { label: 'Total height H', value: f2(r.H), unit: 'm' },
            { label: 'q,max', value: f1(r.q_max), unit: 'kPa' },
          ]}
          checks={[
            { name: 'Sliding (FS req 1.5 / FS)', ratio: 1.5 / r.FS_SL, ok: r.stableSL },
            { name: 'Overturning (FS req 2.0 / FS)', ratio: 2.0 / r.FS_OT, ok: r.stableOT },
            { name: 'Bearing q,max / qa', ratio: r.q_max / f.qa, ok: r.bearingOK },
            { name: 'Stem shear Vu / φVc', ratio: r.Vu_stem / r.Vc_stem, ok: r.shearOK },
            { name: 'Toe shear Vu / φVc', ratio: r.toe.Vu / r.toe.phiVc, ok: r.toe.shearOK },
            { name: 'Heel shear Vu / φVc', ratio: r.heel.Vu / r.heel.phiVc, ok: r.heel.shearOK },
          ]}
          data={[
            ['Stem height Hs', `${f.Hs} mm`], ['Base thickness tb', `${f.tb} mm`],
            ['Stem thickness ts', `${f.ts} mm`], ['Toe / heel', `${f.bt} / ${f.bh} mm`],
            ['Soil γs / φ', `${f.gamma_s} kN/m³ / ${f.phi_deg}°`], ['Surcharge', `${f.q_sur} kPa`],
            ['Friction μ', `${f.mu}`], ['Allowable qa', `${f.qa} kPa`],
            ["Concrete f'c / fy", `${f.fc} / ${f.fy} MPa`], ['Ka (Rankine)', `${f3(r.Ka)}`],
            ['Active thrust Pa + Pq', `${f1(r.Pa)} + ${f1(r.Pq)} kN/m`], ['Stem Mu', `${f1(r.Mu_stem)} kN·m/m`],
          ]}
        />
      )}
      </div>
    </div>
  )
}
