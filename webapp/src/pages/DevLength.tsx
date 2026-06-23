import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { calcDevLength, type DevLengthInput, type EpoxyCase } from '../engine/devLength'
import { Num, Pick, Card, ResultCard, Row } from '../components/qty'
import { ReportControls } from '../components/ReportControls'
import { f0, f1, f2 } from '../lib/format'

const BAR_SIZES: [string, string][] = [
  ['10', '10 mm (ø10)'],
  ['12', '12 mm (ø12)'],
  ['16', '16 mm (ø16)'],
  ['20', '20 mm (ø20)'],
  ['25', '25 mm (ø25)'],
  ['28', '28 mm (ø28)'],
  ['32', '32 mm (ø32)'],
  ['36', '36 mm (ø36)'],
]

interface FormState extends Omit<DevLengthInput, 'db' | 'lambda'> {
  db: string
  lambda: '1' | '0.75'
}

const DEFAULTS: FormState = {
  db: '20',
  fc: 28, fy: 415,
  topBar: false,
  epoxy: 'none',
  lambda: '1',
  cbKtr_db: 1.5,
}

const EPOXY_OPTS: [EpoxyCase, string][] = [
  ['none',         'Uncoated (ψe = 1.0)'],
  ['coated-light', 'Epoxy, cover ≥ 3db (ψe = 1.2)'],
  ['coated-heavy', 'Epoxy, cover < 3db (ψe = 1.5)'],
]

export default function DevLength() {
  const [f, setF] = useState<FormState>(DEFAULTS)
  const set = <K extends keyof FormState>(k: K) => (v: FormState[K]) =>
    setF((s) => ({ ...s, [k]: v }))

  const r = useMemo(() => {
    const db = parseFloat(f.db)
    if (!Number.isFinite(db) || !Number.isFinite(f.fc) || !Number.isFinite(f.fy) ||
        !Number.isFinite(f.cbKtr_db)) return null
    return calcDevLength({
      db, fc: f.fc, fy: f.fy,
      topBar: f.topBar,
      epoxy: f.epoxy,
      lambda: parseFloat(f.lambda),
      cbKtr_db: f.cbKtr_db,
    })
  }, [f])

  return (
    <div className="mx-auto max-w-6xl p-6">
      <Link to="/" className="no-print text-sm text-[#0056b3] hover:underline">← Home</Link>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-[#0056b3]">
        Development &amp; Splice Lengths
      </h1>
      <p className="no-print mt-1 text-slate-600">
        ACI 318-14 §25.4 development + §25.5 splices. SI units (mm, MPa).
        Tension §25.4.2.3 · Compression §25.4.9.2 · Splices §25.5.2/5.
      </p>
      <ReportControls title="Development & Splice Lengths" />

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* ── INPUTS ── */}
        <div className="flex flex-col gap-6">
          <Card title="Bar &amp; Concrete">
            <Pick label="Bar diameter db" value={f.db} onChange={set('db')} options={BAR_SIZES} />
            <Num  label="f'c" unit="MPa" value={f.fc} onChange={set('fc')} />
            <Num  label="fy"  unit="MPa" value={f.fy} onChange={set('fy')} />
            <Pick label="Lightweight concrete λ" value={f.lambda} onChange={set('lambda')}
              options={[['1', '1.0 — Normal weight'], ['0.75', '0.75 — Lightweight']]} />
          </Card>

          <Card title="Modification Factors §25.4.2.4">
            <Pick label="Bar position" value={f.topBar ? 'top' : 'other'}
              onChange={(v) => set('topBar')(v === 'top')}
              options={[['other', 'Other bars (ψt = 1.0)'], ['top', 'Top bar >300 mm (ψt = 1.3)']]} />
            <Pick label="Epoxy coating" value={f.epoxy} onChange={set('epoxy')}
              options={EPOXY_OPTS} />
          </Card>

          <Card title="Confinement §25.4.2.3">
            <Num label="(cb + Ktr) / db" value={f.cbKtr_db} onChange={set('cbKtr_db')}
              step="0.1" />
            <div className="col-span-full text-xs text-slate-500 -mt-2">
              cb = smaller of cover-to-bar-CL or half cc spacing · Ktr = 40Atr/(s·n) · cap 2.5.
              Use 1.5 when in doubt (conservative), 2.5 with adequate cover and ties.
            </div>
          </Card>
        </div>

        {/* ── RESULTS ── */}
        {r ? (
          <div className="flex flex-col gap-6">
            <ResultCard title="Modification Factors">
              <Row label="ψt — casting position" value={f2(r.psi_t)} />
              <Row label="ψe — epoxy coating"    value={f2(r.psi_e)} />
              <Row label="ψs — bar size"         value={f2(r.psi_s)} />
              <Row label="ψt × ψe (≤ 1.7)"       value={f2(r.psi_te)}
                alert={r.psi_t * r.psi_e > 1.7} />
              <Row label="(cb+Ktr)/db used"      value={f2(r.confine)}
                sub={r.confine < f.cbKtr_db ? 'capped at 2.5' : ''} />
            </ResultCard>

            <ResultCard title="Development Length — Tension §25.4.2.3">
              <Row label="ℓd (formula)" value={`${f0(r.ld_raw)} mm`} />
              <Row label="ℓd (adopted ≥ 300 mm)" value={`${f0(r.ld)} mm`}
                sub={`${f1(r.ld / parseFloat(f.db))} db`} />
            </ResultCard>

            <ResultCard title="Development Length — Compression §25.4.9.2">
              <Row label="ℓdc" value={`${f0(r.ldc)} mm`}
                sub={`${f1(r.ldc / parseFloat(f.db))} db`} />
            </ResultCard>

            <ResultCard title="Tension Splices §25.5.2">
              <Row label="Class A  (1.0 × ℓd)" value={`${f0(r.ls_A)} mm`}
                sub="≤ 50% spliced, As ≥ 2·As,req" />
              <Row label="Class B  (1.3 × ℓd)" value={`${f0(r.ls_B)} mm`}
                sub="All other cases" />
            </ResultCard>

            <ResultCard title="Compression Splice §25.5.5">
              <Row label="ℓsc" value={`${f0(r.lsc)} mm`}
                sub={parseFloat(f.fc as unknown as string) < 21 ? '×4/3 low-f\'c applied' : ''} />
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
