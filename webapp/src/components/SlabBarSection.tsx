// ─────────────────────────────────────────────────────────────────────────
// Longitudinal section through one slab span, showing where each mat runs.
//
// Answers the three questions the page could not: which bars are at the TOP,
// which at the BOTTOM, and where each one stops. The shrinkage/temperature
// mat runs the other way, so in a section it is seen end-on and draws as a row
// of dots sitting inside each flexural mat — which is also the honest picture
// of where it actually sits.
//
// The cut-off arithmetic is in `engine/slabBarDetail`; this file only turns
// metres into pixels. The extension fractions are PRINTED on the drawing on
// purpose — see the warning in that module about their provenance.
// ─────────────────────────────────────────────────────────────────────────

import { slabBarRuns, DEFAULT_EXT, type SlabBarExtensions } from '../engine/slabBarDetail'

const INK = '#37526e'
const CONC = '#eef3f8'
const TOPBAR = '#c2402a'      // negative moment — the mat nearest the top face
const BOTBAR = '#0f4c92'      // positive moment
const TEMP = '#7c6f5a'        // shrinkage / temperature, seen end-on
const DIM = '#1f77b4'
const FAINT = '#a39d8d'

export interface SlabBarSectionProps {
  /** Centre-to-centre span, m. */
  l1: number
  /** Support width, m. */
  support: number
  /** Slab thickness, mm. */
  h: number
  /** Clear cover, mm. */
  cover: number
  /** Which strip this section is taken through. */
  strip: 'column' | 'middle'
  /** Bar callouts, when the design has produced them. */
  topBars?: string
  bottomBars?: string
  tempBars?: string
  /** Override the code extensions; defaults to the figure values. */
  ext?: SlabBarExtensions
}

export function SlabBarSection({
  l1, support, h, cover, strip, topBars, bottomBars, tempBars, ext,
}: SlabBarSectionProps) {
  const L = slabBarRuns(l1, support, h, cover, ext ?? DEFAULT_EXT[strip])

  // Frame: the slab runs the full drawing width; the thickness is drawn
  // EXAGGERATED, because a 200 mm slab over a 6 m span is 1:30 and would be a
  // hairline. Stated on the drawing so nobody scales off it.
  // Enough slab depth for the two mats to read as separate layers, and enough
  // margin below for the callouts — the first version stacked the two bottom
  // labels on the same baseline and they printed on top of each other.
  const ML = 26, MR = 26, MT = 58, MB = 96
  const DRAW_W = 620, SLAB_H = 62
  const sx = (m: number) => ML + (m / Math.max(l1, 1e-9)) * DRAW_W
  const W = ML + DRAW_W + MR, HT = MT + SLAB_H + MB

  const yTop = MT
  const yBot = MT + SLAB_H
  // Mats sit at the cover faces, scaled into the exaggerated thickness so the
  // top mat is visibly above the bottom one.
  const yMatTop = yTop + Math.max(5, (L.topCover / h) * SLAB_H)
  const yMatBot = yTop + Math.min(SLAB_H - 5, (L.bottomCover / h) * SLAB_H)

  const supW = Math.max(6, (support / Math.max(l1, 1e-9)) * DRAW_W)
  const faceL = sx(support / 2), faceR = sx(l1 - support / 2)

  const tops = L.runs.filter((r) => r.mat === 'top')
  const bots = L.runs.filter((r) => r.mat === 'bottom')

  return (
    <svg viewBox={`0 0 ${W} ${HT}`} className="mx-auto block h-auto w-full"
      style={{ fontFamily: 'Arial, sans-serif' }}>
      {/* supports, drawn below the soffit so the slab reads as continuous */}
      {[0, l1].map((m) => (
        <rect key={m} x={sx(m) - supW / 2} y={yBot} width={supW} height={22}
          fill="#e2e5ea" stroke={INK} strokeWidth={1.2} />
      ))}

      {/* the slab */}
      <rect x={ML} y={yTop} width={DRAW_W} height={SLAB_H} fill={CONC} stroke={INK} strokeWidth={1.6} />

      {/* face-of-support lines — every cut-off below is measured from these */}
      {[faceL, faceR].map((x, i) => (
        <line key={i} x1={x} y1={yTop - 8} x2={x} y2={yBot + 24}
          stroke={FAINT} strokeWidth={0.8} strokeDasharray="3 3" />
      ))}

      {/* ── top mat: over the supports, cut off in the span ──────────────── */}
      {tops.map((r, i) => {
        const pair = Math.floor(i / 2)
        const y = yMatTop + pair * 5
        return (
          <g key={`t${i}`}>
            <line x1={sx(r.x1)} y1={y} x2={sx(r.x2)} y2={y} stroke={TOPBAR} strokeWidth={2.4} strokeLinecap="round" />
            {/* the hooked end at the free end of a top bar — 90° down into the
                slab, which is what stops it lifting during the pour */}
            {!r.continuesRight && <line x1={sx(r.x2)} y1={y} x2={sx(r.x2)} y2={y + 9} stroke={TOPBAR} strokeWidth={2.4} strokeLinecap="round" />}
            {!r.continuesLeft && <line x1={sx(r.x1)} y1={y} x2={sx(r.x1)} y2={y + 9} stroke={TOPBAR} strokeWidth={2.4} strokeLinecap="round" />}
            {/* Label the LEFT run of each pair only; the right end mirrors it,
                and two labels per length is noise. Stagger by pair so the
                0.30ℓn and 0.20ℓn callouts do not land on one baseline. */}
            {r.x1 === 0 && (
              <text x={sx(r.x2)} y={y - 6 - pair * 11} fontSize={8} fill={TOPBAR} textAnchor="end"
                paintOrder="stroke" stroke="#fff" strokeWidth={2.6}>{r.label} →|</text>
            )}
          </g>
        )
      })}

      {/* ── bottom mat ───────────────────────────────────────────────────── */}
      {bots.map((r, i) => {
        const y = yMatBot - i * 6
        // i = 0 is the continuous run (labelled under the soffit, where there
        // is room for a long sentence); i = 1 is the short run, labelled just
        // above its own line. Sharing a baseline was the collision.
        const ly = i === 0 ? yBot + 34 : y - 6
        return (
          <g key={`b${i}`}>
            <line x1={sx(r.x1)} y1={y} x2={sx(r.x2)} y2={y} stroke={BOTBAR} strokeWidth={2.4} strokeLinecap="round" />
            {i === 0 && <line x1={sx(r.x1) + 8} y1={y} x2={sx(r.x1) + 8} y2={ly - 8} stroke={BOTBAR} strokeWidth={0.7} />}
            <text x={i === 0 ? sx(r.x1) + 12 : (sx(r.x1) + sx(r.x2)) / 2} y={ly}
              fontSize={8} fill={BOTBAR} textAnchor={i === 0 ? 'start' : 'middle'}
              paintOrder="stroke" stroke="#fff" strokeWidth={2.6}>{r.label}</text>
          </g>
        )
      })}

      {/* ── shrinkage / temperature steel, seen END-ON ───────────────────── */}
      {Array.from({ length: 17 }, (_, i) => {
        const x = ML + 18 + (i * (DRAW_W - 36)) / 16
        return <circle key={`s${i}`} cx={x} cy={yMatTop + 7} r={2.1} fill={TEMP} />
      })}
      <text x={W - MR} y={yBot + 34} fontSize={7.5} fill={TEMP} textAnchor="end"
        paintOrder="stroke" stroke="#fff" strokeWidth={2.4}>
        ⊙ shrinkage / temperature bars — perpendicular, seen end-on (§424.4.3)
      </text>

      {/* ── legend and dimensions ────────────────────────────────────────── */}
      <g fontSize={8.5}>
        <line x1={ML} y1={18} x2={ML + 16} y2={18} stroke={TOPBAR} strokeWidth={2.4} />
        <text x={ML + 21} y={21} fill={TOPBAR}>Top — negative moment{topBars ? ` · ${topBars}` : ''}</text>
        <line x1={ML} y1={33} x2={ML + 16} y2={33} stroke={BOTBAR} strokeWidth={2.4} />
        <text x={ML + 21} y={36} fill={BOTBAR}>Bottom — positive moment{bottomBars ? ` · ${bottomBars}` : ''}</text>
        {tempBars && <text x={W - MR} y={21} fill={TEMP} textAnchor="end">Temp · {tempBars}</text>}
      </g>

      {/* clear span, face to face */}
      <g>
        <line x1={faceL} y1={HT - 28} x2={faceR} y2={HT - 28} stroke={DIM} strokeWidth={0.9} />
        {[faceL, faceR].map((x, i) => (
          <line key={i} x1={x - 4} y1={HT - 24} x2={x + 4} y2={HT - 32} stroke={DIM} strokeWidth={1.2} />
        ))}
        <text x={(faceL + faceR) / 2} y={HT - 32} fontSize={9} fill={DIM} textAnchor="middle"
          paintOrder="stroke" stroke="#fff" strokeWidth={2.6}>ℓn = {L.ln.toFixed(2)} m</text>
      </g>
      <text x={W / 2} y={HT - 8} fontSize={7.5} fill={FAINT} textAnchor="middle">
        {strip === 'column' ? 'Column strip' : 'Middle strip'} · slab {h} mm, cover {cover} mm ·
        thickness exaggerated, do not scale · extensions per ACI 318-14 Fig. 8.7.4.1.3(a)
      </text>
    </svg>
  )
}
