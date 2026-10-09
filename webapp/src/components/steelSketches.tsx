// ─────────────────────────────────────────────────────────────────────────
// Drawings for the steel member calculators — plain geometry from the shape
// catalogue the page already holds, so no design code reaches the browser.
//
//   WShapeSection   the cut through a rolled W, to its own scale
//   SteelBeamElevation  span, UDL and the lateral BRACE POINTS — Lb is the
//                   distance between braces of the compression flange, not
//                   the span, and that is the whole of §F2's LTB check
//   SteelColumnElevation  height, the axial load landing on the cap, and the
//                   effective lengths per axis
// Units: m for spans, mm for the section.
// ─────────────────────────────────────────────────────────────────────────
import { DimBelow, DimSide, Tick } from './dims'
import { DrawingFrame } from './DrawingFrame'

const INK = '#37526e'
const STEEL = '#dfe6ee'
const LOAD = '#5c6675'
const BRACE = '#c2402a'
const DIM = '#1f77b4'
const FAINT = '#a39d8d'
const HALO = { paintOrder: 'stroke' as const, stroke: 'var(--sheet, #fff)', strokeWidth: 2.6 }

/** A rolled W in cross-section, d and bf dimensioned, tf and tw called out. */
export function WShapeSection({ name, d, bf, tf, tw }: { name: string; d: number; bf: number; tf: number; tw: number }) {
  const S = 150 / Math.max(d, bf, 1)
  const H = d * S, B = bf * S, TF = Math.max(1.5, tf * S), TW = Math.max(1.5, tw * S)
  const ML = 44, MT = 30
  const x0 = ML, y0 = MT, xc = x0 + B / 2
  const W = ML + B + 70, HT = MT + H + 48
  const outline = [
    [x0, y0], [x0 + B, y0], [x0 + B, y0 + TF], [xc + TW / 2, y0 + TF], [xc + TW / 2, y0 + H - TF],
    [x0 + B, y0 + H - TF], [x0 + B, y0 + H], [x0, y0 + H], [x0, y0 + H - TF], [xc - TW / 2, y0 + H - TF],
    [xc - TW / 2, y0 + TF], [x0, y0 + TF],
  ].map(([x, y]) => `${x},${y}`).join(' ')
  return (
    <DrawingFrame label="steel section">
      <svg viewBox={`0 0 ${W} ${HT}`} className="mx-auto block h-auto w-full max-w-[260px]" style={{ fontFamily: 'Arial, sans-serif' }}>
        <text x={x0} y={MT - 18} fontSize={9} fontWeight={700} fill={INK}>{name}</text>
        <polygon points={outline} fill={STEEL} stroke={INK} strokeWidth={1.3} strokeLinejoin="round" />
        <DimBelow xA={x0} xB={x0 + B} featY={y0 + H} dY={y0 + H + 20} label={`bf = ${Math.round(bf)}`} />
        <DimSide yA={y0} yB={y0 + H} featX={x0} dX={x0 - 18} label={`d = ${Math.round(d)}`} side="left" />
        {/* tf and tw, with leaders landing on the plate they name */}
        <line x1={x0 + B - 6} y1={y0 + TF / 2} x2={x0 + B + 14} y2={y0 - 6} stroke={INK} strokeWidth={0.7} />
        <text x={x0 + B + 16} y={y0 - 4} fontSize={8} fill={INK} {...HALO}>tf {tf}</text>
        <line x1={xc + TW / 2} y1={y0 + H / 2} x2={x0 + B + 14} y2={y0 + H / 2} stroke={INK} strokeWidth={0.7} />
        <text x={x0 + B + 16} y={y0 + H / 2 + 3} fontSize={8} fill={INK} {...HALO}>tw {tw}</text>
        <text x={W / 2} y={HT - 4} fontSize={7} fill={FAINT} textAnchor="middle">section to its own scale · fillets not drawn · mm</text>
      </svg>
    </DrawingFrame>
  )
}

/** The beam in elevation on a pin and a roller, the UDL on its top flange,
 *  and a lateral brace (×) at every Lb from the left support. */
export function SteelBeamElevation({ span, Lb, wD, wL }: { span: number; Lb: number; wD: number; wL: number }) {
  const ML = 30, BW = 300, W = ML + BW + 30
  const yTop = 60, BH = 8
  const sx = (m: number) => ML + (m / Math.max(span, 1e-9)) * BW
  // brace stations: the supports, then every Lb; the last bay may be short
  const step = Lb > 0 ? Lb : span
  const braces: number[] = []
  for (let x = 0; x < span - 1e-6 && braces.length < 60; x += step) braces.push(x)
  braces.push(span)
  // arrows inset from the ends and kept off the brace marks, so neither
  // symbol is drawn through the other
  const arrows = Array.from({ length: 11 }, (_, i) => sx(span * (0.04 + (0.92 * i) / 10)))
    .filter((x) => braces.every((b) => Math.abs(sx(b) - x) > 6))
  const yChain = yTop + BH + 32, yAll = yChain + 22
  const HT = yAll + 28
  const fmt = (m: number) => m.toFixed(2)
  const first = braces.length > 1 ? braces[1]! - braces[0]! : span
  return (
    <DrawingFrame label="steel beam elevation">
      <svg viewBox={`0 0 ${W} ${HT}`} className="mx-auto block h-auto w-full max-w-[460px]" style={{ fontFamily: 'Arial, sans-serif' }}>
        {/* UDL: top line and arrows landing on the top flange */}
        <line x1={sx(0)} y1={yTop - 24} x2={sx(span)} y2={yTop - 24} stroke={LOAD} strokeWidth={1.2} />
        {arrows.map((x) => (
          <g key={x}>
            <line x1={x} y1={yTop - 24} x2={x} y2={yTop - 5} stroke={LOAD} strokeWidth={1.1} />
            <path d={`M${x - 3} ${yTop - 5} L${x} ${yTop} L${x + 3} ${yTop - 5} z`} fill={LOAD} />
          </g>
        ))}
        <text x={sx(span / 2)} y={yTop - 29} fontSize={8.5} fill={LOAD} textAnchor="middle">wD {fmt(wD)} + wL {fmt(wL)} kN/m</text>

        {/* the beam — depth not to the span's scale, said below */}
        <rect x={sx(0)} y={yTop} width={BW} height={BH} fill={STEEL} stroke={INK} strokeWidth={1.3} />
        {/* pin and roller under the bottom flange */}
        <g stroke={INK} strokeWidth={1.2} fill="var(--sheet, #fff)">
          <path d={`M${sx(0)} ${yTop + BH} l-6 11 h12 z`} />
          <circle cx={sx(span)} cy={yTop + BH + 5.5} r={5.5} />
          <line x1={sx(span) - 9} y1={yTop + BH + 11} x2={sx(span) + 9} y2={yTop + BH + 11} />
        </g>

        {/* lateral braces of the compression (top) flange */}
        {braces.map((x) => (
          <g key={x} stroke={BRACE} strokeWidth={1.4}>
            <line x1={sx(x) - 4} y1={yTop - 4} x2={sx(x) + 4} y2={yTop + 4} />
            <line x1={sx(x) - 4} y1={yTop + 4} x2={sx(x) + 4} y2={yTop - 4} />
          </g>
        ))}

        {/* brace spacing as a chain, then the span; extension lines drop
            from each brace point, past the supports */}
        {braces.map((x) => (
          <line key={`e${x}`} x1={sx(x)} y1={yTop + BH + 14} x2={sx(x)} y2={yChain + 5} stroke={DIM} strokeWidth={0.6} />
        ))}
        <line x1={sx(0)} y1={yChain} x2={sx(span)} y2={yChain} stroke={DIM} strokeWidth={0.9} />
        {braces.map((x) => <Tick key={`t${x}`} x={sx(x)} y={yChain} />)}
        <text x={(sx(braces[0]!) + sx(braces[0]! + first)) / 2} y={yChain - 4} fontSize={8.5} fill={DIM} textAnchor="middle" {...HALO}>
          Lb = {fmt(first)}
        </text>
        <DimBelow xA={sx(0)} xB={sx(span)} featY={yChain + 2} dY={yAll} label={`L = ${fmt(span)} m`} />

        <text x={W / 2} y={HT - 4} fontSize={7} fill={FAINT} textAnchor="middle">
          <tspan fill={BRACE}>× lateral brace, top flange</tspan> · elevation · span to scale, beam depth not
        </text>
      </svg>
    </DrawingFrame>
  )
}

/** The column in elevation: height L, the axial load on the cap, and the
 *  effective lengths KxL and KyL. */
export function SteelColumnElevation({ L, Kx, Ky, P, Plabel }: { L: number; Kx: number; Ky: number; P: number; Plabel: string }) {
  const W = 220, MT = 52, CH = 200, HT = MT + CH + 40
  const cx = 92, cw = 12
  const yTop = MT, yBot = MT + CH
  return (
    <DrawingFrame label="steel column elevation">
      <svg viewBox={`0 0 ${W} ${HT}`} className="mx-auto block h-auto w-full max-w-[240px]" style={{ fontFamily: 'Arial, sans-serif' }}>
        {/* axial load landing on the cap plate */}
        <line x1={cx} y1={yTop - 34} x2={cx} y2={yTop - 9} stroke={LOAD} strokeWidth={1.6} />
        <path d={`M${cx - 4} ${yTop - 9} L${cx} ${yTop - 3} L${cx + 4} ${yTop - 9} z`} fill={LOAD} />
        <text x={cx + 7} y={yTop - 24} fontSize={8.5} fill={LOAD}>{Plabel} = {Math.round(P)} kN</text>
        <rect x={cx - cw / 2 - 5} y={yTop - 3} width={cw + 10} height={3} fill={INK} />
        <rect x={cx - cw / 2} y={yTop} width={cw} height={CH} fill={STEEL} stroke={INK} strokeWidth={1.3} />
        {/* base plate on its support */}
        <rect x={cx - cw / 2 - 8} y={yBot} width={cw + 16} height={4} fill={INK} />
        <path d={`M${cx - 26} ${yBot + 4} h52`} stroke={INK} strokeWidth={1.2} />
        {Array.from({ length: 6 }, (_, i) => (
          <line key={i} x1={cx - 24 + i * 9} y1={yBot + 4} x2={cx - 30 + i * 9} y2={yBot + 11} stroke={INK} strokeWidth={0.8} />
        ))}
        <DimSide yA={yTop} yB={yBot} featX={cx - cw / 2} dX={cx - cw / 2 - 26} label={`L = ${L.toFixed(2)} m`} side="left" />
        <g fontSize={8.5} fill={INK}>
          <text x={cx + cw / 2 + 12} y={yTop + CH / 2 - 6}>KxL = {(Kx * L).toFixed(2)} m</text>
          <text x={cx + cw / 2 + 12} y={yTop + CH / 2 + 8}>KyL = {(Ky * L).toFixed(2)} m</text>
        </g>
        <text x={W / 2} y={HT - 6} fontSize={7} fill={FAINT} textAnchor="middle">elevation · end restraint is carried by K, not drawn</text>
      </svg>
    </DrawingFrame>
  )
}
