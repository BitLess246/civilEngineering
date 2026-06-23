import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { designPunchingShear, type PunchingInput, type ColPosition } from '../engine/punchingShear'
import { Num, Pick, Card, ResultCard, Row } from '../components/qty'
import { ReportControls } from '../components/ReportControls'
import { f0, f1, f2, f3 } from '../lib/format'

interface FormState {
  c1: number; c2: number         // column dimensions, mm
  h: number                      // slab thickness, mm
  cover: number; barDia: number  // for effective depth
  fc: number
  lambda: '1' | '0.75'
  Vu: number
  position: ColPosition
}

const DEFAULTS: FormState = {
  c1: 500, c2: 500,
  h: 200, cover: 25, barDia: 16,
  fc: 28,
  lambda: '1',
  Vu: 500,
  position: 'interior',
}

const POS_OPTS: [ColPosition, string][] = [
  ['interior', 'Interior — αs = 40'],
  ['edge',     'Edge — αs = 30  (c1 ∥ free edge)'],
  ['corner',   'Corner — αs = 20'],
]

const REQUIRED: (keyof FormState)[] = ['c1', 'c2', 'h', 'cover', 'barDia', 'fc', 'Vu']

export default function PunchingShear() {
  const [f, setF] = useState<FormState>(DEFAULTS)
  const set = <K extends keyof FormState>(k: K) => (v: FormState[K]) =>
    setF((s) => ({ ...s, [k]: v }))

  const allFinite = REQUIRED.every((k) => Number.isFinite(f[k] as number))

  const d = f.h - f.cover - f.barDia / 2     // effective depth

  const r = useMemo((): ReturnType<typeof designPunchingShear> | null => {
    if (!allFinite || d <= 0) return null
    const inp: PunchingInput = {
      c1: f.c1, c2: f.c2,
      d,
      fc: f.fc,
      lambda: parseFloat(f.lambda),
      Vu: f.Vu,
      position: f.position,
    }
    return designPunchingShear(inp)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(f), allFinite, d])

  return (
    <div className="mx-auto max-w-6xl p-6">
      <Link to="/" className="no-print text-sm text-[#0056b3] hover:underline">← Home</Link>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-[#0056b3]">
        Punching Shear
      </h1>
      <p className="no-print mt-1 text-slate-600">
        Two-way slab–column punching shear — ACI 318-14 §22.6.
        Critical perimeter at d/2 from column face. φ = 0.75.
      </p>
      <ReportControls title="Punching Shear" />

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* ── INPUTS ── */}
        <div className="flex flex-col gap-6">
          <Card title="Column">
            <Num label="c₁ (∥ free edge / x-dir)" unit="mm" value={f.c1} onChange={set('c1')} />
            <Num label="c₂ (⊥ free edge / y-dir)" unit="mm" value={f.c2} onChange={set('c2')} />
            <Pick label="Position" value={f.position} onChange={set('position')}
              options={POS_OPTS} />
          </Card>

          <Card title="Slab">
            <Num label="Thickness h" unit="mm"      value={f.h}      onChange={set('h')} />
            <Num label="Clear cover"  unit="mm"      value={f.cover}  onChange={set('cover')} />
            <Num label="Bar ⌀"        unit="mm"      value={f.barDia} onChange={set('barDia')} />
            <Num label="f'c"          unit="MPa"     value={f.fc}     onChange={set('fc')} />
            <Pick label="λ (lightweight)" value={f.lambda} onChange={set('lambda')}
              options={[['1', '1.0 — Normal weight'], ['0.75', '0.75 — Lightweight']]} />
          </Card>

          <Card title="Demand">
            <Num label="Vu (factored column load)" unit="kN" value={f.Vu} onChange={set('Vu')} />
          </Card>
        </div>

        {/* ── RESULTS ── */}
        {r ? (
          <div className="flex flex-col gap-6">
            <ResultCard title="Geometry">
              <Row label="Effective depth d"
                value={`${f1(d)} mm`}
                sub={`h=${f0(f.h)} − cover=${f0(f.cover)} − db/2=${f1(f.barDia/2)}`} />
              <Row label="Column βc = c_long / c_short" value={f2(r.betac)} />
              <Row label="αs (position factor)"          value={String(r.alphaS)} />
              <Row label="b₀ (critical perimeter)"       value={`${f0(r.b0)} mm`} />
            </ResultCard>

            <ResultCard title="Concrete Vc — §22.6.5.2 (kN)">
              <Row label="Vc1 — (0.17 + 0.33/βc)·λ√f'c·b₀d"
                value={`${f1(r.Vc1)} kN`}
                alert={r.Vc === r.Vc1} />
              <Row label="Vc2 — (0.083αs·d/b₀ + 0.17)·λ√f'c·b₀d"
                value={`${f1(r.Vc2)} kN`}
                alert={r.Vc === r.Vc2 && r.Vc !== r.Vc1} />
              <Row label="Vc3 — 0.33·λ√f'c·b₀d"
                value={`${f1(r.Vc3)} kN`}
                alert={r.Vc === r.Vc3 && r.Vc !== r.Vc1 && r.Vc !== r.Vc2} />
              <Row label="Vc (governing)"  value={`${f1(r.Vc)} kN`} />
              <Row label="φVc (φ = 0.75)"  value={`${f1(r.phiVc)} kN`} />
            </ResultCard>

            <ResultCard title="Demand Check">
              <Row label="Vu"           value={`${f1(f.Vu)} kN`} />
              <Row label="φVc"          value={`${f1(r.phiVc)} kN`} />
              <Row label="Ratio Vu/φVc" value={f3(r.ratio)} alert={!r.ok} />
              <Row label="Status"
                value={r.ok ? 'OK — No shear reinf. required ✓' : 'FAIL — Shear reinforcement required ✗'}
                alert={!r.ok} />
              {!r.ok && (
                <p className="mt-2 rounded bg-red-50 px-3 py-2 text-xs text-red-700">
                  φVc {'<'} Vu — increase slab thickness, column size, or add stud rails / closed stirrups per §22.6.7.
                </p>
              )}
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
