import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { designSlabDDM, type SlabInput, type SlabDirResult, type SlabSectionSteel } from '../engine/slabDDM'
import { Num, Pick, Card, ResultCard, Row } from '../components/qty'
import { ReportControls } from '../components/ReportControls'
import { Math as KTex } from '../lib/math'
import { f0, f1, f2 } from '../lib/format'
import 'katex/dist/katex.min.css'

interface FormState {
  lx: number; ly: number
  colWidth: number
  D: number; L: number
  fc: number; fy: number
  h: number                // NaN = auto
  cover: number; barDia: number
  extX: 'yes' | 'no'
  extY: 'yes' | 'no'
  withBeams: 'yes' | 'no'
}

const DEFAULTS: FormState = {
  lx: 6, ly: 6, colWidth: 400,
  D: 5, L: 2,
  fc: 28, fy: 415,
  h: NaN,
  cover: 20, barDia: 12,
  extX: 'no', extY: 'no',
  withBeams: 'yes',
}

function steelText(s: SlabSectionSteel, db: number) {
  return `${s.bars}⌀${db} @${f0(s.spacing)} mm`
}
function steelSub(s: SlabSectionSteel) {
  return `As=${f0(s.As)} mm²${s.usedMin ? ' (T/S min)' : ''}`
}

function DirCard({ title, dir, barDia }: { title: string; dir: SlabDirResult; barDia: number }) {
  return (
    <ResultCard title={title}>
      <Row label="Span l₁" value={`${f2(dir.l1)} m`} sub={`l₂=${f2(dir.l2)} m`} />
      <Row label="Clear span lₙ" value={`${f2(dir.ln)} m`} />
      <Row label={<KTex tex="M_o" />} value={`${f1(dir.Mo)} kN·m`} />
      <Row label="d (effective)" value={`${f1(dir.d)} mm`} />
      <Row label="Column strip" value={`${f2(dir.csWidth)} m wide`} sub={`Middle: ${f2(dir.msWidth)} m`} />
      <div className="mt-2 overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-left uppercase tracking-wide text-slate-500">
              <th className="pb-1 pr-2 font-semibold">Location</th>
              <th className="pb-1 pr-2 font-semibold">M (kN·m)</th>
              <th className="pb-1 pr-2 font-semibold">Col strip</th>
              <th className="pb-1 font-semibold">Mid strip</th>
            </tr>
          </thead>
          <tbody>
            {dir.locations.map((loc) => (
              <tr key={loc.name} className="border-b border-slate-100 last:border-0">
                <td className="py-1 pr-2 font-medium text-slate-700">{loc.name}</td>
                <td className="py-1 pr-2 text-slate-600">{f1(loc.M)}</td>
                <td className="py-1 pr-2">
                  <div className="font-semibold text-slate-800">{steelText(loc.column, barDia)}</div>
                  <div className="text-slate-500">{steelSub(loc.column)}</div>
                </td>
                <td className="py-1">
                  {loc.middle.b > 0 ? (
                    <>
                      <div className="font-semibold text-slate-800">{steelText(loc.middle, barDia)}</div>
                      <div className="text-slate-500">{steelSub(loc.middle)}</div>
                    </>
                  ) : <span className="text-slate-500">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ResultCard>
  )
}

export default function SlabDesign() {
  const [f, setF] = useState<FormState>(DEFAULTS)
  const set = <K extends keyof FormState>(k: K) => (v: FormState[K]) => setF((s) => ({ ...s, [k]: v }))

  const input = useMemo((): SlabInput => ({
    lx: f.lx, ly: f.ly, colWidth: f.colWidth,
    D: f.D, L: f.L,
    fc: f.fc, fy: f.fy,
    h: Number.isFinite(f.h) ? f.h : undefined,
    cover: f.cover, barDia: f.barDia,
    exterior: { x: f.extX === 'yes', y: f.extY === 'yes' },
    withBeams: f.withBeams === 'yes',
  }), [f])

  const valid = useMemo(() => {
    const nums: (keyof FormState)[] = ['lx', 'ly', 'colWidth', 'D', 'L', 'fc', 'fy', 'cover', 'barDia']
    return nums.every((k) => Number.isFinite(f[k] as number)) && f.lx > 0 && f.ly > 0 && f.fc > 0 && f.fy > 0 && f.D >= 0 && f.L >= 0
  }, [f])

  const r = useMemo(() => (valid ? designSlabDDM(input) : null), [valid, input])

  const defl = r?.deflection

  return (
    <div className="mx-auto max-w-6xl p-6">
      <Link to="/" className="no-print text-sm text-[#0056b3] hover:underline">← Home</Link>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-[#0056b3]">Two-Way Slab Design</h1>
      <p className="no-print mt-1 text-slate-600">
        Direct Design Method — NSCP 2015 §408.10 / ACI 318-14 §8.10. Square or rectangular interior and end panels;
        column-strip / middle-strip flexure; temp/shrinkage minimum; §408.7.2.2 spacing; mid-panel deflection by
        crossing-strip method (Branson I_e).
      </p>
      <ReportControls title="Two-Way Slab Design Report" />

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* ── INPUTS ── */}
        <div className="space-y-5">
          <Card title="Panel geometry">
            <Num label={<>Span <KTex tex="l_x" /> (short)</>} unit="m" value={f.lx} onChange={set('lx')} />
            <Num label={<>Span <KTex tex="l_y" /> (long)</>} unit="m" value={f.ly} onChange={set('ly')} />
            <Num label="Column width" unit="mm" value={f.colWidth} onChange={set('colWidth')} />
          </Card>

          <Card title="Service loads">
            <Num label={<>Dead load <KTex tex="D" /></>} unit="kPa" value={f.D} onChange={set('D')} />
            <Num label={<>Live load <KTex tex="L" /></>} unit="kPa" value={f.L} onChange={set('L')} />
          </Card>

          <Card title="Materials">
            <Num label={<KTex tex="f'_c" />} unit="MPa" value={f.fc} onChange={set('fc')} />
            <Num label={<KTex tex="f_y" />} unit="MPa" value={f.fy} onChange={set('fy')} />
          </Card>

          <Card title="Detailing">
            <Num label="Thickness h (blank = auto)" unit="mm" value={f.h} onChange={set('h')} />
            <Num label="Clear cover" unit="mm" value={f.cover} onChange={set('cover')} />
            <Num label={<>Bar <KTex tex="d_b" /></>} unit="mm" value={f.barDia} onChange={set('barDia')} />
          </Card>

          <Card title="Span type">
            <Pick label="End span in x-dir?" value={f.extX} onChange={set('extX')}
              options={[['no', 'Interior (no disc. edge)'], ['yes', 'End span (one disc. edge)']]} />
            <Pick label="End span in y-dir?" value={f.extY} onChange={set('extY')}
              options={[['no', 'Interior (no disc. edge)'], ['yes', 'End span (one disc. edge)']]} />
            <Pick label="Beams on all edges?" value={f.withBeams} onChange={set('withBeams')}
              options={[['yes', 'Yes (grid beams)'], ['no', 'No (flat plate)']]} />
          </Card>
        </div>

        {/* ── RESULTS ── */}
        <div className="space-y-5 lg:sticky lg:top-6 lg:self-start">
          {r ? (
            <>
              {/* Summary */}
              <ResultCard title="Summary">
                {!r.applicable && (
                  <div className="mb-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    ⚠ DDM not fully applicable — review notes below.
                  </div>
                )}
                <Row label="Ratio l_y / l_x" value={f2(r.ratio)}
                  sub={r.twoWay ? 'two-way ✓' : 'one-way ✗'} />
                <Row label="Min. thickness h_min" value={`${Math.round(r.hmin)} mm`} />
                <Row label="Adopted thickness h" value={`${r.h} mm`}
                  alert={Number.isFinite(f.h) && f.h < r.hmin} />
                <Row label={<><KTex tex="w_u" /> (factored)</>} value={`${f1(r.wu)} kPa`} />
              </ResultCard>

              {/* DDM notes */}
              {r.notes.length > 0 && (
                <div className="space-y-1">
                  {r.notes.map((n, i) => (
                    <p key={i} className="rounded border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
                      {n}
                    </p>
                  ))}
                </div>
              )}

              {/* X direction */}
              <DirCard title={`Direction x (l₁ = ${f2(r.x.l1)} m)`} dir={r.x} barDia={f.barDia} />

              {/* Y direction */}
              <DirCard title={`Direction y (l₁ = ${f2(r.y.l1)} m)`} dir={r.y} barDia={f.barDia} />

              {/* Deflection */}
              {defl && (
                <ResultCard title="Deflection — §24.2 crossing-strip">
                  <Row label="Immediate (D+L)" value={`${f1(defl.immediate)} mm`} />
                  <Row label="Immediate live" value={`${f1(defl.immLive)} mm`}
                    alert={!defl.liveOK}
                    sub={`L/360 = ${f1(defl.limitLive)} mm${defl.liveOK ? ' ✓' : ' ✗'}`} />
                  <Row label={<>Long-term <KTex tex="\lambda_\Delta" /></>}
                    value={defl.lambdaDelta.toFixed(2)} sub="ξ=2.0, ρ′=0" />
                  <Row label="Long-term dead" value={`${f1(defl.longTerm)} mm`} />
                  <Row label="Total (LT dead + imm live)" value={`${f1(defl.total)} mm`}
                    alert={!defl.totalOK}
                    sub={`L/240 = ${f1(defl.limitTotal)} mm${defl.totalOK ? ' ✓' : ' ✗'}`} />
                  {defl.cracked && (
                    <p className="mt-1 text-xs text-slate-500">Slab cracks under service load — Branson I_e applied.</p>
                  )}
                </ResultCard>
              )}
            </>
          ) : (
            <p className="py-8 text-center text-sm text-slate-500">Enter valid panel inputs to see results.</p>
          )}
        </div>
      </div>
    </div>
  )
}
