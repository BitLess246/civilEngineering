import { useState } from 'react'
import {
  buildBeam, validateBeamInput, effectPoints, ilValueAt, ilAreaRange, ilTotalArea,
  ilExtreme, signRegions, placeLoads, reactionsUnder, solveUnitAt, stationLetters,
  type BeamInput, type BeamSupport, type BeamModel, type Effect, type ILPoint,
} from '../engine/influenceBeam'
import { Card, Num, Pick, ResultCard, Row } from '../components/qty'
import { DrawingCard } from '../components/calc'
import { DrawingFrame } from '../components/DrawingFrame'
import { ReportControls } from '../components/ReportControls'
import { WorkedSolution } from '../components/WorkedSolution'
import type { SolutionStep } from '../lib/solution'
import { INK, BRAND, FAIL, AMBER, FAINT, MUTED, HAIR, TINT_T, TINT_C, TINT_LOAD, f2, f3, signed } from '../lib/influenceStyle'

// Influence Lines — continuous beam MODE. Any layout of supports and internal
// hinges (Gerber construction) that stays determinate (supports = hinges + 2).
// The engine solves every rigid body's equilibrium under a unit load walking
// the span (engine/influenceBeam.ts), traces the exact piecewise-linear
// influence line of a reaction, a section shear (with its jump), a section
// moment or a hinge shear, then answers the classic placement questions: how
// much of the beam a uniform patch should cover, where the concentrated load
// goes, and what the dead load — which always covers everything — contributes.

type EffKind = 'reaction' | 'shear' | 'moment' | 'hinge'

const SAMPLE_LOADS = { length: 12, supports: [{ x: 3, kind: 'pin' as const }, { x: 12, kind: 'roller' as const }], hinges: [] }

export function BeamMode() {
  const [length, setLength] = useState(12)
  const [supports, setSupports] = useState<BeamSupport[]>(SAMPLE_LOADS.supports)
  const [hinges, setHinges] = useState<number[]>(SAMPLE_LOADS.hinges)
  const [effKind, setEffKind] = useState<EffKind>('moment')
  const [effX, setEffX] = useState(6)
  const [effSup, setEffSup] = useState(0)
  const [effHinge, setEffHinge] = useState(0)
  const [unitX, setUnitX] = useState(0)
  const [target, setTarget] = useState<'max' | 'min'>('min')
  const [wLive, setWLive] = useState(50)
  const [pLive, setPLive] = useState(90)
  const [wDead, setWDead] = useState(25)
  const [fbd, setFbd] = useState<'unit' | 'governing'>('governing')
  const [isSample, setIsSample] = useState(true)

  const touch = () => setIsSample(false)
  const setLen = (v: number) => { touch(); setLength(v) }
  const setSup = (i: number, patch: Partial<BeamSupport>) => { touch(); setSupports((ss) => ss.map((s, k) => (k === i ? { ...s, ...patch } : s))) }
  const addSup = () => { touch(); setSupports((ss) => [...ss, { x: Math.round((length / 2) * 100) / 100, kind: 'roller' }]) }
  const delSup = (i: number) => { touch(); setSupports((ss) => ss.filter((_, k) => k !== i)) }
  const setHge = (i: number, x: number) => { touch(); setHinges((hh) => hh.map((h, k) => (k === i ? x : h))) }
  const addHinge = () => { touch(); setHinges((hh) => [...hh, Math.round((length / 2) * 100) / 100]) }
  const delHinge = (i: number) => { touch(); setHinges((hh) => hh.filter((_, k) => k !== i)) }
  const loadSample = () => {
    setLength(SAMPLE_LOADS.length)
    setSupports(SAMPLE_LOADS.supports.map((s) => ({ ...s })))
    setHinges([...SAMPLE_LOADS.hinges])
    setEffKind('moment'); setEffX(6); setEffSup(0); setEffHinge(0); setUnitX(0)
    setTarget('min'); setWLive(50); setPLive(90); setWDead(25)
    setIsSample(true)
  }

  const input: BeamInput = { length, supports, hinges }
  const problems = validateBeamInput(input)
  const model: BeamModel | null = (() => { try { return buildBeam(input) } catch { return null } })()

  const effXc = Math.min(Math.max(effX, 0), length)
  const unitXc = Math.min(Math.max(unitX, 0), length)

  // The input cards stay live even when the layout is unsolvable — the
  // mechanism/indeterminacy message is exactly when the user needs the
  // editors to add a support or move a hinge, so they are hoisted here and
  // rendered in both the error layout and the main one.
  const inputsColumn = (
    <div className="space-y-5">
          <Card title="Beam, supports & hinges" hint="supports must equal hinges + 2">
            <div className="sm:col-span-2 lg:col-span-3">
              <button type="button" onClick={loadSample}
                className="rounded-md border border-field-line px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-tint">
                Load the sample problem — beam ABCD, 12 m, lane load 50 kN/m + 90 kN, dead 25 kN/m
              </button>
            </div>
            <Num label="Length L" unit="m" value={length} onChange={setLen} min={1} max={80} step="0.5" />
            <div className="sm:col-span-2 lg:col-span-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[11.5px] font-semibold text-muted">Supports ({supports.length})</span>
                <button type="button" onClick={addSup}
                  className="rounded-md border border-field-line px-2 py-0.5 text-[11px] font-semibold text-brand hover:bg-brand-tint">+ Add support</button>
              </div>
              {supports.map((s, i) => (
                <div key={i} className="mb-1.5 flex items-center gap-2">
                  <Num label={`x ${i + 1}`} unit="m" value={s.x} onChange={(v) => setSup(i, { x: v })} min={0} max={length} step="0.25" />
                  <Pick label="Kind" value={s.kind} onChange={(v) => setSup(i, { kind: v })} options={[['pin', 'Pin'], ['roller', 'Roller']]} />
                  <button type="button" onClick={() => delSup(i)} disabled={supports.length <= 1}
                    className="mt-4 text-muted hover:text-fail disabled:opacity-30">✕</button>
                </div>
              ))}
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[11.5px] font-semibold text-muted">Internal hinges ({hinges.length})</span>
                <button type="button" onClick={addHinge}
                  className="rounded-md border border-field-line px-2 py-0.5 text-[11px] font-semibold text-brand hover:bg-brand-tint">+ Add hinge</button>
              </div>
              {hinges.length === 0 && <p className="text-[10px] text-faint">No hinges — one rigid body. Add hinges for Gerber (suspended-span) layouts.</p>}
              {hinges.map((h, i) => (
                <div key={i} className="mb-1.5 flex items-center gap-2">
                  <Num label={`hinge ${i + 1}`} unit="m" value={h} onChange={(v) => setHge(i, v)} min={0} max={length} step="0.25" />
                  <button type="button" onClick={() => delHinge(i)}
                    className="mt-4 text-muted hover:text-fail">✕</button>
                </div>
              ))}
            </div>
            {problems.length === 0
              ? <p className="text-[11px] font-semibold text-brand sm:col-span-2 lg:col-span-3">supports = hinges + 2 — statically determinate</p>
              : <ul className="list-disc pl-4 text-[11px] text-fail sm:col-span-2 lg:col-span-3">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
          </Card>

          <Card title="Section of interest">
            <Pick label="Influence line to plot" value={effKind} onChange={(v) => setEffKind(v as EffKind)}
              options={[
                ['reaction', 'Reaction at a support'],
                ['shear', 'Shear at a section'],
                ['moment', 'Moment at a section'],
                ...(hinges.length > 0 ? [['hinge', 'Shear at a hinge'] as [EffKind, string]] : []),
              ]} />
            {effKind === 'reaction' && supports.length > 0 && (
              <Pick label="Support" value={String(Math.min(effSup, supports.length - 1))}
                onChange={(v) => setEffSup(Number(v))}
                options={supports.map((s, i) => [String(i), `x = ${f2(s.x)} m · ${s.kind}`] as [string, string])} />
            )}
            {effKind === 'hinge' && hinges.length > 0 && (
              <Pick label="Hinge" value={String(Math.min(effHinge, hinges.length - 1))}
                onChange={(v) => setEffHinge(Number(v))}
                options={hinges.map((h, i) => [String(i), `H${i + 1} at x = ${f2(h)} m`] as [string, string])} />
            )}
            {(effKind === 'shear' || effKind === 'moment') && (
              <Num label="Section position" unit="m" value={effX} onChange={(v) => { touch(); setEffX(v) }} min={0} max={length} step="0.25" />
            )}
          </Card>

          <Card title="Moving unit load">
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="flex flex-col text-sm">
                <span className="mb-1 text-[11.5px] font-semibold text-muted">Position x</span>
                <input type="range" min={0} max={length} step={length / 400} value={unitXc}
                  onChange={(e) => setUnitX(parseFloat(e.target.value))} className="w-full accent-brand" />
              </label>
              <div className="mt-2"><Num label="x" unit="m" value={unitXc} onChange={setUnitX} min={0} max={length} step="0.1" /></div>
            </div>
          </Card>

          <Card title="Load placement">
            <Pick label="Go for" value={target} onChange={(v) => setTarget(v as 'max' | 'min')}
              options={[['max', 'Maximum value — patch the positive regions'], ['min', 'Minimum value — patch the negative regions']]} />
            <Num label="Live UDL w" unit="kN/m" value={wLive} onChange={(v) => { touch(); setWLive(v) }} min={0} max={200} step="0.5" />
            <Num label="Concentrated live P" unit="kN" value={pLive} onChange={(v) => { touch(); setPLive(v) }} min={0} max={500} step="1" />
            <Num label="Dead UDL (whole span)" unit="kN/m" value={wDead} onChange={(v) => { touch(); setWDead(v) }} min={0} max={200} step="0.5" />
            <p className="text-[10px] text-faint sm:col-span-2 lg:col-span-3">
              The patch covers the sign regions of the line, the concentrated load stands on the
              extreme ordinate, and the dead load always covers the full span.
            </p>
          </Card>
    </div>
  )

  if (!model) {
    return (
      <div className="mx-auto max-w-[1500px] px-5 py-5 sm:px-7">
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          {inputsColumn}
          <div className="rail-card rounded-lg border border-fail-line bg-fail-tint p-4">
            <h2 className="text-[13.5px] font-bold text-fail">The beam cannot be solved as configured</h2>
            <ul className="mt-2 list-disc pl-5 text-sm text-fail">
              {problems.map((p) => <li key={p}>{p}</li>)}
            </ul>
            <p className="mt-2 text-xs text-muted">Fix the layout with the editors on the left — supports must equal hinges + 2, and every rigid body must be held against rotation. The sample problem button above restores the classic ABCD beam.</p>
          </div>
        </div>
      </div>
    )
  }
  const effect: Effect = effKind === 'reaction' && supports.length > 0
    ? { kind: 'reaction', support: Math.min(effSup, supports.length - 1) }
    : effKind === 'hinge' && hinges.length > 0
      ? { kind: 'hinge', hinge: Math.min(effHinge, hinges.length - 1) }
      : effKind === 'shear' ? { kind: 'shear', x: effXc } : { kind: 'moment', x: effXc }

  const pts = effectPoints(model, effect)
  const sign: 1 | -1 = target === 'max' ? 1 : -1
  const placement = placeLoads(pts, wLive, pLive, sign)
  const deadEffect = wDead * ilTotalArea(pts)
  const letters = stationLetters(model, effect.kind === 'shear' || effect.kind === 'moment' ? effXc : null)
  const ordNow = ilValueAt(pts, unitXc)
  const extMax = ilExtreme(pts, 1)
  const extMin = ilExtreme(pts, -1)
  const unitLabel = effect.kind === 'moment' ? 'kN·m per kN' : 'kN per kN'
  const patchArea = placement.regions.reduce((a, r) => a + r.area, 0)

  const effName = effect.kind === 'reaction'
    ? `Reaction at ${letters.find((l) => Math.abs(l.x - supports[Math.min(effSup, supports.length - 1)].x) < 1e-9)?.letter ?? ''} (x = ${f2(supports[Math.min(effSup, supports.length - 1)].x)} m)`
    : effect.kind === 'hinge'
      ? `Hinge shear H${effect.hinge + 1} (x = ${f2(hinges[Math.min(effect.hinge, hinges.length - 1)] ?? 0)} m)`
      : `${effect.kind === 'shear' ? 'Shear' : 'Moment'} at ${letters.find((l) => Math.abs(l.x - effXc) < 1e-9)?.letter ?? 'x'} (x = ${f2(effXc)} m)`

  // The board-exam sample, straight from the engine: moment and shear lines at
  // C (x = 6), the live loads placed on the matching sign regions, dead over
  // the whole span. Shown whenever the sample flag is up (any edit clears it).
  const sample = (() => {
    if (!isSample) return null
    const mM = effectPoints(model, { kind: 'moment', x: 6 })
    const mV = effectPoints(model, { kind: 'shear', x: 6 })
    const negLen = signRegions(mM, -1).reduce((a, r) => a + r.length, 0)
    const posLen = signRegions(mM, 1).reduce((a, r) => a + r.length, 0)
    const deadM = wDead * ilTotalArea(mM)
    const pM = placeLoads(mM, wLive, pLive, -1)
    const deadV = wDead * ilTotalArea(mV)
    const pV = placeLoads(mV, wLive, pLive, 1)
    return {
      negLen, posLen, deadM, deadV, pM, pV,
      maxNegM: pM.liveTotal + deadM,
      maxPosV: pV.liveTotal + deadV,
    }
  })()

  // Free-body values: the unit-load state, or the governing placement with
  // every reaction (and hinge shear) summed from its own influence line.
  const fbdState = (() => {
    if (fbd === 'unit') {
      const st = solveUnitAt(model, unitXc)
      return { reactions: st.reactions, hingeShears: st.hingeShears, regions: [], point: null as null | { x: number; p: number } }
    }
    const liveUdls = placement.regions.map((r) => ({ a: r.a, b: r.b, w: wLive }))
    const point = placement.pointX != null ? { x: placement.pointX, p: pLive } : null
    const rLive = reactionsUnder(model, { udls: liveUdls, point })
    const rDead = reactionsUnder(model, { udls: [{ a: 0, b: length, w: wDead }], point: null })
    const hingeShears = model.hinges.map((_, hi) => {
      const hp = effectPoints(model, { kind: 'hinge', hinge: hi })
      let v = wLive * placement.regions.reduce((a, r) => a + ilAreaRange(hp, r.a, r.b), 0)
      if (point) v += point.p * ilValueAt(hp, point.x)
      return v + wDead * ilTotalArea(hp)
    })
    return {
      reactions: rLive.map((v, i) => v + rDead[i]),
      hingeShears,
      regions: placement.regions,
      point,
    }
  })()

  const steps: SolutionStep[] = (() => {
    const S = supports.length, H = hinges.length
    const st = solveUnitAt(model, unitXc)
    const out: SolutionStep[] = [
      {
        title: 'Model and determinacy',
        lines: [
          { text: `Continuous beam of ${f2(length)} m with ${S} support${S === 1 ? '' : 's'} and ${H} internal hinge${H === 1 ? '' : 's'}. The hinges are moment releases transmitting shear only, so they split the beam into ${H + 1} rigid bod${H === 0 ? 'y' : 'ies'}, each contributing two equilibrium equations (ΣFy and ΣM) with ${S} reaction${S === 1 ? '' : 's'} and ${H} hinge shear${H === 1 ? '' : 's'} as unknowns.` },
          { tex: `S = ${S} = ${H} + 2 \\;\\checkmark\\;\\;\\text{statically determinate}` },
        ],
        note: 'Vertical loads only, so each support is one vertical reaction; the solver refuses any layout where a rigid body is not held against rotation.',
      },
      {
        title: `Unit load at x = ${f2(unitXc)} m — the solved state`,
        lines: [
          { text: 'Every influence ordinate comes from the same solve: reactions and hinge shears for 1 kN down at the load position.' },
          ...supports.map((s, i) => ({ item: `R at x = ${f2(s.x)} m (${s.kind}): ${f3(st.reactions[i])} kN per kN` })),
          ...model.hinges.map((h, i) => ({ item: `Hinge shear H${i + 1} at x = ${f2(h)} m: ${f3(st.hingeShears[i])} kN per kN` })),
        ],
      },
      {
        title: `Influence line — ${effName}`,
        lines: pts.map((p) => ({
          item: `x = ${f2(p.x)} m${p.tag ? ` (${p.tag})` : ''}: ${f3(p.v)} ${unitLabel}`,
        })),
        note: 'The line is exactly piecewise linear between these stations: reactions are linear in the load position, kinked only where the load crosses a hinge; the shear line jumps where the load crosses the section itself.',
      },
    ]
    if (wLive > 0 || pLive > 0) {
      const yExt = sign === 1 ? extMax : extMin
      out.push({
        title: `Placing the live loads for the ${target === 'max' ? 'maximum' : 'minimum'} ${effName}`,
        lines: [
          { text: `The ${sign === 1 ? 'positive' : 'negative'} region${placement.regions.length === 1 ? '' : 's'} of the line — where a uniform patch adds load effect of the wanted sign: ${placement.regions.map((r) => `${f2(r.a)}–${f2(r.b)} m (length ${f2(r.length)} m, area ${f3(r.area)})`).join('; ')}.` },
          { tex: `F_{udl} = w\\,\\text{Σ}A = ${f2(wLive)} \\times ${f3(patchArea)} = ${f2(placement.udlEffect)}\\;\\text{${unitLabel.split(' ')[0]}}` },
          ...(yExt ? [{ tex: `F_{P} = P\\,y_{ext} = ${f2(pLive)} \\times ${f3(yExt.v)} = ${f2(placement.pointEffect ?? 0)}\\;\\text{at } x = ${f2(yExt.x)}\\text{ m}${yExt.tag ? `\\,(${yExt.tag})` : ''}` }] : []),
          { tex: `F_{live} = ${f2(placement.liveTotal)}\\;\\text{${unitLabel.split(' ')[0]}}` },
        ],
      })
    }
    if (wDead > 0) {
      out.push({
        title: 'Dead load — always the whole span',
        lines: [
          { text: 'Dead load cannot be placed: it sits on every metre of the beam, so its effect is w_dead times the total signed area of the influence line — over the negative regions as well as the positive ones.' },
          { tex: `F_{dead} = w_d \\int_0^{L}\\! IL\\,dx = ${f2(wDead)} \\times ${f3(ilTotalArea(pts))} = ${f2(deadEffect)}\\;\\text{${unitLabel.split(' ')[0]}}` },
          { tex: `F_{dead+live} = ${f2(deadEffect)} + ${f2(placement.liveTotal)} = ${f2(deadEffect + placement.liveTotal)}\\;\\text{${unitLabel.split(' ')[0]}}` },
        ],
      })
    }
    if (sample) {
      out.push({
        title: 'Sample problem — answers (a)–(d)',
        lines: [
          { text: `(a) Total length under the live UDL for maximum negative moment at C: ${f2(sample.negLen)} m — the overhang A–B, the only stretch where the M_C influence line is negative.` },
          { text: `(b) Total length under the dead UDL: ${f2(length)} m — dead load acts on the entire beam. Its net moment at C is ${signed(sample.deadM)} kN·m; the positive region of the line alone measures ${f2(sample.posLen)} m.` },
          { text: `(c) Maximum negative moment at C: ${signed(sample.maxNegM)} kN·m = dead ${signed(sample.deadM)} + live ${signed(sample.pM.liveTotal)} (UDL ${signed(sample.pM.udlEffect)} over ${f2(sample.negLen)} m + the 90 kN at A: ${signed(sample.pM.pointEffect ?? NaN)}).` },
          { text: `(d) Maximum positive shear at C: ${signed(sample.maxPosV)} kN = dead ${signed(sample.deadV)} + live ${signed(sample.pV.liveTotal)} (UDL ${signed(sample.pV.udlEffect)} over the positive regions + the 90 kN just right of C: ${signed(sample.pV.pointEffect ?? NaN)}).` },
        ],
      })
    }
    return out
  })()

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-5 sm:px-7">
      <ReportControls title="Influence Lines Report" badges={['Continuous beam']} />
      <p className="mt-2 max-w-3xl text-sm text-muted">
        Influence lines for a determinate continuous beam — any arrangement of supports and internal
        hinges (Gerber construction). Scrub the unit load, read the line of a reaction, a section
        shear or moment, or a hinge shear, and let the page place the lane loads on the sign regions
        that govern.
      </p>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        {/* ── inputs (hoisted above so they survive an unsolvable layout) ── */}
        {inputsColumn}

        {/* ── results & drawings ── */}
        <div className="space-y-5">
          {sample && (
            <ResultCard title="Sample problem — answers (a)–(d)">
              <Row label="(a) Length under the live UDL for max negative M at C" value={`${f2(sample.negLen)} m`} sub="the overhang A–B — the negative region of the M_C line" />
              <Row label="(b) Length under the dead UDL" value={`${f2(length)} m`} sub={`the whole beam; net M_C from dead = ${signed(sample.deadM)} kN·m (positive region: ${f2(sample.posLen)} m)`} />
              <Row label="(c) Maximum negative moment at C" value={`${signed(sample.maxNegM)} kN·m`} sub={`dead ${signed(sample.deadM)} + live ${signed(sample.pM.liveTotal)} (w·A ${signed(sample.pM.udlEffect)}, P at A ${signed(sample.pM.pointEffect ?? NaN)})`} />
              <Row label="(d) Maximum positive shear at C" value={`${signed(sample.maxPosV)} kN`} sub={`dead ${signed(sample.deadV)} + live ${signed(sample.pV.liveTotal)} (w·A ${signed(sample.pV.udlEffect)}, P just right of C ${signed(sample.pV.pointEffect ?? NaN)})`} />
            </ResultCard>
          )}

          <ResultCard title={`Selected effect — ${effName}`}>
            <Row label={`Ordinate at x = ${f2(unitXc)} m`} value={`${signed(ordNow)} ${unitLabel}`} />
            <Row label="IL maximum" value={extMax ? `+${f3(extMax.v)} at x = ${f2(extMax.x)} m` : '—'} sub={extMax?.tag} />
            <Row label="IL minimum" value={extMin ? `${f3(extMin.v)} at x = ${f2(extMin.x)} m` : '—'} sub={extMin?.tag} />
            <Row label={`Live: ${f2(wLive)} kN/m patch + ${f2(pLive)} kN point`} value={`${signed(placement.liveTotal)} ${unitLabel.split(' ')[0]}`}
              sub={`patch ${f2(placement.udlLength)} m over ${placement.regions.length} region${placement.regions.length === 1 ? '' : 's'} (ΣA = ${f3(patchArea)}), point on the extreme ordinate`} />
            <Row label={`Dead: ${f2(wDead)} kN/m over the whole span`} value={`${signed(deadEffect)} ${unitLabel.split(' ')[0]}`} sub={`total signed area = ${f3(ilTotalArea(pts))}`} />
            <Row label="Dead + live" value={`${signed(deadEffect + placement.liveTotal)} ${unitLabel.split(' ')[0]}`} />
          </ResultCard>

          <DrawingCard title="Beam figure" meta={`L = ${f2(length)} m · ${supports.length} supports · ${hinges.length} hinge${hinges.length === 1 ? '' : 's'}`}>
            <DrawingFrame label="Beam figure with supports, hinges and the unit load at its current position">
              <BeamFigure length={length} supports={supports} hinges={hinges} stations={letters}
                sectionX={effect.kind === 'shear' || effect.kind === 'moment' ? effXc : null}
                unitX={unitXc} highlight={placement.regions} />
            </DrawingFrame>
          </DrawingCard>

          <DrawingCard title="Free-body diagram" meta={fbd === 'unit' ? 'unit-load state' : 'governing live placement + dead'}>
            <DrawingFrame label="Free-body diagram with reactions and applied loads">
              <FreeBodyDiagram length={length} supports={supports} hinges={hinges} stations={letters}
                sectionX={effect.kind === 'shear' || effect.kind === 'moment' ? effXc : null}
                mode={fbd} unitX={unitXc}
                reactions={fbdState.reactions} hingeShears={fbdState.hingeShears}
                loads={fbd === 'governing'
                  ? { regions: placement.regions, w: wLive, point: fbdState.point, dead: wDead }
                  : undefined} />
            </DrawingFrame>
            <div className="mt-2 max-w-[240px]">
              <Pick label="Scenario" value={fbd} onChange={(v) => setFbd(v as 'unit' | 'governing')}
                options={[['unit', 'Unit load at x'], ['governing', 'Governing placement']]} />
            </div>
          </DrawingCard>

          <DrawingCard title={`Influence line — ${effName}`} meta="ordinates in kN per kN (moments: kN·m per kN)">
            <DrawingFrame label={`Influence line of ${effName}`}>
              <BeamILPlot pts={pts} length={length} unitX={unitXc} regions={placement.regions}
                unitLabel={unitLabel} valueAt={(x) => ilValueAt(pts, x)} />
            </DrawingFrame>
          </DrawingCard>

          <ResultCard title="Ordinates of the influence line">
            <table className="w-full text-xs">
              <thead className="text-muted">
                <tr className="text-left">
                  <th className="py-1 pr-2 font-semibold">Station</th>
                  <th className="pr-2 font-semibold">x (m)</th>
                  <th className="pr-2 text-right font-semibold">Ordinate</th>
                  <th className="text-right font-semibold">Sign</th>
                </tr>
              </thead>
              <tbody>
                {pts.map((p, k) => {
                  const letter = letters.find((l) => Math.abs(l.x - p.x) < 1e-9)?.letter
                  return (
                    <tr key={k} className={`border-t border-hairline-2 ${Math.abs(p.x - unitXc) < 1e-9 ? 'bg-brand-tint' : ''}`}>
                      <td className="py-1 pr-2 font-mono">{letter ?? '—'}{p.tag ? <span className="ml-1 text-[9px] text-faint">{p.tag}</span> : null}</td>
                      <td className="pr-2 font-mono">{f2(p.x)}</td>
                      <td className="pr-2 text-right font-mono font-semibold">{f3(p.v)}</td>
                      <td className={`text-right font-mono font-semibold ${p.v > 5e-7 ? 'text-brand' : p.v < -5e-7 ? 'text-fail' : 'text-faint'}`}>
                        {Math.abs(p.v) < 5e-7 ? 'zero' : p.v > 0 ? 'positive' : 'negative'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </ResultCard>
        </div>
      </div>

      <div className="mt-6">
        <WorkedSolution steps={steps} title="Influence Lines — step-by-step (beam with hinges)" />
      </div>
    </div>
  )
}

// ── the drawings (inline so every annotated SVG shares the file that wraps
//    it in a DrawingFrame — the same contract the truss mode keeps) ─────────
//
// SVG drawings for the beam influence-lines mode: the beam figure (stations,
// supports, hinges, dimension chain, section marker, the walking unit load),
// the free-body diagram (unit-load state or the governing placement), and the
// influence-line plot with sign fills and the placement regions highlighted.

export interface FigSupport { x: number; kind: 'pin' | 'roller' }

const MONO = "'IBM Plex Mono', monospace"

// ── beam figure ───────────────────────────────────────────────────────────

export function BeamFigure({ length, supports, hinges, stations, sectionX, unitX, highlight }: {
  length: number
  supports: FigSupport[]
  hinges: number[]
  stations: { x: number; letter: string }[]
  sectionX: number | null
  unitX: number
  highlight?: { a: number; b: number }[]
}) {
  const W = 620, H = 208
  const padL = 34, padR = 34
  const sc = (W - padL - padR) / length
  const X = (v: number) => padL + v * sc
  const BY = 78                                    // beam line

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Beam figure with supports, hinges and the unit load at its current position">
      {/* placement highlight strips */}
      {(highlight ?? []).map((r, i) => (
        <rect key={i} x={X(r.a)} y={BY - 10} width={Math.max(1, X(r.b) - X(r.a))} height={20} fill={TINT_LOAD} stroke={AMBER} strokeWidth={0.8} strokeDasharray="3 2" />
      ))}

      {/* dimension chain between stations */}
      {stations.slice(0, -1).map((s, i) => {
        const b = stations[i + 1]
        const y = 136
        return (
          <g key={i} stroke={FAINT} strokeWidth={1}>
            <line x1={X(s.x)} y1={y} x2={X(b.x)} y2={y} />
            <line x1={X(s.x)} y1={y - 4} x2={X(s.x)} y2={y + 4} />
            <line x1={X(b.x)} y1={y - 4} x2={X(b.x)} y2={y + 4} />
            <text x={(X(s.x) + X(b.x)) / 2} y={y + 14} textAnchor="middle" fontSize={9.5} fill={FAINT} fontFamily={MONO} stroke="none">{f2(b.x - s.x)} m</text>
          </g>
        )
      })}

      {/* section marker */}
      {sectionX != null && (
        <g>
          <line x1={X(sectionX)} y1={30} x2={X(sectionX)} y2={BY + 26} stroke={AMBER} strokeWidth={1.2} strokeDasharray="4 3" />
          <text x={X(sectionX) + (sectionX > length / 2 ? -7 : 7)} y={40} textAnchor={sectionX > length / 2 ? 'end' : 'start'} fontSize={9.5} fill="#b45309" fontFamily={MONO} fontWeight={600}>section</text>
        </g>
      )}

      {/* the beam */}
      <line x1={X(0)} y1={BY} x2={X(length)} y2={BY} stroke={INK} strokeWidth={4} strokeLinecap="round" />

      {/* hinges — moment releases sit on the beam line */}
      {hinges.map((h, i) => (
        <g key={i}>
          <circle cx={X(h)} cy={BY} r={4.5} fill="#ffffff" stroke={INK} strokeWidth={1.6} />
          <text x={X(h)} y={BY - 10} textAnchor="middle" fontSize={9} fill={MUTED} fontFamily={MONO}>hinge{i + 1}</text>
        </g>
      ))}

      {/* supports */}
      {supports.map((s, i) => (
        <g key={i} stroke={MUTED} strokeWidth={1.4} fill="none">
          <path d={`M${X(s.x) - 8},${BY + 12} L${X(s.x)},${BY} L${X(s.x) + 8},${BY + 12} Z`} fill="#f4f3ef" />
          {s.kind === 'roller'
            ? <>
              <circle cx={X(s.x) - 4} cy={BY + 15} r={2.4} />
              <circle cx={X(s.x) + 4} cy={BY + 15} r={2.4} />
            </>
            : <line x1={X(s.x) - 8} y1={BY + 12} x2={X(s.x) + 8} y2={BY + 12} />}
        </g>
      ))}

      {/* station letters */}
      {stations.map((s) => (
        <text key={s.letter} x={X(s.x)} y={BY - 22} textAnchor="middle" fontSize={11.5} fontWeight={700} fill={INK} fontFamily={MONO}>{s.letter}</text>
      ))}

      {/* unit load */}
      <g>
        <line x1={X(unitX)} y1={BY - 56} x2={X(unitX)} y2={BY - 8} stroke={AMBER} strokeWidth={2.2} strokeLinecap="round" />
        <path d={`M${X(unitX) - 5},${BY - 14} L${X(unitX)},${BY - 4} L${X(unitX) + 5},${BY - 14} Z`} fill={AMBER} />
        <text x={X(unitX)} y={BY - 62} textAnchor="middle" fontSize={10} fill={AMBER} fontFamily={MONO} fontWeight={600}>1 kN</text>
      </g>
    </svg>
  )
}

// ── free-body diagram ─────────────────────────────────────────────────────

function upArrow(x: number, y1: number, y2: number, color: string) {
  return (
    <g>
      <line x1={x} y1={y1} x2={x} y2={y2} stroke={color} strokeWidth={2.2} strokeLinecap="round" />
      <path d={`M${x - 5},${y2 + 10} L${x},${y2} L${x + 5},${y2 + 10} Z`} fill={color} />
    </g>
  )
}
function downArrow(x: number, y1: number, y2: number, color: string) {
  return (
    <g>
      <line x1={x} y1={y1} x2={x} y2={y2} stroke={color} strokeWidth={2.2} strokeLinecap="round" />
      <path d={`M${x - 5},${y2 - 10} L${x},${y2} L${x + 5},${y2 - 10} Z`} fill={color} />
    </g>
  )
}

/** Uniform-load curtain: fill + a row of small arrows down to the beam. */
function curtain(x0: number, x1: number, beamY: number, topY: number, color: string, fill: string, label: string) {
  if (x1 - x0 < 1) return null
  const arrows: number[] = []
  const n = Math.max(2, Math.min(14, Math.round((x1 - x0) / 26)))
  for (let k = 0; k <= n; k++) arrows.push(x0 + (k * (x1 - x0)) / n)
  return (
    <g>
      <rect x={x0} y={topY} width={x1 - x0} height={beamY - topY} fill={fill} />
      <line x1={x0} y1={topY} x2={x1} y2={topY} stroke={color} strokeWidth={1.6} />
      {arrows.map((ax, k) => (
        <line key={k} x1={ax} y1={topY} x2={ax} y2={beamY - 2} stroke={color} strokeWidth={1} />
      ))}
      {arrows.map((ax, k) => (
        <path key={`h${k}`} d={`M${ax - 3},${beamY - 8} L${ax},${beamY - 2} L${ax + 3},${beamY - 8} Z`} fill={color} />
      ))}
      <text x={x0 + 4} y={topY - 5} fontSize={9.5} fill={color} fontFamily={MONO} fontWeight={600}>{label}</text>
    </g>
  )
}

export function FreeBodyDiagram({ length, supports, hinges, stations, sectionX, mode, unitX, reactions, hingeShears, loads }: {
  length: number
  supports: FigSupport[]
  hinges: number[]
  stations: { x: number; letter: string }[]
  sectionX: number | null
  mode: 'unit' | 'governing'
  unitX: number
  reactions: number[]
  hingeShears: number[]
  loads?: { regions: { a: number; b: number }[]; w: number; point: { x: number; p: number } | null; dead: number }
}) {
  const W = 620, H = 218
  const padL = 34, padR = 34
  const sc = (W - padL - padR) / length
  const X = (v: number) => padL + v * sc
  const BY = 96
  const letter = (x: number) => stations.find((s) => Math.abs(s.x - x) < 1e-9)?.letter ?? f2(x)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Free-body diagram with reactions and applied loads">
      {/* alternating body tints make the hinged segmentation readable */}
      {hinges.length > 0 && [...hinges, length].map((h, i) => {
        const a = i === 0 ? 0 : hinges[i - 1]
        return i % 2 === 1
          ? <rect key={i} x={X(a)} y={BY - 6} width={Math.max(1, X(h) - X(a))} height={12} fill={TINT_T} />
          : null
      })}

      {/* governing placement: dead curtain over the whole span, live curtains on the regions, the point load */}
      {mode === 'governing' && loads && (
        <>
          {loads.dead > 0 && curtain(X(0), X(length), BY - 2, 44, MUTED, '#eeeeea', `${f2(loads.dead)} kN/m dead`)}
          {loads.w > 0 && loads.regions.map((r, i) => (
            <g key={i}>{curtain(X(r.a), X(r.b), BY - 2, 30, '#b45309', TINT_LOAD, `${f2(loads.w)} kN/m live`)}</g>
          ))}
          {loads.point && loads.point.p !== 0 && (
            <g>
              {downArrow(X(loads.point.x), 8, BY - 6, FAIL)}
              <text x={X(loads.point.x)} y={6} textAnchor="middle" fontSize={10} fill={FAIL} fontFamily={MONO} fontWeight={600}>{f2(loads.point.p)} kN</text>
            </g>
          )}
        </>
      )}

      {/* unit-load state: the single walking load */}
      {mode === 'unit' && downArrow(X(unitX), 34, BY - 6, AMBER)}
      {mode === 'unit' && (
        <text x={X(unitX)} y={28} textAnchor="middle" fontSize={10} fill={AMBER} fontFamily={MONO} fontWeight={600}>1 kN</text>
      )}

      {/* the beam */}
      <line x1={X(0)} y1={BY} x2={X(length)} y2={BY} stroke={INK} strokeWidth={4} strokeLinecap="round" />

      {/* hinges + transmitted shear */}
      {hinges.map((h, i) => (
        <g key={i}>
          <circle cx={X(h)} cy={BY} r={4.5} fill="#ffffff" stroke={INK} strokeWidth={1.6} />
          {Math.abs(hingeShears[i] ?? 0) > 5e-7 && (
            <>
              {(hingeShears[i] ?? 0) > 0 ? upArrow(X(h), BY + 40, BY + 8, BRAND) : downArrow(X(h), BY + 8, BY + 40, BRAND)}
              <text x={X(h) + 6} y={BY + 52} textAnchor="middle" fontSize={9} fill={BRAND} fontFamily={MONO}>H{i + 1} = {f3(hingeShears[i] ?? 0)}</text>
            </>
          )}
        </g>
      ))}

      {/* supports + reaction arrows with their solved values */}
      {supports.map((s, i) => {
        const r = reactions[i] ?? 0
        const lab = `R${letter(s.x)} = ${f3(r)} kN`
        const labY = i % 2 === 0 ? BY + 46 : BY + 62
        const last = i === supports.length - 1
        return (
          <g key={i}>
            <g stroke={MUTED} strokeWidth={1.4} fill="none">
              <path d={`M${X(s.x) - 8},${BY + 12} L${X(s.x)},${BY} L${X(s.x) + 8},${BY + 12} Z`} fill="#f4f3ef" />
              {s.kind === 'roller'
                ? <>
                  <circle cx={X(s.x) - 4} cy={BY + 15} r={2.4} />
                  <circle cx={X(s.x) + 4} cy={BY + 15} r={2.4} />
                </>
                : <line x1={X(s.x) - 8} y1={BY + 12} x2={X(s.x) + 8} y2={BY + 12} />}
            </g>
            {r >= 0 ? upArrow(X(s.x), BY + 44, BY + 4, BRAND) : downArrow(X(s.x), BY + 4, BY + 44, FAIL)}
            <text x={last ? X(s.x) - 10 : X(s.x)} y={labY} textAnchor={last ? 'end' : 'middle'} fontSize={9} fill={r >= 0 ? BRAND : FAIL} fontFamily={MONO}>{lab}</text>
          </g>
        )
      })}

      {/* station letters + section marker */}
      {stations.map((s) => (
        <text key={s.letter} x={X(s.x)} y={BY + 78} textAnchor="middle" fontSize={10.5} fontWeight={700} fill={INK} fontFamily={MONO}>{s.letter}</text>
      ))}
      {sectionX != null && (
        <line x1={X(sectionX)} y1={BY - 24} x2={X(sectionX)} y2={BY + 30} stroke={AMBER} strokeWidth={1.2} strokeDasharray="4 3" />
      )}
    </svg>
  )
}

// ── influence-line plot ───────────────────────────────────────────────────

export function BeamILPlot({ pts, length, unitX, regions, unitLabel, valueAt }: {
  pts: ILPoint[]
  length: number
  unitX: number
  regions?: { a: number; b: number }[]
  unitLabel: string
  valueAt: (x: number) => number
}) {
  const W = 620, H = 252, padL = 46, padR = 20, padT = 20, padB = 30
  const vmax = Math.max(0.5, ...pts.map((p) => Math.abs(p.v)))
  const X = (x: number) => padL + (x / length) * (W - padL - padR)
  const Y = (o: number) => padT + (H - padT - padB) * (1 - (o + vmax) / (2 * vmax))
  const y0 = Y(0)
  const now = valueAt(unitX)
  const seen = new Set<number>()

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Influence line of the selected effect">
      {/* placement regions — the spans the uniform patch should cover */}
      {(regions ?? []).map((r, i) => (
        <g key={i}>
          <rect x={X(r.a)} y={padT} width={Math.max(1, X(r.b) - X(r.a))} height={H - padT - padB} fill={TINT_LOAD} opacity={0.75} />
          <text x={(X(r.a) + X(r.b)) / 2} y={H - padB + 26} textAnchor="middle" fontSize={9} fill="#b45309" fontFamily={MONO} fontWeight={600}>load {f2(r.b - r.a)} m</text>
        </g>
      ))}

      {/* sign fills per segment */}
      {pts.slice(0, -1).map((p, k) => {
        const q = pts[k + 1]
        if (q.x - p.x < 1e-9) return null
        const mean = (p.v + q.v) / 2
        return (
          <path key={k}
            d={`M${X(p.x)},${y0} L${X(p.x)},${Y(p.v)} L${X(q.x)},${Y(q.v)} L${X(q.x)},${y0} Z`}
            fill={mean >= 0 ? TINT_T : TINT_C} />
        )
      })}

      {/* axes */}
      <line x1={padL} y1={y0} x2={W - padR} y2={y0} stroke={HAIR} strokeWidth={1.2} />
      <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke={HAIR} strokeWidth={1.2} />
      <text x={padL - 6} y={Y(vmax) + 3} textAnchor="end" fontSize={9} fill={MUTED} fontFamily={MONO}>+{f2(vmax)}</text>
      <text x={padL - 6} y={y0 + 3} textAnchor="end" fontSize={9} fill={MUTED} fontFamily={MONO}>0</text>
      <text x={padL - 6} y={Y(-vmax) + 3} textAnchor="end" fontSize={9} fill={MUTED} fontFamily={MONO}>−{f2(vmax)}</text>
      <text x={W - padR} y={H - 2} textAnchor="end" fontSize={9} fill={FAINT} fontFamily={MONO}>load position x (m) · {unitLabel}</text>

      {/* x ticks at the ordinate stations */}
      {pts.map((p, k) => (
        seen.has(p.x) ? null : (seen.add(p.x),
          <g key={k}>
            <line x1={X(p.x)} y1={H - padB} x2={X(p.x)} y2={H - padB + 4} stroke={HAIR} />
            <text x={X(p.x)} y={H - padB + 15} textAnchor="middle" fontSize={9} fill={FAINT} fontFamily={MONO}>{f2(p.x)}</text>
          </g>)
      ))}

      {/* the line (a duplicate x draws the classical shear jump) */}
      <polyline points={pts.map((p) => `${X(p.x)},${Y(p.v)}`).join(' ')} fill="none" stroke={INK} strokeWidth={2} strokeLinejoin="round" />

      {/* ordinate labels — jump pairs split left/right so they never collide */}
      {pts.map((p, k) => {
        const jump = k > 0 && Math.abs(pts[k - 1].x - p.x) < 1e-9
        const jumpStart = k < pts.length - 1 && Math.abs(pts[k + 1].x - p.x) < 1e-9
        const anchor = jump ? 'end' : jumpStart ? 'start' : 'middle'
        const dx = jump ? -7 : jumpStart ? 7 : 0
        return (
          <g key={k}>
            <circle cx={X(p.x)} cy={Y(p.v)} r={2.6} fill={Math.abs(p.v) > 5e-7 ? BRAND : '#b9b5aa'} />
            <text x={X(p.x) + dx} y={p.v >= 0 ? Y(p.v) - 7 : Y(p.v) + 14} textAnchor={anchor} fontSize={9} fill={MUTED} fontFamily={MONO}>{f3(p.v)}</text>
          </g>
        )
      })}

      {/* scrub position */}
      <line x1={X(unitX)} y1={padT - 6} x2={X(unitX)} y2={H - padB} stroke={AMBER} strokeWidth={1.2} strokeDasharray="4 3" />
      <circle cx={X(unitX)} cy={Y(now)} r={4} fill={AMBER} stroke={INK} strokeWidth={1} />
      <text x={X(unitX) + (unitX > length / 2 ? -6 : 6)} y={padT + 6}
        textAnchor={unitX > length / 2 ? 'end' : 'start'}
        fontSize={10} fill="#b45309" fontFamily={MONO} fontWeight={600}>{f2(unitX)} m → {f3(now)}</text>
    </svg>
  )
}
