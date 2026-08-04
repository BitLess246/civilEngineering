// ─────────────────────────────────────────────────────────────────────────
// What ld, ldh, ls and cb actually are, drawn.
//
// The page returns four lengths in millimetres and never says what any of
// them is measured BETWEEN. Four things the numbers cannot carry:
//
//   • ld is measured FROM THE CRITICAL SECTION — the section where the bar
//     is stressed to fy — not from the face of the support and not from the
//     end of the bar. Getting the datum wrong is the usual way a bar ends up
//     short on site while the calculation says it is fine.
//   • A HOOK is measured to the OUTSIDE END of the bend, and the 12db tail
//     is NOT part of ldh. Detailers routinely include it and lose the tail.
//   • A LAP is a length of OVERLAP between two bars, not the length of
//     either bar, and Class B is 1.3× Class A because more of the steel is
//     spliced at one section.
//   • cb is measured to the bar CENTRE, not to its surface — the difference
//     is db/2, which is enough to move (cb+Ktr)/db a long way.
//
// Geometry only. `engine/devLength` decides every number; this labels them.
// ─────────────────────────────────────────────────────────────────────────

const INK = '#37526e'
const CONC = '#eef3f8'
const BAR = '#0f4c92'
const CRIT = '#c2402a'
const DIM = '#1f77b4'
const FAINT = '#a39d8d'
const TIE = '#0e7490'

export interface DevLengthDetailProps {
  /** Bar diameter, mm — everything is drawn relative to it. */
  db: number
  /** Lengths from the engine, mm. */
  ld: number
  ldh: number
  ls_B: number
  hookTail: number
  hookBendDia: number
  /** Splice class currently being described. */
  spliceClass?: 'A' | 'B'
}

/** Panel geometry — every panel is drawn in the same box and then placed. */
const PW = 300, PH = 152, GAP = 26

export function DevLengthDetail(p: DevLengthDetailProps) {
  const { db, ld, ldh, ls_B, hookTail, hookBendDia } = p
  const W = PW * 2 + GAP, H = PH * 2 + GAP + 16

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block h-auto w-full"
      style={{ fontFamily: 'Arial, sans-serif' }}>
      <defs>
        <marker id="dl-tick" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M1 5 L5 1" stroke={DIM} strokeWidth="1.2" fill="none" />
        </marker>
      </defs>

      <g transform="translate(0,0)"><StraightPanel ld={ld} db={db} /></g>
      <g transform={`translate(${PW + GAP},0)`}>
        <HookPanel ldh={ldh} db={db} tail={hookTail} bend={hookBendDia} />
      </g>
      <g transform={`translate(0,${PH + GAP})`}>
        <SplicePanel ls={ls_B} db={db} cls={p.spliceClass ?? 'B'} />
      </g>
      <g transform={`translate(${PW + GAP},${PH + GAP})`}><ConfinePanel db={db} /></g>
    </svg>
  )
}

function Title({ n, text, sub }: { n: string; text: string; sub: string }) {
  return (
    <g>
      <text x={0} y={9} fontSize={8.5} fontWeight={700} fill={INK}>{n}  {text}</text>
      <text x={0} y={19} fontSize={7} fill={FAINT}>{sub}</text>
    </g>
  )
}

/** ─ A ─ straight development in tension, and where it is measured from. */
function StraightPanel({ ld, db }: { ld: number; db: number }) {
  const x0 = 30, xEnd = PW - 14, yb = 88          // the bar
  const xCrit = x0 + 26                            // the critical section
  return (
    <g>
      <Title n="A" text="DEVELOPMENT IN TENSION — ℓd"
        sub="measured from the critical section to the end of the bar" />

      {/* concrete, with the member continuing off to the left */}
      <rect x={x0 - 26} y={58} width={xEnd - x0 + 34} height={54} fill={CONC} stroke={INK} strokeWidth={1.1} />

      {/* the critical section: where the bar is stressed to fy */}
      {/* Labels sit to the RIGHT of the line: anchored `end` on its left they
          ran off the panel, and this panel is the leftmost one, so off the
          panel means off the drawing. */}
      <line x1={xCrit} y1={50} x2={xCrit} y2={120} stroke={CRIT} strokeWidth={1.6} strokeDasharray="5 3" />
      <text x={xCrit + 4} y={40} fontSize={7} fill={CRIT}>critical section</text>
      <text x={xCrit + 4} y={49} fontSize={6.5} fill={FAINT}>bar stressed to fy here</text>

      {/* the bar, running through the critical section and beyond */}
      <line x1={x0 - 24} y1={yb} x2={xEnd} y2={yb} stroke={BAR} strokeWidth={3} strokeLinecap="round" />

      {/* ld, dimensioned between the two things it is actually measured between */}
      <Dim x1={xCrit} x2={xEnd} y={128} label={`ℓd = ${Math.round(ld)} mm`} />
      <text x={(xCrit + xEnd) / 2} y={144} fontSize={6.5} fill={FAINT} textAnchor="middle">
        = {(ld / db).toFixed(0)} db · NOT measured from the support face
      </text>

      {/* the bond stress that has to add up to the bar force */}
      {Array.from({ length: 9 }, (_, k) => {
        const x = xCrit + 8 + k * ((xEnd - xCrit - 12) / 8)
        return (
          <g key={k} stroke={FAINT} strokeWidth={0.8}>
            <line x1={x} y1={yb - 9} x2={x} y2={yb - 4} />
            <line x1={x} y1={yb + 4} x2={x} y2={yb + 9} />
          </g>
        )
      })}
      <text x={xEnd} y={yb - 13} fontSize={6.5} fill={FAINT} textAnchor="end">bond over the full length</text>
    </g>
  )
}

/** ─ B ─ standard hook: measured to the OUTSIDE of the bend, tail excluded. */
function HookPanel({ ldh, db, tail, bend }: { ldh: number; db: number; tail: number; bend: number }) {
  // xOut has to leave room for BOTH the tail and its dimension inside the
  // panel, and the tail has to finish inside the concrete — a hook tail
  // drawn poking out of the member is the opposite of the detail's point.
  const xCrit = 44, xOut = PW - 78, yb = 74
  const r = 11                                     // drawn bend radius
  const tailLen = 24
  return (
    <g>
      <Title n="B" text="STANDARD HOOK — ℓdh"
        sub="measured to the OUTSIDE of the bend; the 12db tail is extra" />

      <rect x={20} y={48} width={PW - 40} height={68} fill={CONC} stroke={INK} strokeWidth={1.1} />
      <line x1={xCrit} y1={40} x2={xCrit} y2={122} stroke={CRIT} strokeWidth={1.6} strokeDasharray="5 3" />
      <text x={xCrit + 4} y={38} fontSize={7} fill={CRIT}>critical section</text>

      {/* straight run, 90° bend, then the tail going DOWN */}
      <path
        d={`M${xCrit - 26} ${yb} L${xOut - r} ${yb} A ${r} ${r} 0 0 1 ${xOut} ${yb + r} L${xOut} ${yb + r + tailLen}`}
        fill="none" stroke={BAR} strokeWidth={3} strokeLinecap="round" />

      {/* ldh stops at the OUTSIDE face of the bend — the point of the panel */}
      <Dim x1={xCrit} x2={xOut} y={128} label={`ℓdh = ${Math.round(ldh)} mm`} />

      {/* the tail, dimensioned separately so it cannot be read as part of ldh */}
      <g>
        <line x1={xOut + 12} y1={yb + r} x2={xOut + 12} y2={yb + r + tailLen} stroke={DIM} strokeWidth={0.9} />
        {[yb + r, yb + r + tailLen].map((y) => (
          <line key={y} x1={xOut + 9} y1={y + 3} x2={xOut + 15} y2={y - 3} stroke={DIM} strokeWidth={1.1} />
        ))}
        <text x={xOut + 17} y={yb + r + tailLen / 2 + 3} fontSize={7} fill={DIM}>
          12db = {Math.round(tail)}
        </text>
      </g>
      <text x={20} y={PH - 4} fontSize={6.5} fill={FAINT}>
        min inside bend ⌀ {Math.round(bend)} mm ({db <= 25 ? '6db' : '8db'}, §25.3.1) · ℓdh ≥ max(8db, 150)
      </text>
    </g>
  )
}

/** ─ C ─ a lap splice: the OVERLAP, not the bar length. */
function SplicePanel({ ls, db, cls }: { ls: number; db: number; cls: 'A' | 'B' }) {
  const yA = 74, yB = 84
  const xLapL = 74, xLapR = PW - 74
  return (
    <g>
      <Title n="C" text={`TENSION LAP SPLICE — ℓst (Class ${cls})`}
        sub="the length the two bars OVERLAP, in contact, side by side" />

      <rect x={14} y={54} width={PW - 28} height={52} fill={CONC} stroke={INK} strokeWidth={1.1} />

      {/* two bars, overlapping over ls — drawn on slightly different levels
          because a contact lap sits the bars against each other, not in line */}
      <line x1={20} y1={yA} x2={xLapR} y2={yA} stroke={BAR} strokeWidth={3} strokeLinecap="round" />
      <line x1={xLapL} y1={yB} x2={PW - 20} y2={yB} stroke={BAR} strokeWidth={3} strokeLinecap="round" />

      <Dim x1={xLapL} x2={xLapR} y={120} label={`ℓst = ${Math.round(ls)} mm`} />
      <text x={PW / 2} y={136} fontSize={6.5} fill={FAINT} textAnchor="middle">
        = {(ls / db).toFixed(0)} db · Class B = 1.3 × ℓd; Class A only if ≤50% spliced and As,prov ≥ 2As,req
      </text>
      <text x={PW / 2} y={146} fontSize={6.5} fill={CRIT} textAnchor="middle">
        Stagger the splices — this is the overlap, not the bar length.
      </text>
    </g>
  )
}

/** ─ D ─ the section, and what cb is measured to. */
function ConfinePanel({ db }: { db: number }) {
  const cx = PW / 2, cy = 84
  const bw = 116, bh = 62
  const l = cx - bw / 2, t = cy - bh / 2
  const barY = cy + bh / 2 - 16
  const bars = [-1, 0, 1].map((k) => cx + k * 30)
  return (
    <g>
      <Title n="D" text="SECTION — what cb and Ktr measure"
        sub="cb is to the bar CENTRE, not to its surface" />

      {/* the beam section */}
      <rect x={l} y={t} width={bw} height={bh} fill={CONC} stroke={INK} strokeWidth={1.2} />
      {/* the tie that supplies Ktr */}
      <rect x={l + 7} y={t + 7} width={bw - 14} height={bh - 14} fill="none" stroke={TIE} strokeWidth={1.6} rx={4} />
      {/* the bars being developed */}
      {bars.map((x) => <circle key={x} cx={x} cy={barY} r={4} fill={BAR} />)}

      {/* cb, side branch: to the CENTRE of the corner bar */}
      <g>
        <line x1={l} y1={barY} x2={bars[0]} y2={barY} stroke={DIM} strokeWidth={0.9} />
        {[l, bars[0]].map((x) => <line key={x} x1={x - 3} y1={barY + 4} x2={x + 3} y2={barY - 4} stroke={DIM} strokeWidth={1.1} />)}
        <text x={(l + bars[0]) / 2} y={barY - 7} fontSize={7} fill={DIM} textAnchor="middle"
          paintOrder="stroke" stroke="#fff" strokeWidth={2.4}>cb</text>
      </g>
      {/* the other cb branch: half the bar spacing */}
      <g>
        <line x1={bars[0]} y1={barY + 15} x2={bars[1]} y2={barY + 15} stroke={DIM} strokeWidth={0.9} strokeDasharray="3 2" />
        <text x={(bars[0] + bars[1]) / 2} y={barY + 26} fontSize={6.5} fill={DIM} textAnchor="middle">s → cb ≤ s/2</text>
      </g>
      <text x={l + bw + 6} y={t + 14} fontSize={7} fill={TIE}>tie → Ktr</text>
      <text x={l + bw + 6} y={t + 24} fontSize={6.5} fill={FAINT}>40Atr/(s·n)</text>

      <text x={l - 16} y={PH - 4} fontSize={6.5} fill={FAINT}>
        cb = min(cover to CENTRE, s/2) · db = {db} mm · (cb + Ktr)/db ≤ 2.5
      </text>
    </g>
  )
}

/** A horizontal dimension with slash ticks and the label above the line. */
function Dim({ x1, x2, y, label }: { x1: number; x2: number; y: number; label: string }) {
  return (
    <g>
      <line x1={x1} y1={y} x2={x2} y2={y} stroke={DIM} strokeWidth={0.9} />
      {[x1, x2].map((x) => (
        <g key={x}>
          <line x1={x - 3} y1={y + 4} x2={x + 3} y2={y - 4} stroke={DIM} strokeWidth={1.2} />
          <line x1={x} y1={y - 7} x2={x} y2={y + 4} stroke={DIM} strokeWidth={0.6} />
        </g>
      ))}
      <text x={(x1 + x2) / 2} y={y - 5} fontSize={8} fontWeight={700} fill={DIM} textAnchor="middle"
        paintOrder="stroke" stroke="#fff" strokeWidth={2.6}>{label}</text>
    </g>
  )
}
