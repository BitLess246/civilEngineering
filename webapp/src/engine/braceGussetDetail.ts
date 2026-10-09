// ─────────────────────────────────────────────────────────────────────────
// BRACE GUSSET DETAIL — one designed brace end, in the plane of the frame.
//
// The beam (or base plate) and the column as the end was designed against
// them — faces at eb and ec from the work point, a column met on its web
// drawn as the web between its flanges — the gusset outline as designed
// (`BraceEndDesign.outline`, the free edges following the Whitmore spread),
// the slotted HSS from its end at sEnd, its four fillets over lw, the 30°
// spread from the far end of the welds and the Whitmore section where it
// lies in the plate (`whitmore.ends`), and the UFM interfaces with their
// lengths and fillets. Every number is the design's. Units mm; sheet y down,
// the beam ABOVE the gusset for a brace running down from its joint and the
// base plate BELOW one rising from a support.
// ─────────────────────────────────────────────────────────────────────────
import type { BraceEndDesign, BraceEndFrame } from './braceConnection'
import { clipSegment } from './braceConnection'
import { shapeByName } from './aiscSections'
import type { PlanPrimitive, Drawing, PathCmd } from './planRenderer'
import { SHEET_INK, SHEET_NOTE, STEEL, STEEL_CONTEXT, SHEET_STEELWORK } from './sheetInk'
import { leader, titleBlock, sheetBounds, notesBlock, textWidth } from './detailSheet'

export interface BraceGussetInput {
  end: BraceEndDesign
  /** The frame the end was designed against (faces eb/ec mm from the work
   *  point, θ from the vertical; `upper` — the gusset hangs below its beam). */
  frame: BraceEndFrame
  braceShape: string
  node: string
}

type Pt = [number, number]

export function buildBraceGussetDetail(inp: BraceGussetInput, opts: { detailNo?: string; sheetRef?: string } = {}): Drawing & { title: string } {
  const { end: e, frame: f } = inp
  const noCol = f.kind === 'beam' || f.ec <= 0
  const sy = f.upper ? 1 : -1                     // gusset frame y (away from the beam) → sheet y
  const S = (p: Pt): Pt => [p[0], sy * p[1]]
  const ux = Math.sin(f.theta), uy = Math.cos(f.theta), nx = -uy, ny = ux
  const at = (s: number, o: number): Pt => [s * ux + o * nx, s * uy + o * ny]
  const half = e.H / 2
  const xs = e.outline.map((p) => p[0]), ys = e.outline.map((p) => p[1])
  const gx0 = Math.min(...xs), gx1 = Math.max(...xs), gy1 = Math.max(...ys)
  const u = Math.max(gx1 - Math.min(gx0, -f.ec), gy1 + f.eb, 300) * 0.028
  const P: PlanPrimitive[] = []
  const line = (a: Pt, b: Pt, stroke: string, width: number, dash?: number[]) => {
    const [p, q] = [S(a), S(b)]
    P.push({ kind: 'line', x1: p[0], y1: p[1], x2: q[0], y2: q[1], stroke, width, ...(dash ? { dash } : {}) })
  }
  const poly = (pts: Pt[], o: { fill?: string; stroke: string; width: number; dash?: number[] }) =>
    P.push({ kind: 'path', closed: true, cmds: pts.map((p, k) => ({ c: k === 0 ? 'M' : 'L', x: S(p)[0], y: S(p)[1] }) as PathCmd), ...o, fill: o.fill ?? 'none' })
  const box = (x0: number, y0: number, x1: number, y1: number, fill: string, stroke = STEEL_CONTEXT, dash?: number[]) =>
    poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], { fill, stroke, width: 0.8, dash })

  // ── the frame ────────────────────────────────────────────────────────────
  const beam = f.beam ? shapeByName(f.beam) : undefined
  const col = f.column ? shapeByName(f.column) : undefined
  const colHalf = noCol ? 0 : f.ec >= 30 ? f.ec : Math.max((col?.bf ?? 200) / 2, f.ec)
  const xL = noCol ? gx0 - 4 * u : -colHalf, xR = gx1 + 5 * u
  const yTop = gy1 + 4 * u                        // how far the column runs past the gusset
  if (f.kind === 'base') {
    box(noCol ? gx0 - 4 * u : -colHalf - 4 * u, -25, xR, 0, SHEET_INK, SHEET_INK)
  } else {
    box(xL, -f.eb, xR, f.eb, SHEET_STEELWORK)
    const tf = beam?.tf
    if (tf) for (const y of [f.eb - tf, -f.eb + tf]) line([xL, y], [xR, y], STEEL_CONTEXT, 0.6)
  }
  if (!noCol) {
    const yBot = f.kind === 'base' ? 0 : -f.eb
    if (f.ec >= 30) {
      box(-f.ec, yBot, f.ec, yTop, SHEET_STEELWORK)
      const tf = col?.tf
      if (tf) for (const x of [f.ec - tf, -f.ec + tf]) line([x, f.kind === 'base' ? 0 : f.eb], [x, yTop], STEEL_CONTEXT, 0.6)
    } else {
      // met on its web: the flanges lie parallel to the sheet — the near one
      // cut away, both outlined hidden — and the web is what the gusset meets
      box(-colHalf, yBot, colHalf, yTop, 'none', STEEL_CONTEXT, [u * 0.5, u * 0.3])
      box(-f.ec, f.kind === 'base' ? 0 : f.eb, f.ec, yTop, STEEL_CONTEXT, STEEL_CONTEXT)
    }
  }
  // the work point, on the member centre lines
  const wp = S([0, 0])
  P.push({ kind: 'circle', cx: wp[0], cy: wp[1], r: u * 0.45, stroke: SHEET_INK, fill: 'none', width: 0.8 })
  const wpY = f.kind === 'base' ? wp[1] - u * 0.6 : wp[1] + u * 1.5
  P.push({ kind: 'text', x: wp[0] - u * 0.7, y: wpY, text: 'W.P.', size: u * 0.8, anchor: 'end', color: SHEET_INK, weight: 700 })

  // ── the gusset, its interface welds ──────────────────────────────────────
  poly(e.outline, { fill: 'none', stroke: SHEET_INK, width: 1.6 })
  const beamFace = e.outline.filter((p) => Math.abs(p[1] - f.eb) < 1e-6).map((p) => p[0])
  const bx0 = Math.min(...beamFace), bx1 = Math.max(...beamFace)
  line([bx0, f.eb], [bx1, f.eb], SHEET_INK, 3)
  if (!noCol) line([f.ec, f.eb], [f.ec, f.eb + e.ufm.Lv], SHEET_INK, 3)

  // ── the brace: past the gusset to a break line ───────────────────────────
  const sOut = Math.max(...e.outline.map((p) => p[0] * ux + p[1] * uy)) + 1.2 * e.H
  for (const s of [-1, 1]) line(at(e.sEnd, s * half), at(sOut, s * half), STEEL, 1.4)
  line(at(e.sEnd, -half), at(e.sEnd, half), STEEL, 1.4)
  const zig: Pt[] = [at(sOut, -half - u), at(sOut, -u * 0.6), at(sOut + u * 0.8, -u * 0.2), at(sOut - u * 0.8, u * 0.2), at(sOut, u * 0.6), at(sOut, half + u)]
  P.push({ kind: 'path', cmds: zig.map((p, k) => ({ c: k === 0 ? 'M' : 'L', x: S(p)[0], y: S(p)[1] }) as PathCmd), stroke: SHEET_NOTE, width: 0.8, fill: 'none' })
  line([0, 0], at(sOut + 2 * u, 0), SHEET_NOTE, 0.5, [u, u * 0.4, u * 0.2, u * 0.4])
  // the four fillets along the slot (two at each wall, one each face of the plate)
  for (const s of [-1, 1]) line(at(e.sEnd, s * half), at(e.sWeld, s * half), SHEET_INK, 3)

  // ── Whitmore: 30° from the far end of the welds; the section in the plate
  const spread = e.weld.lw * Math.tan(Math.PI / 6)
  for (const s of [-1, 1]) {
    const seg = clipSegment(at(e.sWeld, s * half), at(e.sEnd, s * (half + spread)), e.outline)
    if (seg) line(seg[0], seg[1], STEEL_CONTEXT, 0.7, [u * 0.6, u * 0.3])
  }
  const [w0, w1] = e.whitmore.ends
  line(w0, w1, SHEET_NOTE, 1.1, [u * 0.9, u * 0.3])

  // ── labels: member names first, then the callouts, each nudged clear of
  // every label already placed ────────────────────────────────────────────
  type Box = [number, number, number, number]   // x0, y0, x1, y1 (sheet)
  const placed: Box[] = [[wp[0] - u * 3.5, wpY - u, wp[0], wpY + u * 0.4]]
  // the base plate's band is solid ink — nothing written over it
  if (f.kind === 'base') placed.push([-1e9, 0, 1e9, 25])
  const hits = (q: Box) => placed.some((r) => q[0] < r[2] && q[2] > r[0] && q[1] < r[3] && q[3] > r[1])
  const label = (x: number, y: number, text: string, rotate?: number) => {
    const w = textWidth(text, u * 0.85)
    P.push({ kind: 'text', x, y, text, size: u * 0.85, anchor: 'middle', color: SHEET_INK, weight: 600, ...(rotate ? { rotate } : {}) })
    placed.push(rotate ? [x - u, y - w / 2, x + u, y + w / 2] : [x - w / 2, y - u, x + w / 2, y + u * 0.3])
  }
  if (f.kind !== 'base' && f.beam) {
    const [, ly] = S([0, 0])
    label(xR - textWidth(f.beam, u * 0.85) / 2 - u, ly + u * 0.3, f.beam)
  }
  if (!noCol && f.column) {
    const [lx, ly] = S([0, yTop - 2 * u - textWidth(f.column, u * 0.85) / 2])
    label(lx + (f.ec >= 30 ? 0 : colHalf * 0.55), ly, f.column, -90)
  }
  // how far the gusset reaches either side of the brace axis, so the labels
  // land clear of it
  const nReach = (sgn: number) => Math.max(...e.outline.map((p) => sgn * (p[0] * nx + p[1] * ny)))
  const call = (target: Pt, text: Pt, t1: string, t2?: string) => {
    const [x, y] = S(target)
    const size = u * 0.8, w = Math.max(textWidth(t1, size), t2 ? textWidth(t2, size) : 0) + size * 0.5
    const lines = t2 ? 2 : 1
    const [tx] = S(text)
    let ty = S(text)[1]
    const boxAt = (yy: number): Box => (x <= tx ? [tx, yy - size, tx + w, yy + size * (1.25 * (lines - 1) + 0.35)] : [tx - w, yy - size, tx, yy + size * (1.25 * (lines - 1) + 0.35)])
    for (const k of [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6]) {
      if (!hits(boxAt(ty + k * size * 1.4))) { ty += k * size * 1.4; break }
    }
    placed.push(boxAt(ty))
    P.push(...leader({ x, y, tx, ty, text: t1, text2: t2, size }))
  }
  const sMid = (e.sEnd + e.sWeld) / 2
  const away = nReach(-1) + 3 * u                 // the side of the brace clear of the column
  const toBeam = f.kind === 'base' ? 'BASE PL' : f.beam ?? 'BEAM'
  call([bx1 - Math.min(3 * u, (bx1 - bx0) / 4), f.eb], [Math.max(gx1, bx1) + 2 * u, f.eb + 3 * u], `GUSSET PL ${e.tg} — ${Math.round(e.ufm.Lh)} TO ${toBeam}`, `${e.ufm.weldBeam} FILLET BOTH SIDES`)
  if (!noCol) {
    call([f.ec, f.eb + Math.min(e.ufm.Lv - 2 * u, e.ufm.Lv * 0.75)], [-colHalf - 2 * u, f.eb + e.ufm.Lv + 3 * u],
      `${Math.round(e.ufm.Lv)} TO ${f.column ?? 'COLUMN'} ${f.ec >= 30 ? 'FLANGE' : 'WEB'}`, `${e.ufm.weldColumn} FILLET BOTH SIDES`)
  }
  call(at(sMid, -half), at(e.sWeld + 2 * u, -away), `4 × ${e.weld.w} FILLET × ${e.weld.lw}`, 'BOTH WALLS, BOTH FACES')
  const wAway = e.whitmore.ends.reduce((a, q) => (q[0] * nx + q[1] * ny < a[0] * nx + a[1] * ny ? q : a))
  call(wAway, at(e.sEnd - 2 * u, -away), `WHITMORE ${Math.round(e.whitmore.Lw)}`, e.whitmore.Lw < e.whitmore.Lw0 - 0.5 ? `OF ${Math.round(e.whitmore.Lw0)} — IN THE PLATE` : undefined)
  call(at(sOut - 0.4 * e.H, half), at(sOut - 0.4 * e.H, half + 4 * u), `${inp.braceShape} BRACE`, `SLOTTED ${e.tg + 3} FOR GUSSET`)
  // dimensions: the interfaces
  const dimAt = sy * (f.kind === 'base' ? -25 - 2 * u : -f.eb - 2 * u)
  P.push({ kind: 'dim', x1: bx0, y1: dimAt, x2: bx1, y2: dimAt, text: `${Math.round(e.ufm.Lh)}`, off: 0, size: u * 0.8, ext: sy * f.eb })
  if (!noCol) {
    const dx = -colHalf - 1.4 * u
    P.push({ kind: 'dim', x1: dx, y1: sy * f.eb, x2: dx, y2: sy * (f.eb + e.ufm.Lv), text: `${Math.round(e.ufm.Lv)}`, off: 0, size: u * 0.8, ext: -colHalf })
  }

  // ── notes and title ──────────────────────────────────────────────────────
  const b = sheetBounds(P, u)
  const u3 = e.ufm
  const notes = notesBlock({
    x: b.minX, w: b.maxX - b.minX, top: b.maxY + u * 1.5, size: u * 0.75,
    lines: [
      `DESIGN FORCE ${e.P.toFixed(1)} kN (LARGER OF BRACE TENSION AND COMPRESSION) — ${Math.round(e.util * 100)}%, ${e.governs.toUpperCase()}.`,
      `UFM (AISC MANUAL PART 13): α ${Math.round(u3.alpha)}, β ${Math.round(u3.beta)} mm — Hb ${u3.Hb.toFixed(1)}, Vb ${u3.Vb.toFixed(1)}${noCol ? '' : `, Hc ${u3.Hc.toFixed(1)}, Vc ${u3.Vc.toFixed(1)}`} kN. INTERFACE FILLETS FOR 1.25× THE RESULTANT.`,
      `WHITMORE SECTION AT THE BRACE END, BUCKLING LENGTH ${Math.round(e.whitmore.L)} mm (MEAN OF THREE, K = 0.65). GUSSET A36 (Fy 248); WELDS E70XX.`,
    ],
  })
  P.push(...notes.prims)
  const title = `BRACE GUSSET @ ${inp.node} — ${f.kind === 'corner' ? 'CORNER' : f.kind === 'base' ? 'BASE' : 'BEAM'}`
  P.push(...titleBlock({ x: b.minX, w: b.maxX - b.minX, top: notes.bottom + u * 1.2, u: u * 0.82, title, detailNo: opts.detailNo, sheetRef: opts.sheetRef, scale: 'NTS' }).prims)
  return { primitives: P, bounds: sheetBounds(P, u), title }
}
