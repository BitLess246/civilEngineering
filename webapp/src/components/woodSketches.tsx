// ─────────────────────────────────────────────────────────────────────────
// Drawing for the wood-slab calculator — the floor cut square across the
// joists.
//
// One scale for everything: spacing, joist b × d and deck t are all drawn at
// the same mm → px factor, so a 25 mm deck reads as thin as it is against a
// 200 mm joist. The cut runs along the deck span, so the joists are seen in
// section (the timber ✕) and the deck boards lengthwise; a simple-span deck
// is drawn with a butt joint over every joist, a continuous one unbroken.
// ─────────────────────────────────────────────────────────────────────────
import { DimBelow, DimSide } from './dims'
import { DrawingFrame } from './DrawingFrame'
import type { DeckMaterial, SlabSupport } from '../engine/woodSlab'

const INK = '#37526e'
const TIMBER = '#f3e6cf'
const BAMBOO = '#e6edc9'
const GRAIN = '#c9b18a'
const CL = '#7a8899'
const LEAD = '#5b5446'
const FAINT = '#a39d8d'
const HALO = { paintOrder: 'stroke' as const, stroke: 'var(--sheet, #fff)', strokeWidth: 2.6 }

export interface WoodDeckSectionProps {
  /** Joist width, depth, spacing c/c; deck thickness and board width — mm. */
  b: number; d: number; s: number; t: number; boardWidth: number
  deck: DeckMaterial
  deckSupport: SlabSupport
  /** Joist span into the page, m. */
  Lx: number
  joistLabel: string
}

export function WoodDeckSection({ b, d, s, t, boardWidth, deck, deckSupport, Lx, joistLabel }: WoodDeckSectionProps) {
  const n = 4                                  // joists drawn
  const sp = Math.max(s, b + 1)
  const ext = 0.45 * sp                        // deck carried past the end joists, broken off
  const runMm = 2 * ext + (n - 1) * sp
  const k = Math.min(380 / runMm, 150 / Math.max(t + d, 1))
  const ML = 46, MT = 34
  const W = ML + runMm * k + 52
  const X = (x: number) => ML + (x + ext) * k  // x = 0 on the first joist's centreline
  const yTop = MT, yDeck = MT + t * k, yBot = MT + (t + d) * k
  const xL = X(-ext), xR = X((n - 1) * sp + ext)
  const dimY = yBot + 24
  const H = dimY + 40

  const fill = deck === 'bamboo-slat' ? BAMBOO : TIMBER
  // a break line across the deck: zigzag through its thickness
  const brk = (x: number, dir: 1 | -1) =>
    `M${x} ${yTop - 3} L${x} ${yTop + t * k * 0.3} L${x + 4 * dir} ${yTop + t * k * 0.45} L${x - 4 * dir} ${yTop + t * k * 0.6} L${x} ${yTop + t * k * 0.75} L${x} ${yDeck + 3}`
  const joists = Array.from({ length: n }, (_, i) => X(i * sp))
  const bw = b * k

  return (
    <DrawingFrame label="wood floor section">
      <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block h-auto w-full max-w-[620px]" style={{ fontFamily: 'Arial, sans-serif' }}>
        {/* deck, seen lengthwise: grain lines along it, broken off at both ends */}
        <rect x={xL} y={yTop} width={xR - xL} height={yDeck - yTop} fill={fill} stroke="none" />
        {[0.35, 0.68].map((f) => (
          <line key={f} x1={xL + 3} y1={yTop + f * t * k} x2={xR - 3} y2={yTop + f * t * k} stroke={GRAIN} strokeWidth={0.6} />
        ))}
        <line x1={xL} y1={yTop} x2={xR} y2={yTop} stroke={INK} strokeWidth={1.3} />
        <line x1={xL} y1={yDeck} x2={xR} y2={yDeck} stroke={INK} strokeWidth={1.3} />
        <path d={`${brk(xL, 1)} ${brk(xR, -1)}`} fill="none" stroke={INK} strokeWidth={1} />
        {/* a simple-span deck is one board per bay: a butt joint over every joist */}
        {deckSupport === 'simple' && joists.map((x, i) => (
          <line key={i} x1={x} y1={yTop} x2={x} y2={yDeck} stroke={INK} strokeWidth={1.1} />
        ))}

        {/* joists in section — the timber cross */}
        {joists.map((x, i) => (
          <g key={i}>
            <rect x={x - bw / 2} y={yDeck} width={bw} height={yBot - yDeck} fill={TIMBER} stroke={INK} strokeWidth={1.3} />
            <path d={`M${x - bw / 2} ${yDeck} L${x + bw / 2} ${yBot} M${x + bw / 2} ${yDeck} L${x - bw / 2} ${yBot}`} stroke={GRAIN} strokeWidth={0.8} />
          </g>
        ))}

        {/* centrelines of the first two joists, carried down into the spacing dimension */}
        {joists.slice(0, 2).map((x, i) => (
          <line key={i} x1={x} y1={yTop - 8} x2={x} y2={yBot + 4} stroke={CL} strokeWidth={0.7} strokeDasharray="10 3 2 3" />
        ))}
        <DimBelow xA={joists[0]} xB={joists[1]} featY={yBot} dY={dimY} label={`s = ${Math.round(s)} o.c.`} />
        <DimBelow xA={joists[3] - bw / 2} xB={joists[3] + bw / 2} featY={yBot} dY={dimY} label={`b ${Math.round(b)}`} flipNarrow />
        <DimSide yA={yDeck} yB={yBot} featX={joists[0] - bw / 2} dX={joists[0] - bw / 2 - 18} label={`d ${Math.round(d)}`} side="left" />
        <DimSide yA={yTop} yB={yDeck} featX={xR} dX={xR + 16} label={`t ${Math.round(t)}`} side="right" />

        {/* callouts, leaders landing on what they name */}
        <g fontSize={9}>
          {(() => {
            const x = (joists[1] + joists[2]) / 2
            return <>
              <line x1={x} y1={yTop + 0.5 * t * k} x2={x + 22} y2={yTop - 16} stroke={LEAD} strokeWidth={0.8} />
              <text x={x + 25} y={yTop - 18} fill={LEAD} {...HALO}>
                {deck === 'bamboo-slat' ? 'bamboo slat' : 'plank'} {Math.round(boardWidth)} × {Math.round(t)}
              </text>
            </>
          })()}
          <line x1={joists[2]} y1={(yDeck + yBot) / 2} x2={joists[2] + 14} y2={dimY - 2} stroke={LEAD} strokeWidth={0.8} />
          <text x={joists[2] + 16} y={dimY + 2} fill={LEAD} {...HALO}>{joistLabel}</text>
        </g>

        <text x={W / 2} y={H - 6} fontSize={7.5} fill={FAINT} textAnchor="middle">
          section across the joists · one scale · joists span {Lx.toFixed(2)} m into the page · deck {deckSupport === 'simple' ? 'simple span, butt-jointed over each joist' : 'continuous over ≥3 joists'}
        </text>
      </svg>
    </DrawingFrame>
  )
}
