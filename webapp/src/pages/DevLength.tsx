import { useMemo, useState } from 'react'
import { calcDevLength, hookFit, type DevLengthInput, type EpoxyCase } from '../engine/devLength'
import { Num, Pick } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { buildDevLengthSolution } from '../lib/devLengthSolution'
import { f0, f1, f2 } from '../lib/format'
import { CodeHint } from '../components/CodeHint'
import { DevLengthDetail } from '../components/DevLengthDetail'
import { DEV_HINTS } from '../lib/devLengthHints'

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

  const db = parseFloat(f.db)
  const full = 'col-span-2'
  return (
    <WorkspacePage title="Development and Splice Lengths" badges={['Concrete', 'ACI 318-14 §25.4–25.5 · NSCP 2015']}
      intro="Straight development in tension and compression, the standard hook, and lap splices for one bar. These are REQUIRED lengths, not a check — except the hook-fit check, which asks whether the member the hook anchors into has room for ℓdh."
      report={report}
      inputs={<>
        <InputGroup title="Bar and concrete">
          <Pick label={<>Bar diameter db<CodeHint spec={DEV_HINTS.db} /></>}
            value={f.db} onChange={set('db')} options={BAR_SIZES} />
          <Num label={<>f′c<CodeHint spec={DEV_HINTS.fc} /></>} unit="MPa" value={f.fc} onChange={set('fc')} />
          <Num label={<>fy<CodeHint spec={DEV_HINTS.fy} /></>} unit="MPa" value={f.fy} onChange={set('fy')} />
          <Pick label={<>Lightweight λ<CodeHint spec={DEV_HINTS.lambda} /></>}
            value={f.lambda} onChange={set('lambda')}
            options={[['1', '1.0 normalweight'], ['0.85', '0.85 sand-lightweight'], ['0.75', '0.75 all-lightweight']]} />
        </InputGroup>
        <InputGroup title="Modification factors §25.4.2.4">
          <Pick label={<>Bar position<CodeHint spec={DEV_HINTS.psiT} /></>}
            value={f.topBar ? 'top' : 'other'} onChange={(v) => set('topBar')(v === 'top')}
            options={[['other', 'Other bars (ψt 1.0)'], ['top', 'Top bar > 300 mm (ψt 1.3)']]} />
          <Pick label={<>Epoxy coating<CodeHint spec={DEV_HINTS.psiE} /></>}
            value={f.epoxy} onChange={set('epoxy')} options={EPOXY_OPTS} />
          <div className={full}>
            <Num label={<>(cb + Ktr) / db<CodeHint spec={DEV_HINTS.confine} /></>}
              value={f.cbKtr_db} onChange={set('cbKtr_db')} step="0.1"
              hint="capped at 2.5; 1.5 when in doubt" />
          </div>
        </InputGroup>
        <InputGroup title="Standard hook §25.4.3" hint="ψc and ψr apply to ⌀36 and smaller; ψt does not apply to hooks.">
          <Pick label={<>Side / tail cover ψc<CodeHint spec={DEV_HINTS.hook} /></>} value={f.hookCover ? 'yes' : 'no'}
            onChange={(v) => set('hookCover')(v === 'yes')}
            options={[['no', 'Not satisfied (1.0)'], ['yes', '≥ 65 / 50 mm (0.7)']]} />
          <Pick label="Confining ties ψr" value={f.hookTies ? 'yes' : 'no'}
            onChange={(v) => set('hookTies')(v === 'yes')}
            options={[['no', 'Not satisfied (1.0)'], ['yes', 'Ties at s ≤ 3db (0.8)']]} />
        </InputGroup>
        <InputGroup title="Does the hook fit?" hint={f.checkFit ? 'The hook turns down behind the far-face bar, so the embedment available is depth − cover − tie − bar.' : undefined}>
          <div className={full}>
            <Pick label="Anchoring member" value={f.checkFit ? 'yes' : 'no'}
              onChange={(v) => set('checkFit')(v === 'yes')}
              options={[['no', 'Not checked'], ['yes', 'Check ℓdh against the member']]} />
          </div>
          {f.checkFit && (<>
            <Num label="Depth ∥ bar" unit="mm" value={f.memberDepth} onChange={set('memberDepth')} />
            <Num label="Cover" unit="mm" value={f.memberCover} onChange={set('memberCover')} />
            <Num label="Tie / hoop ⌀" unit="mm" value={f.memberTieDia} onChange={set('memberTieDia')} />
            <Num label="Far-face bar ⌀" unit="mm" value={f.memberBarDia} onChange={set('memberBarDia')} />
          </>)}
        </InputGroup>
      </>}
      checks={r ? <>
        <CheckCard title="Tension development" basis="§25.4.2.3, ≥ 300 mm" status="info"
          value={f0(r.ld)} unit="mm"
          pairs={[{ label: 'In bar ⌀', value: `${f1(r.ld / db)} db` }, { label: 'Class B lap', value: `${f0(r.ls_B)} mm` }]} />
        <CheckCard title="Standard hook" basis="§25.4.3" status={fit ? (fit.fits ? 'pass' : 'fail') : 'info'}
          pillLabel={fit ? undefined : 'NOT CHECKED'} value={f0(r.ldh)} unit="mm"
          ratio={fit && fit.avail > 0 ? r.ldh / fit.avail : undefined} ratioLabel="ℓdh ÷ available"
          pairs={fit
            ? [{ label: 'Available', value: `${f0(fit.avail)} mm` }, { label: fit.fits ? 'Spare' : 'Short', value: `${f0(fit.fits ? fit.avail - r.ldh : fit.shortfall)} mm` }]
            : [{ label: 'Tail', value: `${f0(r.hookTail)} mm` }, { label: 'Bend ⌀', value: `${f0(r.hookBendDia)} mm` }]} />
        <CheckCard title="Compression" basis="§25.4.9.2 · §25.5.5" status="info"
          value={f0(r.ldc)} unit="mm"
          pairs={[{ label: 'Lap ℓsc', value: `${f0(r.lsc)} mm` }, { label: 'In bar ⌀', value: `${f1(r.ldc / db)} db` }]} />
      </> : <p className="text-sm text-muted">Fill in all inputs to see results.</p>}
      summary={[
        { label: 'Bar', value: `⌀${f.db}, fy ${f.fy} MPa` },
        { label: 'Concrete', value: `f′c ${f.fc} MPa, λ ${f.lambda}` },
        { label: 'Factors', value: `${f.topBar ? 'top bar' : 'other bar'}, ${f.epoxy}, (cb+Ktr)/db ${f2(f.cbKtr_db)}` },
      ]}
      drawing={r ? { title: 'Where each length is measured', node: <div data-pdf-drawing>
        <DevLengthDetail db={db} ld={r.ld} ldh={r.ldh} ls_B={r.ls_B} hookTail={r.hookTail} hookBendDia={r.hookBendDia} />
      </div> } : undefined}
      resultsCaption={fit && !fit.fits ? `The hook is ${f0(fit.shortfall)} mm short. Deepen the member to ${f0(fit.depthNeeded)} mm, use a smaller bar, raise f′c, earn ψc / ψr (§25.4.3.2), or anchor with a headed bar (§25.4.4). Lengthening the tail does not help: ℓdh is measured to the outside of the bend.` : undefined}
      results={r ? [
        { check: 'ψt · ψe · ψs', basis: `ψt·ψe ≤ 1.7 → ${f2(r.psi_te)}`, demand: `${f2(r.psi_t)} · ${f2(r.psi_e)} · ${f2(r.psi_s)}`, status: 'info' as const },
        { check: 'Confinement (cb+Ktr)/db', basis: r.confine < f.cbKtr_db ? 'capped at 2.5' : '§25.4.2.3', demand: f2(r.confine), status: 'info' as const },
        { check: '√f′c used', basis: r.sqrtFcCapped ? '§25.4.1.4 cap 8.3 applied' : '§25.4.1.4', demand: `${f2(r.sqrtFc)} MPa`, status: r.sqrtFcCapped ? 'warn' as const : 'info' as const },
        { check: 'ℓd tension', basis: `formula ${f0(r.ld_raw)} mm, ≥ 300`, demand: `${f0(r.ld)} mm`, status: 'info' as const },
        { check: 'ℓdh hook', basis: `ψc ${f2(r.psi_c)} · ψr ${f2(r.psi_r)}; ≥ max(8db, 150)`, demand: `${f0(r.ldh)} mm`, limit: fit ? `${f0(fit.avail)} mm available` : undefined, ratio: fit && fit.avail > 0 ? r.ldh / fit.avail : undefined, status: fit ? (fit.fits ? 'pass' as const : 'fail' as const) : 'info' as const },
        { check: 'Hook tail · bend ⌀', basis: '12db tail, not part of ℓdh', demand: `${f0(r.hookTail)} · ${f0(r.hookBendDia)} mm`, status: 'info' as const },
        { check: 'ℓdc compression', basis: '§25.4.9.2', demand: `${f0(r.ldc)} mm`, status: 'info' as const },
        { check: 'Class A splice', basis: '1.0ℓd · ≤ 50% spliced, As ≥ 2As,req', demand: `${f0(r.ls_A)} mm`, status: 'info' as const },
        { check: 'Class B splice', basis: '1.3ℓd · all other cases', demand: `${f0(r.ls_B)} mm`, status: 'info' as const },
        { check: 'Compression splice', basis: f.fc < 21 ? '§25.5.5, ×4/3 for f′c < 21' : '§25.5.5', demand: `${f0(r.lsc)} mm`, status: 'info' as const },
      ] : []}
      steps={solution ?? []}
      references={[
        { topic: 'Development in tension and compression', basis: 'detailed equation; ψ factors', source: 'ACI 318-14 §25.4.2, §25.4.9 · NSCP 2015 §425.4' },
        { topic: 'Standard hooks', basis: 'ℓdh, ψc, ψr; hook geometry', source: 'ACI 318-14 §25.4.3, Table 25.3.1' },
        { topic: 'Lap splices', basis: 'Class A / B tension; compression', source: 'ACI 318-14 §25.5.2, §25.5.5' },
      ]}
    />
  )
}
