// ─────────────────────────────────────────────────────────────────────────
// Cantilever retaining wall — the working section.
//
// The page reports two factors of safety, a bearing pressure and three bar
// areas. Four things only the drawing can settle:
//
//   • WHICH FACE THE BARS GO ON. The stem is pushed away from the fill, so
//     its tension face is the EARTH face. The toe bends up and steels its
//     BOTTOM; the heel bends down and steels its TOP. Three members, three
//     different faces — the single most common detailing error on this
//     element, and a number on its own cannot express it.
//   • WHERE THE THRUST ACTS. Earth pressure is TRIANGULAR (resultant at H/3)
//     while a surcharge is RECTANGULAR (resultant at H/2). The page adds
//     their moments; the drawing shows why they cannot be added before that.
//   • WHAT THE BASE IS SITTING ON. The bearing pressure is a trapezoid that
//     collapses to a triangle once the resultant leaves the middle third —
//     which is exactly the moment the heel starts to lift.
//   • THAT THE PRESSURE IS WHAT LOADS THE TOE. The same trapezoid is the
//     load on the toe cantilever, drawn once and used twice.
//
// LAYOUT NOTE. Bars carry numbered MARKS and are listed in a schedule below
// the section, rather than each having a leader out to its own block of
// text. The first version used long leaders and they collided with the
// dimension lines and ran past the frame — which is also why real detail
// sheets mark and schedule instead of annotating in place.
//
// Geometry only. `engine/retainingWall` decides everything; every number
// here is passed in and labelled, never recomputed.
// ─────────────────────────────────────────────────────────────────────────

const INK = '#37526e'
const CONC = '#eef3f8'
const SOIL = '#e7e2d4'
const EARTH = '#c2402a'      // active pressure — what pushes the wall over
const BEAR = '#0e7490'       // bearing pressure — what holds it up
const BAR = '#0f4c92'        // reinforcement
const DIM = '#1f77b4'
const FAINT = '#a39d8d'
const GRID = '#d8d3c6'

export interface RetainingWallSectionProps {
  /** Geometry, mm — as entered on the page. */
  Hs: number; tb: number; ts: number; bt: number; bh: number
  /** Service earth-pressure resultants, kN/m, and the surcharge, kPa. */
  Pa: number; Pq: number; q_sur: number
  /** Retained height and base width, m. */
  H: number; B: number
  /** Service bearing pressures at toe and heel, kPa. */
  q_max: number; q_min: number
  /** Resultant position from the toe and its eccentricity, m. */
  xbar: number; e: number
  /** Bar callouts, already formatted (e.g. "⌀16 @ 250"). */
  bars: { stem: string; toe: string; heel: string; temp: string }
}

export function RetainingWallSection(p: RetainingWallSectionProps) {
  const { Hs, tb, ts, bt, bh, H, B, q_max, q_min, xbar, e, bars } = p

  // ── frame ───────────────────────────────────────────────────────────────
  // Left carries the two vertical dimensions and the (uncounted) passive
  // wedge; right carries the pressure diagram and its two resultants; below
  // the section sit the dimension chain, the bearing diagram and the bar
  // schedule, each in its own band so nothing can overlap anything else.
  // The surcharge arrows and their label live ABOVE the ground line, so the
  // top margin has to grow to make room for them — otherwise they print
  // through the drawing's own subtitle.
  const ML = 132, MR = 244, MT = p.q_sur > 0 ? 78 : 54
  const DRAW_H = 300
  const wallH = (Hs + tb) / 1000
  const s = DRAW_H / Math.max(wallH, 1e-9)          // m → px, both axes
  const bw = B * s

  const x0 = ML                                     // the toe (x = 0)
  const yTop = MT, yBase = MT + (Hs / 1000) * s, yBot = MT + DRAW_H
  const xStemL = x0 + (bt / 1000) * s
  const xStemR = xStemL + (ts / 1000) * s
  const xHeel = x0 + bw

  // bands below the section
  const yDim1 = yBot + 30, yDim2 = yBot + 56
  const yq = yBot + 96, qh = 48
  const ySch = yq + qh + 64
  const W = ML + bw + MR, HT = ySch + 86

  // pressure diagram, to the right of the backfill
  const xp = xHeel + 40, wedge = 58
  const rect = p.q_sur > 0 ? 20 : 0
  const xLbl = xp + wedge + rect + 30

  const lift = q_min < 0

  return (
    <svg viewBox={`0 0 ${W} ${HT}`} className="mx-auto block h-auto w-full"
      style={{ fontFamily: 'Arial, sans-serif' }}>
      <defs>
        <pattern id="rw-soil" width="8" height="8" patternUnits="userSpaceOnUse">
          <path d="M0 8 L8 0" stroke={GRID} strokeWidth={0.8} />
        </pattern>
        <marker id="rw-arrow" markerWidth="7" markerHeight="7" refX="6" refY="2.5"
          orient="auto"><path d="M0 0 L6 2.5 L0 5 z" fill={EARTH} /></marker>
      </defs>

      <text x={x0 - 60} y={22} fontSize={10} fontWeight={700} fill={INK}>
        SECTION — cantilever retaining wall
      </text>
      <text x={x0 - 60} y={34} fontSize={7} fill={FAINT}>
        Drawn to scale from the entered geometry. Marks ①–⑤ are scheduled below.
      </text>

      {/* ── retained soil, behind the stem and over the heel ─────────────── */}
      <rect x={xStemR} y={yTop} width={xp - xStemR} height={yBase - yTop} fill={SOIL} />
      <rect x={xStemR} y={yTop} width={xp - xStemR} height={yBase - yTop} fill="url(#rw-soil)" />
      <line x1={xStemR} y1={yTop} x2={xp} y2={yTop} stroke={INK} strokeWidth={1.4} />
      {p.q_sur > 0 && (
        <g>
          {Array.from({ length: 6 }, (_, k) => {
            const x = xStemR + 12 + k * ((xp - 16 - xStemR) / 5)
            return <line key={k} x1={x} y1={yTop - 15} x2={x} y2={yTop - 2}
              stroke={EARTH} strokeWidth={1.1} markerEnd="url(#rw-arrow)" />
          })}
          <text x={(xStemR + xp) / 2} y={yTop - 20} fontSize={7.5} fill={EARTH}
            textAnchor="middle">q = {p.q_sur.toFixed(1)} kPa</text>
        </g>
      )}

      {/* soil in front of the toe — faint, because its passive resistance is
          deliberately NOT counted in the sliding check */}
      <rect x={x0 - 62} y={yBase - 24} width={62} height={yBot - yBase + 24}
        fill={SOIL} opacity={0.45} />
      <line x1={x0 - 62} y1={yBase - 24} x2={x0} y2={yBase - 24} stroke={FAINT} strokeWidth={1} />
      <text x={x0 - 60} y={yBase - 14} fontSize={6.5} fill={FAINT}>passive — not counted</text>

      {/* ── the wall ────────────────────────────────────────────────────── */}
      <rect x={xStemL} y={yTop} width={xStemR - xStemL} height={yBase - yTop}
        fill={CONC} stroke={INK} strokeWidth={1.6} />
      <rect x={x0} y={yBase} width={bw} height={yBot - yBase}
        fill={CONC} stroke={INK} strokeWidth={1.6} />

      {/* ── active pressure on the back face ─────────────────────────────── */}
      <g>
        {/* triangular earth pressure: 0 at the surface, Ka·γ·H at the base */}
        <polygon points={`${xp},${yTop} ${xp + wedge},${yBot} ${xp},${yBot}`}
          fill={EARTH} opacity={0.15} stroke={EARTH} strokeWidth={0.9} />
        {/* rectangular surcharge pressure, constant with depth */}
        {rect > 0 && (
          <rect x={xp + wedge} y={yTop} width={rect} height={yBot - yTop}
            fill={EARTH} opacity={0.28} stroke={EARTH} strokeWidth={0.9} />
        )}
        {/* the two resultants, at their two DIFFERENT heights */}
        <Thrust y={yBot - (yBot - yTop) / 3} xFrom={xLbl - 6} xTo={xp + 3}
          label={`Pa = ${p.Pa.toFixed(1)} kN/m`} sub={`at H/3 = ${(H / 3).toFixed(2)} m`}
          xLbl={xLbl} solid />
        {p.Pq > 0 && (
          <Thrust y={yBot - (yBot - yTop) / 2} xFrom={xLbl - 6} xTo={xp + wedge + 3}
            label={`Pq = ${p.Pq.toFixed(1)} kN/m`} sub={`at H/2 = ${(H / 2).toFixed(2)} m`}
            xLbl={xLbl} />
        )}
        <text x={xp} y={yBot + 12} fontSize={7} fill={EARTH}>Ka·γs·H</text>
      </g>

      {/* ── reinforcement ───────────────────────────────────────────────── */}
      {(() => {
        const c = 7
        const xEarth = xStemR - c, xFront = xStemL + c
        const yTopBase = yBase + c, yBotBase = yBot - c
        return (
          <g>
            {/* ① STEM main steel — EARTH face, carried down into the base and
                bent TOWARD THE TOE. Hooking it that way runs the bar under
                the stem, where the base is at full depth for the whole
                development length. */}
            <path d={`M${xEarth} ${yTop + 10} L${xEarth} ${yBotBase} L${Math.max(x0 + c, xEarth - 40)} ${yBotBase}`}
              fill="none" stroke={BAR} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
            {/* minimum vertical steel on the front face — §11.6.1 ρl */}
            <line x1={xFront} y1={yTop + 10} x2={xFront} y2={yBase + 14}
              stroke={BAR} strokeWidth={1.3} strokeDasharray="5 3" strokeLinecap="round" />
            {/* ② stem horizontal steel, cut end-on */}
            {[0.16, 0.38, 0.6, 0.82].map((f) => (
              <circle key={f} cx={xEarth - 9} cy={yTop + (yBase - yTop) * f} r={1.7} fill={BAR} />
            ))}

            {/* ③ TOE steel — BOTTOM face, because the toe bends UP */}
            <path d={`M${xStemR - 4} ${yBotBase} L${x0 + c} ${yBotBase} L${x0 + c} ${yBotBase - 24}`}
              fill="none" stroke={BAR} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
            {/* ④ HEEL steel — TOP face, because the heel bends DOWN */}
            <path d={`M${xStemL + 4} ${yTopBase} L${xHeel - c} ${yTopBase} L${xHeel - c} ${yTopBase + 24}`}
              fill="none" stroke={BAR} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
            {/* ⑤ distribution steel in the base, cut end-on */}
            {[0.28, 0.5, 0.72].map((f) => (
              <g key={f}>
                <circle cx={x0 + bw * f} cy={yTopBase + 9} r={1.5} fill={BAR} opacity={0.75} />
                <circle cx={x0 + bw * f} cy={yBotBase - 9} r={1.5} fill={BAR} opacity={0.75} />
              </g>
            ))}

            {/* marks, set just clear of the steel they name */}
            <Mark n="1" x={xEarth + 13} y={yTop + 46} />
            <Mark n="2" x={xEarth - 22} y={yTop + (yBase - yTop) * 0.38} />
            <Mark n="3" x={x0 + 22} y={yBotBase - 15} />
            <Mark n="4" x={xHeel - 24} y={yTopBase + 15} />
            <Mark n="5" x={x0 + bw * 0.5} y={(yTopBase + yBotBase) / 2} />
          </g>
        )
      })()}

      {/* ── dimensions ──────────────────────────────────────────────────── */}
      <g stroke={DIM} fill={DIM}>
        <VDim x={x0 - 82} y1={yTop} y2={yBase} label={`Hs = ${(Hs / 1000).toFixed(2)} m`} />
        <VDim x={x0 - 108} y1={yTop} y2={yBot} label={`H = ${H.toFixed(2)} m`} />
        {/* A long heel squeezes bt and ts to a few pixels each, and their
            labels then print over one another. Any segment too narrow to
            hold its own text gets lifted onto its own tier with a leader. */}
        {(() => {
          const segs: [number, number, string][] = [
            [x0, xStemL, `bt ${bt}`], [xStemL, xStemR, `ts ${ts}`], [xStemR, xHeel, `bh ${bh}`],
          ]
          let tier = 0
          return segs.map(([a, z, label]) => {
            const narrow = z - a < label.length * 4.6
            const lift = narrow ? 15 + tier++ * 11 : 0
            return <HDim key={label} y={yDim1} x1={a} x2={z} label={label} lift={lift} />
          })
        })()}
        <HDim y={yDim2} x1={x0} x2={xHeel} label={`B = ${B.toFixed(2)} m`} />
        <text x={xHeel + 6} y={(yBase + yBot) / 2 + 3} fontSize={7.5} stroke="none">tb = {tb}</text>
      </g>

      {/* ── bearing pressure under the base ──────────────────────────────── */}
      {(() => {
        // The resultant has to land ON the base for a pressure block to
        // exist at all. Once x̄ ≤ 0 the wall has already rotated off its toe,
        // and dividing by 3x̄ reports an absurd pressure (a 158 GPa "q,max"
        // is what the first version printed) instead of saying so.
        if (!(xbar > 0.01)) {
          return (
            <g>
              <line x1={x0} y1={yq} x2={xHeel} y2={yq} stroke={INK} strokeWidth={1} />
              <text x={x0} y={yq + 18} fontSize={9} fontWeight={700} fill={EARTH}>
                No bearing block — the resultant falls outside the base.
              </text>
              <text x={x0} y={yq + 30} fontSize={7.5} fill={FAINT}>
                x̄ = {xbar.toFixed(2)} m ≤ 0: the wall overturns before any pressure
                distribution is meaningful. Lengthen the heel.
              </text>
            </g>
          )
        }
        const qm = Math.max(q_max, Math.abs(q_min), 1)
        const hAt = (q: number) => (Math.max(q, 0) / qm) * qh
        // Once the resultant leaves the middle third the block shortens to
        // 3x̄ and rises; a trapezoid with a negative corner would be a picture
        // of something soil cannot do.
        const contact = lift ? Math.min(3 * xbar, B) : B
        const xEnd = x0 + contact * s
        // ΣV/B = (q_max + q_min)/2 by the trapezoid formula, so this is the
        // triangular block carrying the SAME vertical load over 3x̄.
        const qToe = lift ? ((q_max + q_min) * B) / (3 * xbar) : q_max
        const xr = x0 + xbar * s
        return (
          <g>
            <line x1={x0} y1={yq} x2={xHeel} y2={yq} stroke={INK} strokeWidth={1} />
            <polygon
              points={lift
                ? `${x0},${yq} ${xEnd},${yq} ${x0},${yq + hAt(qToe)}`
                : `${x0},${yq} ${xHeel},${yq} ${xHeel},${yq + hAt(q_min)} ${x0},${yq + hAt(q_max)}`}
              fill={BEAR} opacity={0.2} stroke={BEAR} strokeWidth={1.3} />
            <text x={x0 - 6} y={yq + hAt(lift ? qToe : q_max) + 4} fontSize={8} fill={BEAR}
              textAnchor="end">q,max {(lift ? qToe : q_max).toFixed(1)} kPa</text>
            <text x={xHeel + 6} y={yq + Math.max(hAt(q_min), 4) + 4} fontSize={8} fill={BEAR}>
              q,min {Math.max(q_min, 0).toFixed(1)} kPa
            </text>
            {/* the resultant, and the middle third it has to stay inside */}
            <line x1={xr} y1={yq - 20} x2={xr} y2={yq + 4} stroke={INK} strokeWidth={1.5} />
            <text x={xr} y={yq - 24} fontSize={7.5} fill={INK} textAnchor="middle">
              ΣV @ x̄ = {xbar.toFixed(2)} m
            </text>
            <g stroke={FAINT} strokeDasharray="3 3">
              <line x1={x0 + (B / 3) * s} y1={yq - 12} x2={x0 + (B / 3) * s} y2={yq} />
              <line x1={x0 + (2 * B / 3) * s} y1={yq - 12} x2={x0 + (2 * B / 3) * s} y2={yq} />
            </g>
            <text x={x0} y={yq + qh + 22} fontSize={7.5} fill={lift ? EARTH : FAINT}>
              e = {e.toFixed(3)} m {Math.abs(e) <= B / 6 ? '≤' : '>'} B/6 = {(B / 6).toFixed(3)} m
              {lift
                ? ' — heel lifts, so the block is triangular over 3x̄'
                : ' — the full base stays in compression'}
            </text>
            <text x={x0} y={yq + qh + 33} fontSize={7} fill={FAINT}>
              This same pressure is the load on the toe cantilever.
            </text>
          </g>
        )
      })()}

      {/* ── bar schedule ────────────────────────────────────────────────── */}
      {(() => {
        const rows: [string, string, string][] = [
          ['1', `STEM vertical ${bars.stem}`, 'EARTH face — the tension face'],
          ['2', 'STEM horizontal', '§11.6.1 ρt = 0.0020, both faces'],
          ['3', `TOE ${bars.toe}`, 'BOTTOM of base — the toe bends up'],
          ['4', `HEEL ${bars.heel}`, 'TOP of base — the heel bends down'],
          ['5', `Base distribution ${bars.temp}`, '§24.4.3.2 shrinkage & temperature'],
        ]
        const colW = (W - x0 - 20) / 2
        return (
          <g>
            <text x={x0 - 60} y={ySch - 10} fontSize={9} fontWeight={700} fill={INK}>
              BAR SCHEDULE
            </text>
            <line x1={x0 - 60} y1={ySch - 5} x2={W - 20} y2={ySch - 5} stroke={INK} strokeWidth={0.8} />
            {rows.map(([n, label, note], k) => {
              const col = k % 2, row = Math.floor(k / 2)
              const bx = x0 - 60 + col * colW, by = ySch + 12 + row * 22
              return (
                <g key={n}>
                  <Mark n={n} x={bx + 6} y={by - 3} />
                  <text x={bx + 18} y={by} fontSize={8} fontWeight={700} fill={BAR}>{label}</text>
                  <text x={bx + 18} y={by + 9} fontSize={7} fill={FAINT}>{note}</text>
                </g>
              )
            })}
          </g>
        )
      })()}
    </svg>
  )
}

/** A numbered bar mark — a circled digit, keyed to the schedule. */
function Mark({ n, x, y }: { n: string; x: number; y: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={6} fill="#fff" stroke={BAR} strokeWidth={1.1} />
      <text x={x} y={y + 2.8} fontSize={7.5} fontWeight={700} fill={BAR} textAnchor="middle">{n}</text>
    </g>
  )
}

/** One thrust resultant: an arrow pushing the wall, with its height of action. */
function Thrust({ y, xFrom, xTo, label, sub, xLbl, solid }: {
  y: number; xFrom: number; xTo: number; label: string; sub: string
  xLbl: number; solid?: boolean
}) {
  return (
    <g>
      <line x1={xFrom} y1={y} x2={xTo} y2={y} stroke={EARTH}
        strokeWidth={solid ? 1.8 : 1.4} strokeDasharray={solid ? undefined : '4 2'}
        markerEnd="url(#rw-arrow)" />
      <text x={xLbl} y={y - 4} fontSize={8} fill={EARTH}>{label}</text>
      <text x={xLbl} y={y + 7} fontSize={7} fill={FAINT}>{sub}</text>
    </g>
  )
}

function VDim({ x, y1, y2, label }: { x: number; y1: number; y2: number; label: string }) {
  return (
    <g>
      <line x1={x} y1={y1} x2={x} y2={y2} strokeWidth={0.9} />
      {[y1, y2].map((y) => <line key={y} x1={x - 4} y1={y + 4} x2={x + 4} y2={y - 4} strokeWidth={1.2} />)}
      <text x={x - 6} y={(y1 + y2) / 2} fontSize={8} textAnchor="middle" stroke="none"
        transform={`rotate(-90 ${x - 6} ${(y1 + y2) / 2})`}>{label}</text>
    </g>
  )
}

/** `lift` raises the label clear of the dimension line and draws a leader to
 *  it, for segments too narrow to carry their own text in place. */
function HDim({ y, x1, x2, label, lift = 0 }: {
  y: number; x1: number; x2: number; label: string; lift?: number
}) {
  const mid = (x1 + x2) / 2
  return (
    <g>
      <line x1={x1} y1={y} x2={x2} y2={y} strokeWidth={0.9} />
      {[x1, x2].map((x) => <line key={x} x1={x - 3} y1={y + 4} x2={x + 3} y2={y - 4} strokeWidth={1.2} />)}
      {lift > 0 && <line x1={mid} y1={y - 2} x2={mid} y2={y - lift + 2} strokeWidth={0.6} />}
      <text x={mid} y={y - 4 - lift} fontSize={7.5} textAnchor="middle" stroke="none">{label}</text>
    </g>
  )
}
