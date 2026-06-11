import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { designBeam, type BeamDesignInput } from '../engine/beamDesign'
import { BeamSchematic } from '../components/BeamSchematic'
import { ReportControls } from '../components/ReportControls'
import { WorkedSolution } from '../components/WorkedSolution'
import { buildBeamSolution } from '../lib/beamSolution'
import { Num, Card, ResultCard, Row } from '../components/qty'
import { Math } from '../lib/math'
import { f0, f1 } from '../lib/format'
import 'katex/dist/katex.min.css'

interface FormState extends BeamDesignInput { fyt: number; legs: number; comprBarDia: number }

const DEFAULTS: FormState = {
  b: 300, h: 500, cover: 40, barDia: 20, comprBarDia: 16, stirrupDia: 10,
  fc: 28, fy: 415, fyt: 415, Mu: 180, Vu: 150, legs: 2,
}

const REGION: Record<string, string> = {
  none: 'No stirrups required',
  minimum: 'Minimum stirrups',
  designed: 'Stirrups designed',
  inadequate: '⚠ Section inadequate',
}

export default function BeamDesign() {
  const [f, setF] = useState<FormState>(DEFAULTS)
  const set = <K extends keyof FormState>(k: K) => (v: FormState[K]) => setF((s) => ({ ...s, [k]: v }))

  const valid = useMemo(() => {
    const keys: (keyof FormState)[] = ['b', 'h', 'cover', 'barDia', 'stirrupDia', 'fc', 'fy', 'fyt', 'Mu', 'Vu', 'legs']
    return keys.every((k) => Number.isFinite(f[k] as number)) && f.b > 0 && f.h > 0 && f.fc > 0 && f.fy > 0
      && f.h - f.cover - f.stirrupDia - f.barDia / 2 > 0
  }, [f])

  const r = useMemo(() => (valid ? designBeam(f) : null), [f, valid])
  const solution = useMemo(() => (r ? buildBeamSolution(f, r) : null), [f, r])

  const stirrupText = r
    ? r.region === 'designed' || r.region === 'minimum'
      ? `⌀${f.stirrupDia} ${f.legs}-leg @ ${f0(r.sAdopt)} mm`
      : r.region === 'none' ? '— none' : '⚠ enlarge'
    : '—'

  return (
    <div className="mx-auto max-w-6xl p-6">
      <Link to="/" className="no-print text-sm text-[#0056b3] hover:underline">← Home</Link>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-[#0056b3]">Beam Design</h1>
      <p className="no-print mt-1 text-slate-600">
        Rectangular RC beam — SRRB/DRRB flexure (compression steel designed automatically beyond the
        tension-controlled ceiling at ρ_max = (0.85f′c/fy·β₁)(3/8)(dt/d)), §407.7 bar layout with automatic
        layering (Varignon d), and one-way shear. NSCP 2015 / ACI 318-14.
      </p>
      <ReportControls title="Beam Design Report" />

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <Card title="Section">
            <Num label="Width b" unit="mm" value={f.b} onChange={set('b')} />
            <Num label="Total depth h" unit="mm" value={f.h} onChange={set('h')} />
            <Num label="Clear cover" unit="mm" value={f.cover} onChange={set('cover')} />
            <Num label={<>Bar <Math tex="d_b" /></>} unit="mm" value={f.barDia} onChange={set('barDia')} />
            <Num label={<>Compr. bar <Math tex="d_b'" /></>} unit="mm" value={f.comprBarDia} onChange={set('comprBarDia')} />
            <Num label={<>Stirrup <Math tex="d_s" /></>} unit="mm" value={f.stirrupDia} onChange={set('stirrupDia')} />
            <Num label="Stirrup legs" value={f.legs} onChange={set('legs')} />
          </Card>
          <Card title="Materials">
            <Num label={<Math tex="f'_c" />} unit="MPa" value={f.fc} onChange={set('fc')} />
            <Num label={<Math tex="f_y" />} unit="MPa" value={f.fy} onChange={set('fy')} />
            <Num label={<Math tex="f_{yt}" />} unit="MPa" value={f.fyt} onChange={set('fyt')} />
          </Card>
          <Card title="Factored demands">
            <Num label={<Math tex="M_u" />} unit="kN·m" value={f.Mu} onChange={set('Mu')} />
            <Num label={<Math tex="V_u" />} unit="kN" value={f.Vu} onChange={set('Vu')} />
          </Card>
        </div>

        <div className="space-y-5 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-[1.02rem] font-bold text-[#0056b3]">Section preview</h2>
            {r ? (
              <BeamSchematic b={f.b} h={f.h} cover={f.cover} barDia={f.barDia} stirrupDia={f.stirrupDia}
                bars={r.bars} d={r.d} layers={r.layers} comprBars={r.comprBars} comprBarDia={f.comprBarDia} />
            ) : (
              <p className="py-8 text-center text-sm text-slate-400">Enter a valid section (d must be positive).</p>
            )}
          </div>

          {r && (
            <ResultCard title="Results">
              {!r.flexOK && (
                <Row label="⚠ Section" value="too small for the steel"
                  sub="layout diverges — enlarge b or h" />
              )}
              <Row label="Effective depth d" value={`${f1(r.d)} mm`}
                sub={r.layers.length > 1 ? `dt=${f1(r.dt)} · ȳ=${f1(r.yBar)} mm` : undefined} />
              <Row label="Flexure mode" value={r.mode}
                sub={`φMn,max=${f1(r.phiMnMax)} kN·m`} />
              <Row label="Tension steel" value={`${r.bars} ⌀${f.barDia} mm`}
                sub={`As=${f0(r.As)} mm² · ${r.usedMin ? 'ρ_min' : `ρ=${r.rho.toFixed(4)}`}`} />
              <Row label="Layers" value={r.layers.length > 1 ? `${r.layers.length} (${r.layers.join(' + ')})` : '1'}
                sub={`s_clear=${f0(r.sClear)} ≥ ${f0(r.sMinClear)} mm`} />
              {r.mode === 'DRRB' && (
                <Row label="Compression steel" value={`${r.comprBars} ⌀${f.comprBarDia} mm`}
                  sub={`A's=${f0(r.AsPrime)} mm² · f's=${f1(r.fsPrime)} MPa${r.fsYields ? '' : ' (n.y.)'}`} />
              )}
              <Row label={<Math tex="\phi V_c" />} value={`${f1(r.phiVc)} kN`} sub={`Vc=${f1(r.Vc)}`} />
              <Row label="Shear" value={REGION[r.region]} />
              <Row label="Stirrups" value={stirrupText}
                sub={r.region === 'designed' ? `s_req=${f0(r.sReq)} · s_max=${f0(r.sMax)} mm` : undefined} />
            </ResultCard>
          )}
        </div>
      </div>

      {solution && <WorkedSolution steps={solution} />}
    </div>
  )
}
