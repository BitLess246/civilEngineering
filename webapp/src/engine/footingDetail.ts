// ─────────────────────────────────────────────────────────────────────────
// Footing detail sheet — a standalone CAD detail (bar-mat PLAN + SECTION A-A)
// for one isolated square footing, built from its designed geometry. Emits the
// same typed PlanPrimitive[] the plan renderer uses, so planToSvg paints it.
//
// Two views laid out side by side in world metres:
//   • PLAN — footing outline, column footprint, the bottom reinforcing mat
//     (bars both ways), and the A–A cut line.
//   • SECTION A–A — footing depth, column stub with dowels + ties, the bottom
//     mat shown in section, cover, and B/H dimensions.
// A detail-tag title block sits below, per the "n / S-xx" convention.
//
// Units: geometry m; bar/column sizes mm.  Detailing follows ACI 318-14
// §25.4 (development/hooks) and §13.3 (footing reinforcement placement).
// ─────────────────────────────────────────────────────────────────────────
import type { PlanPrimitive, Drawing } from './planRenderer'

export interface FootingDetailInput {
  /** Footing mark (WF-1…). */
  mark: string
  /** Plan side B, m. */
  B: number
  /** Total footing depth H, m. */
  H: number
  /** Clear cover, mm. */
  cover: number
  /** Main mat bar diameter, mm. */
  barDia: number
  /** Bars each way (count). */
  bars: number
  /** Bar spacing, mm. */
  barSpacing: number
  /** Column width (x) and depth (y), mm. */
  colB: number
  colH?: number
  /** Dowel (column vertical) bar diameter, mm — defaults to the mat bar. */
  dowelDia?: number
  /** Top-of-footing elevation, m (−down). */
  foundingElev?: number
}

export interface FootingDetailOptions {
  detailNo?: string
  sheetRef?: string
  scale?: string
}

export interface DetailDrawing extends Drawing { title: string }

const INK = '#1e293b', COL = '#1e293b', REBAR = '#b45309', HATCH = '#94a3b8', PANEL = '#0f766e'

/** Build a typical-footing detail (plan + section) from a designed footing. */
export function buildFootingDetail(f: FootingDetailInput, opts: FootingDetailOptions = {}): DetailDrawing {
  const P: PlanPrimitive[] = []
  const B = f.B, H = f.H
  const c = f.cover / 1000                       // cover, m
  const cw = f.colB / 1000, cd = (f.colH ?? f.colB) / 1000   // column, m
  const bd = f.barDia / 1000                      // mat bar dia, m
  const n = Math.max(2, Math.round(f.bars))
  const hp = B / 2
  const inner = B - 2 * c                          // mat clear span
  const barX = (i: number) => -hp + c + (inner * i) / (n - 1)   // bar coord in [-hp+c, hp-c]
  const ts = B * 0.09                              // base text height, m
  const gap = B * 0.7                              // gap between the two views

  // ── PLAN view (centred at origin) ──────────────────────────────────────
  P.push({ kind: 'rect', x: -hp, y: -hp, w: B, h: B, stroke: INK, fill: 'none', width: 1.5 })
  // column footprint (dashed)
  P.push({ kind: 'rect', x: -cw / 2, y: -cd / 2, w: cw, h: cd, stroke: COL, fill: 'none', width: 1.1, dash: [0.05, 0.035] })
  // bottom mat — bars both ways
  for (let i = 0; i < n; i++) {
    const p = barX(i)
    P.push({ kind: 'line', x1: -hp + c, y1: p, x2: hp - c, y2: p, stroke: REBAR, width: 0.8 })   // bars ∥ x
    P.push({ kind: 'line', x1: p, y1: -hp + c, x2: p, y2: hp - c, stroke: REBAR, width: 0.8 })   // bars ∥ y
  }
  // A–A cut line (horizontal, through the centre) with end flags
  const aY = 0, aExt = hp + ts * 1.4
  P.push({ kind: 'line', x1: -aExt, y1: aY, x2: aExt, y2: aY, stroke: INK, width: 0.7, dash: [0.12, 0.06, 0.03, 0.06] })
  for (const sx of [-1, 1]) {
    P.push({ kind: 'text', x: sx * aExt, y: aY - ts * 0.55, text: 'A', size: ts * 0.9, anchor: 'middle', color: INK, weight: 700 })
    // arrow head toward the cut
    P.push({ kind: 'line', x1: sx * aExt, y1: aY, x2: sx * (aExt - ts * 0.4), y2: aY - ts * 0.25, stroke: INK, width: 0.8 })
    P.push({ kind: 'line', x1: sx * aExt, y1: aY, x2: sx * (aExt - ts * 0.4), y2: aY + ts * 0.25, stroke: INK, width: 0.8 })
  }
  // mat note + view label
  P.push({ kind: 'text', x: 0, y: -hp - ts * 0.7, text: `${n}-⌀${f.barDia} @ ${Math.round(f.barSpacing)} mm BOTH WAYS`, size: ts * 0.62, anchor: 'middle', color: REBAR, weight: 600 })
  // width dimension along the bottom
  const pdY = hp + ts * 1.1
  P.push({ kind: 'dim', x1: -hp, y1: pdY, x2: hp, y2: pdY, text: `${Math.round(B * 1000)} mm`, off: 0, size: ts * 0.7 })
  P.push({ kind: 'text', x: 0, y: pdY + ts * 1.1, text: 'PLAN', size: ts * 0.85, anchor: 'middle', color: INK, weight: 700 })

  // ── SECTION A–A view (to the right) ────────────────────────────────────
  const sx0 = hp + gap + hp          // section centre x
  const secL = sx0 - hp, secR = sx0 + hp
  const zTop = 0, zBot = H
  const stubH = Math.max(0.5, H * 1.4)   // column stub shown above the footing
  // footing block + column stub
  P.push({ kind: 'rect', x: secL, y: zTop, w: B, h: H, stroke: INK, fill: 'none', width: 1.5 })
  P.push({ kind: 'rect', x: sx0 - cw / 2, y: -stubH, w: cw, h: stubH, stroke: INK, fill: 'none', width: 1.5 })
  // ground line + soil hatch either side of the column at top of footing
  for (const [lo, hi] of [[secL, sx0 - cw / 2], [sx0 + cw / 2, secR]] as const) {
    P.push({ kind: 'line', x1: lo, y1: zTop, x2: hi, y2: zTop, stroke: HATCH, width: 0.8 })
    const step = Math.max(0.08, (hi - lo) / 6)
    for (let x = lo; x < hi - 1e-6; x += step)
      P.push({ kind: 'line', x1: x, y1: zTop, x2: x + step * 0.6, y2: zTop - step * 0.6, stroke: HATCH, width: 0.5 })
  }
  // bottom mat in section: longitudinal bar + perpendicular bar ends (circles)
  const matZ = H - c - bd / 2
  P.push({ kind: 'line', x1: secL + c, y1: matZ, x2: secR - c, y2: matZ, stroke: REBAR, width: 1.0 })
  for (let i = 0; i < n; i++)
    P.push({ kind: 'circle', cx: secL + hp + barX(i), cy: matZ, r: Math.max(bd / 2, B * 0.008), stroke: REBAR, fill: REBAR, width: 0.5 })
  // column dowels — vertical bars hooked onto the mat, lapping up the stub
  const dd = (f.dowelDia ?? f.barDia) / 1000
  const dowelX = [sx0 - cw / 2 + c, sx0 + cw / 2 - c]
  for (const dx of dowelX) {
    P.push({ kind: 'line', x1: dx, y1: -stubH * 0.55, x2: dx, y2: H - c - dd, stroke: REBAR, width: 1.0 })
    // 90° hook toward the footing centre onto the mat
    const dir = dx < sx0 ? 1 : -1
    P.push({ kind: 'line', x1: dx, y1: H - c - dd, x2: dx + dir * cw * 0.35, y2: H - c - dd, stroke: REBAR, width: 1.0 })
  }
  // column ties (short horizontals in the stub)
  for (let k = 1; k <= 3; k++) {
    const ty = -stubH * (0.15 + 0.2 * k)
    P.push({ kind: 'line', x1: sx0 - cw / 2 + c, y1: ty, x2: sx0 + cw / 2 - c, y2: ty, stroke: REBAR, width: 0.7 })
  }
  // dimensions: width B (bottom) and depth H (right)
  const sdY = H + ts * 1.1
  P.push({ kind: 'dim', x1: secL, y1: sdY, x2: secR, y2: sdY, text: `${Math.round(B * 1000)} mm`, off: 0, size: ts * 0.7 })
  const sdX = secR + ts * 1.2
  P.push({ kind: 'dim', x1: sdX, y1: zTop, x2: sdX, y2: zBot, text: `${Math.round(H * 1000)} mm`, off: 0, size: ts * 0.7 })
  // callouts
  P.push({ kind: 'text', x: sx0, y: matZ + ts * 0.75, text: `${n}-⌀${f.barDia} E.W. BOTT.`, size: ts * 0.55, anchor: 'middle', color: REBAR, weight: 600 })
  P.push({ kind: 'text', x: sx0 + cw * 0.5 + ts * 0.3, y: -stubH * 0.6, text: `DOWELS ⌀${f.dowelDia ?? f.barDia}`, size: ts * 0.5, anchor: 'start', color: REBAR, weight: 600 })
  if (f.foundingElev != null)
    P.push({ kind: 'text', x: secL, y: zTop - ts * 0.5, text: `T.O.F. EL ${f.foundingElev.toFixed(2)} m`, size: ts * 0.5, anchor: 'start', color: PANEL, weight: 600 })
  P.push({ kind: 'text', x: sx0, y: sdY + ts * 1.1, text: 'SECTION A-A', size: ts * 0.85, anchor: 'middle', color: INK, weight: 700 })

  // ── detail-tag title block below both views ────────────────────────────
  const detailNo = opts.detailNo ?? '1', sheetRef = opts.sheetRef ?? 'S-05', scale = opts.scale ?? 'NTS'
  const title = `TYPICAL FOOTING DETAIL — ${f.mark}`
  const tbR = ts * 1.15, tbY = Math.max(pdY, sdY) + ts * 3.2, tbX = -hp
  P.push({ kind: 'circle', cx: tbX + tbR, cy: tbY, r: tbR, stroke: INK, fill: '#fff', width: 1 })
  P.push({ kind: 'line', x1: tbX, y1: tbY, x2: tbX + 2 * tbR, y2: tbY, stroke: INK, width: 1 })
  P.push({ kind: 'text', x: tbX + tbR, y: tbY - tbR * 0.5, text: detailNo, size: tbR * 0.75, anchor: 'middle', color: INK, weight: 700 })
  P.push({ kind: 'text', x: tbX + tbR, y: tbY + tbR * 0.5, text: sheetRef, size: tbR * 0.6, anchor: 'middle', color: INK, weight: 700 })
  const lnX0 = tbX + 2 * tbR + ts * 0.3, lnX1 = secR
  P.push({ kind: 'line', x1: lnX0, y1: tbY, x2: lnX1, y2: tbY, stroke: INK, width: 1.4 })
  P.push({ kind: 'text', x: lnX0 + ts * 0.15, y: tbY - tbR * 0.55, text: title, size: tbR * 0.8, anchor: 'start', color: INK, weight: 700 })
  P.push({ kind: 'text', x: lnX0 + ts * 0.15, y: tbY + tbR * 0.55, text: 'SCALE', size: tbR * 0.4, anchor: 'start', color: INK, weight: 600 })
  P.push({ kind: 'text', x: lnX1 - ts * 0.3, y: tbY + tbR * 0.55, text: scale, size: tbR * 0.4, anchor: 'end', color: INK, weight: 600 })

  // ── bounds ──
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const acc = (x: number, y: number) => { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y) }
  for (const pr of P) {
    if (pr.kind === 'line' || pr.kind === 'dim') { acc(pr.x1, pr.y1); acc(pr.x2, pr.y2) }
    else if (pr.kind === 'rect') { acc(pr.x, pr.y); acc(pr.x + pr.w, pr.y + pr.h) }
    else if (pr.kind === 'circle') { acc(pr.cx - pr.r, pr.cy - pr.r); acc(pr.cx + pr.r, pr.cy + pr.r) }
    else acc(pr.x, pr.y)
  }
  return { primitives: P, bounds: { minX, minY, maxX, maxY }, title }
}
