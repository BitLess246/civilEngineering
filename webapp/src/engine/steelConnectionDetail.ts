// ─────────────────────────────────────────────────────────────────────────
// STEEL CONNECTION DETAIL — one designed beam-end connection, as a sheet.
//
// Two views of the `BeamConnection` the design produced, side by side:
//   ELEVATION  support at left, beam entering from the right, the plate with
//              its bolts at their designed positions, the cope, the welds, and
//              the plate dimensioned (h, edge a, pitch p);
//   SECTION    looking along the beam at the support face: the beam's end, the
//              plate on the web, each bolt as shank + head + nut, the single
//              shear plane, and the flange welds / extension plates of a
//              moment connection.
// Every number comes from the design row and the AISC shapes; nothing on the
// sheet is chosen here. `ConnectionDetail2D` renders this same drawing, so the
// detail beside the connection schedule and the sheet in the drawing set are
// one object rendered twice (it used to be a separate hand-drawn SVG).
// Units: mm, sheet y DOWN.
// ─────────────────────────────────────────────────────────────────────────
import type { BeamConnection } from './steelConnections'
import { shapeByName } from './aiscSections'
import type { PlanPrimitive, Drawing, PathCmd } from './planRenderer'
import { SHEET_INK, SHEET_NOTE, SHEET_GRID, STEEL, STEEL_CONTEXT, SHEET_STEELWORK } from './sheetInk'
import { leader, titleBlock, sheetBounds } from './detailSheet'

export interface ConnectionDetailInput {
  conn: BeamConnection
  /** The supporting member: a column (flange or web face) or a girder web. */
  hostShape: string
  hostKind: 'column' | 'girder'
  faceType: 'flange' | 'web'
  /** The supported beam's shape; the plate's own height stands in without it. */
  beamShape?: string
  /** The typical-detail mark (`lib/steelMarks`), printed in the title. */
  mark?: string
  /** Demand the mark is designed for — the worst end it serves. */
  Vu?: number; Mu?: number; ends?: number
}

export interface ConnectionDetailOptions { detailNo?: string; sheetRef?: string; title?: string }
export interface ConnectionDetailDrawing extends Drawing { title: string }

const KIND_TITLE: Record<BeamConnection['connType'], string> = {
  'shear-tab': 'SHEAR TAB',
  'moment-flange-weld': 'MOMENT — CJP FLANGES',
  'moment-web-plate': 'MOMENT — WEB EXTENSION PLATES',
}

export function buildConnectionDetail(i: ConnectionDetailInput, opts: ConnectionDetailOptions = {}): ConnectionDetailDrawing {
  const { conn } = i
  const host = shapeByName(i.hostShape)
  const beam = i.beamShape ? shapeByName(i.beamShape) : undefined
  const tab = conn.tab
  const dB = beam?.d ?? tab.hMm + 160
  const bfB = beam?.bf ?? 160, tfB = beam?.tf ?? 12, twB = beam?.tw ?? 8
  const hostTf = host?.tf ?? 15
  const isGirder = i.hostKind === 'girder'
  // The host as the beam's elevation sees it. A column runs up the sheet, so
  // the band is its dimension ALONG the beam (d for a flange face, bf for a
  // web face). A girder runs ACROSS the beam, so the elevation cuts it: an I
  // of the girder's own bf, its top flush with the beam's (top of steel).
  const gD = host?.d ?? dB + 50, gBf = host?.bf ?? 170, gTw = host?.tw ?? 8
  const hostW = isGirder ? gBf : i.faceType === 'flange' ? (host?.d ?? 300) : (host?.bf ?? 300)
  const isWebCol = i.hostKind === 'column' && i.faceType === 'web'
  const SETBACK = 13                                     // beam end clear of the girder web, mm
  const u = Math.max(dB, 240) * 0.045                     // type unit
  const P: PlanPrimitive[] = []
  const txt = (x: number, y: number, text: string, size = u, anchor: 'start' | 'middle' | 'end' = 'start', color = SHEET_NOTE, weight = 500) =>
    P.push({ kind: 'text', x, y, text, size, anchor, color, weight })
  const weldTri = (x: number, y: number, dir: 1 | -1) =>
    P.push({ kind: 'path', cmds: [{ c: 'M', x, y }, { c: 'L', x: x + u * 1.1, y }, { c: 'L', x, y: y - dir * u * 0.9 }], closed: true, fill: SHEET_INK, stroke: SHEET_INK, width: 0.6 })

  // ── ELEVATION ─────────────────────────────────────────────────────────────
  const beamLen = Math.max(tab.wMm + 170, 310)
  const H = Math.max(dB, tab.hMm, isGirder ? gD : 0) + 8 * u
  const x0 = 0
  const cy = isGirder ? 4 * u + dB / 2 : H / 2, beamTop = cy - dB / 2, beamBot = cy + dB / 2
  // where the plate welds, and where the beam's end is
  const weldX = isWebCol ? x0 + hostW / 2 : isGirder ? x0 + gBf / 2 + gTw / 2 : x0 + hostW
  const faceX = isGirder ? weldX + SETBACK : x0 + hostW
  const plateTop = cy - tab.hMm / 2
  const boltY = (y: number) => plateTop + tab.hMm - y    // plate y (up) → sheet y
  txt(x0 + (hostW + beamLen) / 2, -u * 1.6, 'ELEVATION', u * 1.3, 'middle', SHEET_INK, 700)
  // support: a column band with its flanges / web line, or the girder cut
  if (isGirder) {
    const gTf = host?.tf ?? 10
    const gi: [number, number][] = [
      [0, 0], [gBf, 0], [gBf, gTf], [gBf / 2 + gTw / 2, gTf], [gBf / 2 + gTw / 2, gD - gTf], [gBf, gD - gTf],
      [gBf, gD], [0, gD], [0, gD - gTf], [gBf / 2 - gTw / 2, gD - gTf], [gBf / 2 - gTw / 2, gTf], [0, gTf],
    ]
    P.push({ kind: 'path', cmds: gi.map(([x, y], k) => ({ c: k === 0 ? 'M' : 'L', x: x0 + x, y: beamTop + y }) as PathCmd), closed: true, fill: SHEET_STEELWORK, stroke: SHEET_INK, width: 0.9 })
  } else P.push({ kind: 'rect', x: x0, y: 0, w: hostW, h: H, fill: SHEET_STEELWORK, stroke: STEEL_CONTEXT, width: 0.8 })
  if (i.hostKind === 'column' && i.faceType === 'flange') {
    P.push({ kind: 'rect', x: x0, y: 0, w: hostTf, h: H, fill: STEEL_CONTEXT })
    P.push({ kind: 'rect', x: x0 + hostW - hostTf, y: 0, w: hostTf, h: H, fill: STEEL_CONTEXT })
  }
  if (isWebCol) P.push({ kind: 'line', x1: weldX, y1: 0, x2: weldX, y2: H, stroke: STEEL_CONTEXT, width: 0.8, dash: [u * 0.8, u * 0.5] })
  const hostLabelY = isGirder ? beamTop + gD + u * 1.6 : u * 1.4
  txt(x0 + hostW / 2, hostLabelY, i.hostShape, u * 0.9, 'middle', SHEET_INK, 600)
  txt(x0 + hostW / 2, hostLabelY + u * 1.1, isGirder ? 'GIRDER (CUT)' : `COLUMN ${i.faceType.toUpperCase()}`, u * 0.85, 'middle')
  // beam, coped where the design coped it
  const cope = conn.cope
  const beamPath: PathCmd[] = cope
    ? [{ c: 'M', x: faceX + cope.lengthMm, y: beamTop }, { c: 'L', x: faceX + beamLen, y: beamTop }, { c: 'L', x: faceX + beamLen, y: beamBot },
       { c: 'L', x: faceX, y: beamBot }, { c: 'L', x: faceX, y: beamTop + cope.depthMm }, { c: 'L', x: faceX + cope.lengthMm, y: beamTop + cope.depthMm }]
    : [{ c: 'M', x: faceX, y: beamTop }, { c: 'L', x: faceX + beamLen, y: beamTop }, { c: 'L', x: faceX + beamLen, y: beamBot }, { c: 'L', x: faceX, y: beamBot }]
  P.push({ kind: 'path', cmds: beamPath, closed: true, fill: SHEET_STEELWORK, stroke: STEEL_CONTEXT, width: 0.9 })
  P.push({ kind: 'line', x1: cope ? faceX + cope.lengthMm : faceX, y1: beamTop + tfB, x2: faceX + beamLen, y2: beamTop + tfB, stroke: STEEL_CONTEXT, width: 0.6 })
  P.push({ kind: 'line', x1: faceX, y1: beamBot - tfB, x2: faceX + beamLen, y2: beamBot - tfB, stroke: STEEL_CONTEXT, width: 0.6 })
  // break line at the free end
  P.push({ kind: 'line', x1: faceX + beamLen, y1: beamTop - u, x2: faceX + beamLen, y2: beamBot + u, stroke: SHEET_GRID, width: 0.6, dash: [u, u * 0.4, u * 0.2, u * 0.4] })
  txt(faceX + beamLen - u * 0.5, beamBot - tfB - u * 0.6, i.beamShape ?? 'BEAM', u * 0.9, 'end', SHEET_INK, 600)
  if (cope) P.push({ kind: 'dim', x1: faceX, y1: beamTop - u * 1.8, x2: faceX + cope.lengthMm, y2: beamTop - u * 1.8, text: `COPE ${cope.lengthMm}×${cope.depthMm}`, off: 0, size: u * 0.85, ext: beamTop })
  // the plate — welded full height to the support, bolted to the beam web
  P.push({ kind: 'rect', x: weldX, y: plateTop, w: tab.wMm, h: tab.hMm, stroke: SHEET_INK, width: 1.6, fill: 'none' })
  P.push({ kind: 'rect', x: weldX - u * 0.25, y: plateTop, w: u * 0.5, h: tab.hMm, fill: SHEET_INK })
  P.push(...leader({ x: weldX, y: plateTop + u, tx: weldX + tab.wMm + u * 3.5, ty: plateTop - u * 2.4,
    text: `${tab.weldSizeMm} E70XX FILLET, BOTH SIDES, FULL HEIGHT`, size: u * 0.8 }))
  if (conn.connType === 'moment-flange-weld') {
    weldTri(faceX, beamTop, 1); weldTri(faceX, beamBot, -1)
    P.push(...leader({ x: faceX + u * 0.4, y: beamBot + u * 0.5, tx: faceX + u * 4, ty: beamBot + u * 2.6, text: 'CJP FLANGE WELDS, TOP AND BOTTOM', size: u * 0.8 }))
  }
  const wp = conn.flange?.webPlate
  if (conn.connType === 'moment-web-plate' && wp) {
    P.push({ kind: 'rect', x: weldX, y: beamTop, w: faceX - weldX + u * 0.4, h: tfB, fill: SHEET_INK })
    P.push({ kind: 'rect', x: weldX, y: beamBot - tfB, w: faceX - weldX + u * 0.4, h: tfB, fill: SHEET_INK })
    weldTri(faceX + u * 0.4, beamTop, 1); weldTri(faceX + u * 0.4, beamBot, -1)
    P.push(...leader({ x: (weldX + faceX) / 2, y: beamBot - tfB / 2, tx: faceX + u * 4, ty: beamBot + u * 2.6,
      text: `EXT. PL ${wp.tMm}×${Math.round(wp.wMm)}, ${wp.weldMm} FILLET TO COL. WEB; CJP TO BEAM FLANGE`, size: u * 0.8 }))
  }
  // bolts at their designed positions (x from the weld line, y up the plate)
  const rows = conn.bolts.locations
  const rb = conn.bolts.dia / 2
  for (const b of rows) {
    const bx = weldX + b.x, by = boltY(b.y)
    P.push({ kind: 'circle', cx: bx, cy: by, r: rb, stroke: STEEL, fill: 'none', width: 1.4 })
    P.push({ kind: 'line', x1: bx - rb * 1.5, y1: by, x2: bx + rb * 1.5, y2: by, stroke: STEEL, width: 0.6 })
    P.push({ kind: 'line', x1: bx, y1: by - rb * 1.5, x2: bx, y2: by + rb * 1.5, stroke: STEEL, width: 0.6 })
  }
  const a0 = rows[0]?.x ?? conn.bolts.edgeMm
  P.push({ kind: 'dim', x1: weldX + tab.wMm + u * 2, y1: plateTop, x2: weldX + tab.wMm + u * 2, y2: plateTop + tab.hMm, text: `${Math.round(tab.hMm)}`, off: 0, size: u * 0.8, ext: weldX + tab.wMm })
  P.push({ kind: 'dim', x1: weldX, y1: plateTop + tab.hMm + u * 2, x2: weldX + a0, y2: plateTop + tab.hMm + u * 2, text: `${Math.round(a0)}`, off: 0, size: u * 0.8, ext: plateTop + tab.hMm })
  if (rows.length > 1) {
    const ys = rows.map((b) => boltY(b.y)).sort((p, q) => p - q)
    P.push({ kind: 'dim', x1: weldX + a0 - u * 2.2, y1: ys[0]!, x2: weldX + a0 - u * 2.2, y2: ys[ys.length - 1]!, text: `${rows.length - 1}@${conn.bolts.pitchMm}`, off: 0, size: u * 0.85, ext: weldX + a0 })
  }
  // the plate's own callout, below the beam where nothing else is drawn
  const plY = Math.max(beamBot, isGirder ? beamTop + gD + u * 2.4 : 0) + u * (conn.connType === 'shear-tab' ? 2.6 : 5.6)
  const plX = Math.max(faceX + u * 2, weldX + tab.wMm / 2)
  P.push(...leader({ x: weldX + tab.wMm * 0.75, y: plateTop + tab.hMm - u * 0.5, tx: plX + u * 4, ty: plY,
    text: `PL ${tab.t}×${Math.round(tab.wMm)}×${Math.round(tab.hMm)}, ${conn.bolts.n}-M${conn.bolts.dia} A325-N`, size: u * 0.8, color: SHEET_INK, weight: 700 }))

  // ── SECTION (looking along the beam at the support) ───────────────────────
  const elevRight = faceX + beamLen
  const supW = isGirder ? bfB + u * 6
    : isWebCol ? Math.max(host?.d ?? 300, bfB + 60) : Math.max(bfB + 60, host?.bf ?? 254)
  const sx = elevRight + Math.max(supW, bfB) / 2 + u * 9        // section centreline
  txt(sx, -u * 1.6, 'SECTION', u * 1.3, 'middle', SHEET_INK, 700)
  const dash = [u * 0.7, u * 0.4]
  if (isGirder) {
    // the girder runs across this view: its web face beyond, flanges as lines
    const gTf = host?.tf ?? 10
    P.push({ kind: 'rect', x: sx - supW / 2, y: beamTop, w: supW, h: gD, fill: 'none', stroke: STEEL_CONTEXT, width: 0.6, dash })
    P.push({ kind: 'line', x1: sx - supW / 2, y1: beamTop + gTf, x2: sx + supW / 2, y2: beamTop + gTf, stroke: STEEL_CONTEXT, width: 0.5, dash })
    P.push({ kind: 'line', x1: sx - supW / 2, y1: beamTop + gD - gTf, x2: sx + supW / 2, y2: beamTop + gD - gTf, stroke: STEEL_CONTEXT, width: 0.5, dash })
  } else P.push({ kind: 'rect', x: sx - supW / 2, y: cy - dB / 2 - u * 2.5, w: supW, h: dB + u * 5, fill: 'none', stroke: STEEL_CONTEXT, width: 0.6, dash })
  if (isWebCol) {
    P.push({ kind: 'rect', x: sx - supW / 2, y: cy - dB / 2 - u * 2.5, w: hostTf, h: dB + u * 5, fill: SHEET_STEELWORK, stroke: STEEL_CONTEXT, width: 0.6 })
    P.push({ kind: 'rect', x: sx + supW / 2 - hostTf, y: cy - dB / 2 - u * 2.5, w: hostTf, h: dB + u * 5, fill: SHEET_STEELWORK, stroke: STEEL_CONTEXT, width: 0.6 })
  }
  txt(sx - supW / 2, cy - dB / 2 - u * (isGirder ? 0.8 : 3.1), `${isGirder ? `${i.hostShape} GIRDER` : `COLUMN ${i.faceType.toUpperCase()}`} BEYOND`, u * 0.85)
  // beam end, cut
  const ib: PathCmd[] = [
    [-bfB / 2, -dB / 2], [bfB / 2, -dB / 2], [bfB / 2, -dB / 2 + tfB], [twB / 2, -dB / 2 + tfB], [twB / 2, dB / 2 - tfB], [bfB / 2, dB / 2 - tfB],
    [bfB / 2, dB / 2], [-bfB / 2, dB / 2], [-bfB / 2, dB / 2 - tfB], [-twB / 2, dB / 2 - tfB], [-twB / 2, -dB / 2 + tfB], [-bfB / 2, -dB / 2 + tfB],
  ].map(([x, y], k) => ({ c: k === 0 ? 'M' : 'L', x: sx + x!, y: cy + y! }) as PathCmd)
  P.push({ kind: 'path', cmds: ib, closed: true, fill: SHEET_STEELWORK, stroke: SHEET_INK, width: 0.9 })
  // plate on the near side of the web
  const plx = sx + twB / 2
  P.push({ kind: 'rect', x: plx, y: cy - tab.hMm / 2, w: tab.t, h: tab.hMm, fill: SHEET_INK })
  if (conn.connType === 'moment-flange-weld') {
    P.push({ kind: 'rect', x: sx - bfB / 2, y: cy - dB / 2 - u * 0.5, w: bfB, h: u * 0.5, fill: SHEET_INK })
    P.push({ kind: 'rect', x: sx - bfB / 2, y: cy + dB / 2, w: bfB, h: u * 0.5, fill: SHEET_INK })
  } else if (conn.connType === 'moment-web-plate' && wp) {
    P.push({ kind: 'rect', x: sx - wp.wMm / 2, y: cy - dB / 2 - wp.tMm, w: wp.wMm, h: wp.tMm, fill: SHEET_INK })
    P.push({ kind: 'rect', x: sx - wp.wMm / 2, y: cy + dB / 2, w: wp.wMm, h: wp.tMm, fill: SHEET_INK })
  }
  // bolts: shank through plate + web, head on the plate, nut on the web
  for (const b of rows) {
    const y = cy + tab.hMm / 2 - b.y
    const hd = conn.bolts.dia * 0.7, hh = conn.bolts.dia * 1.6
    P.push({ kind: 'rect', x: sx - twB / 2 - hd * 0.3, y: y - rb, w: twB + tab.t + hd * 0.6, h: 2 * rb, fill: STEEL })
    P.push({ kind: 'rect', x: plx + tab.t, y: y - hh / 2, w: hd, h: hh, fill: STEEL })
    P.push({ kind: 'rect', x: sx - twB / 2 - hd, y: y - hh / 2, w: hd, h: hh, fill: STEEL })
  }
  if (rows.length) {
    const y = cy + tab.hMm / 2 - rows[0]!.y
    P.push({ kind: 'line', x1: plx, y1: y - u * 2, x2: plx, y2: y + u * 2, stroke: SHEET_NOTE, width: 0.8, dash: [u * 0.4, u * 0.3] })
    P.push(...leader({ x: plx, y: y + u * 2, tx: sx + Math.max(supW, bfB) / 2 + u, ty: cy + dB / 2 + u * 3.4, text: 'SINGLE SHEAR PLANE (m = 1)', size: u * 0.8 }))
  }
  P.push(...leader({ x: plx + tab.t, y: cy - tab.hMm / 2 + u * 0.6, tx: sx + Math.max(supW, bfB) / 2 + u, ty: cy - tab.hMm / 2 - u, text: `PL ${tab.t} ON NEAR FACE OF WEB`, size: u * 0.8 }))
  txt(sx, Math.max(cy + dB / 2, isGirder ? beamTop + gD : 0) + u * 2.2, i.beamShape ?? 'BEAM', u * 0.9, 'middle', SHEET_INK, 600)

  // ── notes and title ───────────────────────────────────────────────────────
  const bodyBottom = Math.max(H, cy + dB / 2 + u * 6, isGirder ? beamTop + gD + u * 4 : 0, plY + u)
  const notes = [
    `PLATE Fy 248 MPa (A36); BOLTS ${conn.bolts.n}-M${conn.bolts.dia} A325-N IN STD HOLES, EDGE ${conn.bolts.edgeMm}, PITCH ${conn.bolts.pitchMm}; WELDS E70XX.`,
    conn.pinned ? 'SIMPLE (SHEAR) CONNECTION — THE END IS RELEASED IN THE ANALYSIS.' : 'MOMENT CONNECTION — THE END IS RIGID IN THE ANALYSIS.',
  ]
  if (i.Vu != null) notes.push(`DESIGNED FOR Vu = ${i.Vu.toFixed(1)} kN${i.Mu ? `, Mu = ${i.Mu.toFixed(1)} kN·m` : ''}${i.ends ? ` — THE WORST OF ${i.ends} END${i.ends === 1 ? '' : 'S'} THIS MARK SERVES` : ''}. AISC 360-16 LRFD.`)
  notes.forEach((t, k) => txt(x0, bodyBottom + u * (2 + k * 1.3), t, u * 0.85))
  const title = opts.title ?? `${i.mark ? `${i.mark} — ` : ''}${isGirder ? 'FIN PLATE — BEAM TO GIRDER WEB' : KIND_TITLE[conn.connType]}`
  const right = sx + Math.max(supW, bfB) / 2 + u * 10
  P.push(...titleBlock({ x: x0, w: right - x0, top: bodyBottom + u * (2.6 + notes.length * 1.3), u: u * 0.82, title, detailNo: opts.detailNo, sheetRef: opts.sheetRef, scale: 'NTS' }).prims)
  return { primitives: P, bounds: sheetBounds(P, u), title }
}
