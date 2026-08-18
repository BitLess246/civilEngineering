import { useMemo, useState } from 'react'
import { calcDevLength, hookFit, type DevLengthInput, type EpoxyCase } from '../engine/devLength'
import { Num, Pick, Card, ResultCard, Row } from '../components/qty'
import { ReportControls } from '../components/ReportControls'
import { buildDevLengthSolution } from '../lib/devLengthSolution'
import { f0, f1, f2 } from '../lib/format'
import { WorkedSolution } from '../components/WorkedSolution'
import { CodeHint } from '../components/CodeHint'
import { DevLengthDetail } from '../components/DevLengthDetail'
import { DEV_HINTS } from '../lib/devLengthHints'
import { PageHeader } from '../components/calc'

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
  lambda: '1' | '0.85' | '0.75'
  hookCover: boolean
  hookTies: boolean
  /** The member the hook anchors INTO — see the fit card. */
  checkFit: boolean
  memberDepth: number
  memberCover: number
  memberTieDia: number
  memberBarDia: number
}

const DEFAULTS: FormState = {
  db: '20',
  fc: 28, fy: 415,
  topBar: false,
  epoxy: 'none',
  lambda: '1',
  cbKtr_db: 1.5,
  hookCover: false,
  hookTies: false,
  checkFit: false,
  memberDepth: 400, memberCover: 40, memberTieDia: 10, memberBarDia: 20,
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
      hookCover: f.hookCover, hookTies: f.hookTies,
    })
  }, [f])

  // Does that hook fit the member it anchors into? The four lengths above are
  // required lengths; this is the only place on the page where a number can
  // come back as NOT ACHIEVABLE, so it is worth asking explicitly.
  const fit = useMemo(() => {
    if (!r || !f.checkFit) return null
    if (![f.memberDepth, f.memberCover, f.memberTieDia, f.memberBarDia].every(Number.isFinite)) return null
    return hookFit({
      ldh: r.ldh, memberDepth: f.memberDepth, cover: f.memberCover,
      tieDia: f.memberTieDia, farBarDia: f.memberBarDia,
    })
  }, [r, f.checkFit, f.memberDepth, f.memberCover, f.memberTieDia, f.memberBarDia])

  // Development length has no pass/fail — it produces required lengths rather
  // than checking a demand — so the report carries no checks and the verdict
  // line states the governing tension length instead.
  const solution = r ? buildDevLengthSolution({
    db: parseFloat(f.db), fc: f.fc, fy: f.fy, topBar: f.topBar,
    epoxy: f.epoxy, lambda: parseFloat(f.lambda), cbKtr_db: f.cbKtr_db,
    hookCover: f.hookCover, hookTies: f.hookTies,
  }, r) : null

  const report = r ? {
    docCode: 'S-DL',
    ok: true,
    governing: `ld = ${f0(r.ld)} mm tension · ldc = ${f0(r.ldc)} mm compression`,
    stats: [
      { label: 'ld (tension)', value: f0(r.ld), unit: 'mm' },
      { label: 'Class B splice', value: f0(r.ls_B), unit: 'mm' },
      { label: 'ldh (hook)', value: f0(r.ldh), unit: 'mm' },
      { label: 'ldc (compression)', value: f0(r.ldc), unit: 'mm' },
    ],
    data: [
      ['Bar ⌀ db', `${f.db} mm`],
      ["Concrete f'c", `${f.fc} MPa`],
      ['Steel fy', `${f.fy} MPa`],
      ['Casting position ψt', `${r.psi_t.toFixed(2)}${f.topBar ? ' (top bar)' : ''}`],
      ['Epoxy ψe', `${r.psi_e.toFixed(2)} (${f.epoxy})`],
      ['Bar size ψs', r.psi_s.toFixed(2)],
      ['ψt·ψe (capped 1.7)', r.psi_te.toFixed(2)],
      ['λ (lightweight)', f.lambda],
      ['Confinement (cb+Ktr)/db', r.confine.toFixed(2)],
      ['ld before 300 mm floor', `${f0(r.ld_raw)} mm`],
      ["√f'c used (§25.4.1.4 cap 8.3)", r.sqrtFc.toFixed(2)],
      ['Hook ψc / ψr', `${r.psi_c.toFixed(2)} / ${r.psi_r.toFixed(2)}`],
      ['Hook ℓdh', `${f0(r.ldh)} mm`],
      ['Class A splice', `${f0(r.ls_A)} mm`],
      ['Compression splice', `${f0(r.lsc)} mm`],
      ...(fit ? [
        ['Hook embedment available', `${f0(fit.avail)} mm`],
        ['Hook fit', fit.fits
          ? `OK — ${f0(fit.avail - r.ldh)} mm spare`
          : `SHORT by ${f0(fit.shortfall)} mm — needs ${f0(fit.depthNeeded)} mm depth`],
      ] as [string, string][] : []),
    ] as [string, string][],
    steps: solution ?? undefined,
  } : undefined

  return (
        <div>
      <PageHeader title="Development & Splice Lengths" badges={['ACI 318-14 §25.4', 'NSCP 2015']} />
      <div className="mx-auto max-w-[1500px] p-6">
      <p className="no-print mt-1 text-slate-600">
        ACI 318-14 §25.4 development + §25.5 splices. SI units (mm, MPa).
        Tension §25.4.2.3 · Compression §25.4.9.2 · Splices §25.5.2/5.
      </p>
      <ReportControls title="Development & Splice Lengths" badges={['ACI 318-14 §25.4', 'NSCP 2015']} report={report} />

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* ── INPUTS ── */}
        <div className="flex flex-col gap-6">
          <Card title="Bar &amp; Concrete">
            <Pick label={<>Bar diameter db<CodeHint spec={DEV_HINTS.db} /></>}
              value={f.db} onChange={set('db')} options={BAR_SIZES} />
            <Num  label={<>f'c<CodeHint spec={DEV_HINTS.fc} /></>}
              unit="MPa" value={f.fc} onChange={set('fc')} />
            <Num  label={<>fy<CodeHint spec={DEV_HINTS.fy} /></>}
              unit="MPa" value={f.fy} onChange={set('fy')} />
            <Pick label={<>Lightweight concrete λ<CodeHint spec={DEV_HINTS.lambda} /></>}
              value={f.lambda} onChange={set('lambda')}
              options={[
                ['1', '1.0 — Normalweight'],
                ['0.85', '0.85 — Sand-lightweight'],
                ['0.75', '0.75 — All-lightweight'],
              ]} />
          </Card>

          <Card title="Modification Factors §25.4.2.4">
            <Pick label={<>Bar position<CodeHint spec={DEV_HINTS.psiT} /></>}
              value={f.topBar ? 'top' : 'other'}
              onChange={(v) => set('topBar')(v === 'top')}
              options={[['other', 'Other bars (ψt = 1.0)'], ['top', 'Top bar >300 mm (ψt = 1.3)']]} />
            <Pick label={<>Epoxy coating<CodeHint spec={DEV_HINTS.psiE} /></>}
              value={f.epoxy} onChange={set('epoxy')} options={EPOXY_OPTS} />
          </Card>

          <Card title="Confinement §25.4.2.3">
            <Num label={<>(cb + Ktr) / db<CodeHint spec={DEV_HINTS.confine} /></>}
              value={f.cbKtr_db} onChange={set('cbKtr_db')} step="0.1" />
            <div className="col-span-full text-xs text-slate-500 -mt-2">
              cb = smaller of cover-to-bar-CL or half cc spacing · Ktr = 40Atr/(s·n) · cap 2.5.
              Use 1.5 when in doubt (conservative), 2.5 with adequate cover and ties.
            </div>
          </Card>

          <Card title={<>Standard Hook §25.4.3<CodeHint spec={DEV_HINTS.hook} /></>}>
            <Pick label="Side / tail cover ψc" value={f.hookCover ? 'yes' : 'no'}
              onChange={(v) => set('hookCover')(v === 'yes')}
              options={[['no', 'Not satisfied (ψc = 1.0)'], ['yes', 'Cover ≥ 65/50 mm (ψc = 0.7)']]} />
            <Pick label="Confining ties ψr" value={f.hookTies ? 'yes' : 'no'}
              onChange={(v) => set('hookTies')(v === 'yes')}
              options={[['no', 'Not satisfied (ψr = 1.0)'], ['yes', 'Ties at s ≤ 3db (ψr = 0.8)']]} />
            <div className="col-span-full -mt-2 text-xs text-slate-500">
              ψc and ψr apply to ⌀36 and smaller only. ψt does NOT apply to hooks.
            </div>
          </Card>

          <Card title="Does the Hook Fit? — the member it anchors into">
            <Pick label="Check the anchoring member" value={f.checkFit ? 'yes' : 'no'}
              onChange={(v) => set('checkFit')(v === 'yes')}
              options={[['no', 'Not checked'], ['yes', 'Check ℓdh against the member']]} />
            {f.checkFit && (<>
              <Num label="Member depth ∥ bar" unit="mm" value={f.memberDepth} onChange={set('memberDepth')} />
              <Num label="Member cover" unit="mm" value={f.memberCover} onChange={set('memberCover')} />
              <Num label="Tie / hoop ⌀" unit="mm" value={f.memberTieDia} onChange={set('memberTieDia')} />
              <Num label="Far-face bar ⌀" unit="mm" value={f.memberBarDia} onChange={set('memberBarDia')} />
              <div className="col-span-full -mt-2 text-xs text-slate-500">
                The hook turns down BEHIND the far-face longitudinal bar, so the embedment
                available is depth − cover − tie ⌀ − bar ⌀, not the member depth.
              </div>
            </>)}
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
              <Row label="√f'c used" value={f2(r.sqrtFc)}
                sub={r.sqrtFcCapped ? '§25.4.1.4 cap 8.3 applied' : ''}
                alert={r.sqrtFcCapped} />
            </ResultCard>

            <ResultCard title="Development Length — Tension §25.4.2.3">
              <Row label="ℓd (formula)" value={`${f0(r.ld_raw)} mm`} />
              <Row label="ℓd (adopted ≥ 300 mm)" value={`${f0(r.ld)} mm`}
                sub={`${f1(r.ld / parseFloat(f.db))} db`} />
            </ResultCard>

            <ResultCard title="Standard Hook — Tension §25.4.3">
              <Row label="ψc — cover" value={f2(r.psi_c)} />
              <Row label="ψr — confining ties" value={f2(r.psi_r)} />
              <Row label="ℓdh (formula)" value={`${f0(r.ldh_raw)} mm`} />
              <Row label="ℓdh (adopted)" value={`${f0(r.ldh)} mm`}
                sub={`${f1(r.ldh / parseFloat(f.db))} db · floor max(8db, 150)`} />
              <Row label="Tail 12db (not part of ℓdh)" value={`${f0(r.hookTail)} mm`} />
              <Row label="Min inside bend ⌀" value={`${f0(r.hookBendDia)} mm`} />
            </ResultCard>

            {fit && (
              <ResultCard title="Hook Fit — is there room for it?">
                <Row label="Embedment available" value={`${f0(fit.avail)} mm`}
                  sub={`${f.memberDepth} − ${f.memberCover} cover − ${f.memberTieDia} tie − ${f.memberBarDia} bar`} />
                <Row label="ℓdh required" value={`${f0(r.ldh)} mm`} />
                <Row label={fit.fits ? 'Fits' : 'DOES NOT FIT'}
                  value={fit.fits ? `${f0(fit.avail - r.ldh)} mm spare` : `${f0(fit.shortfall)} mm short`}
                  alert={!fit.fits} />
                <Row label="Depth that would develop it" value={`${f0(fit.depthNeeded)} mm`} />
                {!fit.fits && (
                  <div className="mt-2 rounded-md bg-[#fbeeea] p-2 text-[11.5px] leading-relaxed text-[#8f2f1e]">
                    Deepen the member to {f0(fit.depthNeeded)} mm, use a smaller bar, raise f'c,
                    earn ψc/ψr (§25.4.3.2), or anchor with a headed bar or mechanical device
                    (§25.4.4). <strong>Lengthening the tail does not help</strong> — ℓdh is
                    measured to the outside of the bend, and the 12db tail runs across it.
                  </div>
                )}
              </ResultCard>
            )}

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
      {/* What the four lengths are measured BETWEEN — the part the numbers
          on their own cannot carry. */}
      {r && (
        <div className="mt-6 rounded-lg border border-[#e3e1da] bg-white p-4 print-avoid-break">
          <h2 className="mb-3 text-[13.5px] font-bold text-[#0f1b2a]">
            Detail — where each length is measured from
          </h2>
          <DevLengthDetail
            db={parseFloat(f.db)} ld={r.ld} ldh={r.ldh} ls_B={r.ls_B}
            hookTail={r.hookTail} hookBendDia={r.hookBendDia}
          />
        </div>
      )}

      {/* The step-by-step already existed and only ever reached the PDF. */}
      {solution && solution.length > 0 && (
        <div className="mt-5">
          <WorkedSolution steps={solution} title="Calculation report — worked solution" />
        </div>
      )}
    </div>
    </div>
  )
}
