// One schedule row, opened, on the landing page. View layer.
//
// The claim the marketing makes is "every row opens into a worked solution with
// the clause numbers". This is that claim, shown rather than described — and it
// is the thing that convinces the audience this app actually has, because
// engineers discount video and believe arithmetic.
//
// ── EVERY NUMBER HERE IS REAL ───────────────────────────────────────────────
// They are the output of `designBeam` for the input in `DEMO_INPUT`, not
// plausible-looking figures typed to fill a layout. Putting invented
// engineering on a commercial landing page would be a lie in the one place the
// audience is best equipped to catch it.
//
// They are written out as literals rather than computed at render time so the
// landing page does not pull the design engine into its bundle. The safety net
// is `workedSolutionPreview.test.ts`, which runs the real engine over the same
// input and asserts every literal below still matches — so the two cannot drift
// without CI saying so.
//
// It renders as HTML, not an image: selectable, searchable, indexable, and it
// reflows on a phone instead of becoming a screenshot nobody can read.

import { DEMO_INPUT, DEMO_RESULT } from './workedSolutionData'

const R = DEMO_RESULT

function Line({ clause, children }: { clause: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-dashed border-[#ece9e1] py-1.5 last:border-0">
      <span className="text-[13px] leading-6 text-[#2b3648]">{children}</span>
      <span className="shrink-0 font-mono text-[10.5px] uppercase tracking-wide text-[#a39d8d]">{clause}</span>
    </div>
  )
}

export function WorkedSolutionPreview() {
  return (
    <div className="overflow-hidden rounded-lg border border-[#e3e1da] bg-white">
      {/* The row as it appears in the schedule, in its opened state. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-[#e3e1da] bg-[#f7f5ef] px-5 py-3">
        <span className="font-mono text-[12px] font-bold text-[#0f4c92]">B-201</span>
        <span className="text-[12.5px] text-[#5c6675]">
          {DEMO_INPUT.b}×{DEMO_INPUT.h} · f′c {DEMO_INPUT.fc} · fy {DEMO_INPUT.fy}
        </span>
        <span className="text-[12.5px] text-[#5c6675]">
          Mu {DEMO_INPUT.Mu} kN·m · Vu {DEMO_INPUT.Vu} kN
        </span>
        <span className="ml-auto rounded bg-[#e6f2e8] px-2 py-0.5 text-[11px] font-bold text-[#1f6b34]">PASS</span>
      </div>

      <div className="px-5 py-3">
        <Line clause="§409.3.1">
          Effective depth <em>d</em> = {DEMO_INPUT.h} − {DEMO_INPUT.cover} − {DEMO_INPUT.stirrupDia} − {DEMO_INPUT.barDia}/2 = <strong>{R.d} mm</strong>
        </Line>
        <Line clause="§409.6.1.2 · §421.2.2">
          ρmin = {R.rhoMin.toFixed(4)} ≤ ρ = <strong>{R.rho.toFixed(4)}</strong> ≤ ρmax = {R.rhoMax.toFixed(4)} — singly reinforced, tension-controlled
        </Line>
        <Line clause="§422.2">
          As required = <strong>{R.As.toFixed(1)} mm²</strong> → <strong>{R.bars}-⌀{DEMO_INPUT.barDia}</strong> in one layer
        </Line>
        <Line clause="§425.2.1">
          Clear spacing {R.sClear} mm ≥ minimum {R.sMinClear} mm = max(db, 25, 4⁄3·d<sub>agg</sub>)
        </Line>
        <Line clause="§422.5.5.1">
          Vc = {R.Vc} kN → φVc = <strong>{R.phiVc} kN</strong> &lt; Vu = {DEMO_INPUT.Vu} kN — stirrups required
        </Line>
        <Line clause="§422.5.10.1">
          Vs required = {R.VsReq} kN → s required = {R.sReq} mm
        </Line>
        <Line clause="§409.7.6.2.2">
          <strong>Maximum spacing governs</strong>: s = min({R.sReq}, {R.sMax}) = <strong>{R.sAdopt} mm</strong> — {R.legs}-leg ⌀{DEMO_INPUT.stirrupDia} @ {R.sAdopt} mm
        </Line>
      </div>

      <p className="border-t border-[#e3e1da] bg-[#fbfaf7] px-5 py-2.5 text-[12px] leading-relaxed text-[#5c6675]">
        Every row in every schedule opens like this — beams, columns, slabs, footings,
        steel members and connections. The same derivation prints in the PDF report.
      </p>
    </div>
  )
}
