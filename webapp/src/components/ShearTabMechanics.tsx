// ─────────────────────────────────────────────────────────────────────────
// The bolted connection as it is BUILT — and what each check is checking.
//
// Elevation: a W column (flanges edge-on), the shear tab fillet-welded to its
// flange, the W beam's web bolted to the tab. Section A–A: a cut through the
// critical bolt's row, plate and web in thickness, the bolt through both.
//
// Overlays, one chip each, all drawn from the engine's own numbers:
//   Bolt forces    each bolt's share of Vu, Hu and the eccentric moment
//   Block shear    the §J4.3 block: shear plane (red) along the bolt line,
//                  tension plane (blue) to the free edge, holes deducted
//   Bearing        the strip each bolt bears on (d·t per ply) on the side it
//                  pushes, and the clear distance lc it would tear out through
//   Shear planes   the bolt's cross-section Ab, and the plane(s) it shears
//                  on in section A–A — one plane single shear, two double
//
// Vu acts DOWN on the tab: it is the beam's reaction, delivered through the
// bolts, which is why Case A (the shear path from the bottom edge) is the one
// that tears first. Geometry from `lib/connectionMechanics`; nothing here
// recomputes a strength.
// ─────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import type { BoltGroupGeom, BoltForce, BlockShearCase } from '../engine/steelDesign'
import type { AiscShape } from '../engine/aiscSections'
import { blockShearPath, clearDistance, holeDia, minFilletSize, type Pt } from '../lib/connectionMechanics'
import { DrawingFrame } from './DrawingFrame'

const INK = '#1e293b', NOTE = '#475569'
const STEEL_FILL = '#d5dbe3', STEEL_DARK = '#9aa6b4', PLATE = '#b9c7d8'
const SHEAR = '#c2410c', TENS = '#1d4ed8', BEAR = '#d97706', FORCE = '#2563eb', CRIT = '#dc2626', WELD = '#7c3aed'

export type Overlay = 'forces' | 'block' | 'bearing' | 'shear'
const CHIPS: [Overlay, string][] = [
  ['forces', 'Bolt forces'], ['block', 'Block shear'], ['bearing', 'Bearing & tear-out'], ['shear', 'Shear planes'],
]

export interface ShearTabMechanicsProps {
  geom: BoltGroupGeom
  db: number
  /** Tab thickness and strengths, mm / MPa. */
  t: number
  Fu: number
  nShear: 1 | 2
  forces: BoltForce[]
  critical: string
  blockShear: BlockShearCase[]
  /** Available block-shear strength per case, kN, same order. */
  availBlockShear: number[]
  /** Available strength per bolt, kN, on the chosen basis. */
  avail: { shear: number; bearing: number }
  /** 'φRn' or 'Rn/Ω' — how the page names an available strength. */
  R: string
  Vu: number
  Hu: number
  ex_load: number
  ey_load: number
  beam: AiscShape
  column: AiscShape
}

export function ShearTabMechanics(p: ShearTabMechanicsProps) {
  const [on, setOn] = useState<Set<Overlay>>(new Set(['forces', 'block']))
  const [bsCase, setBsCase] = useState<0 | 1>(0)
  const [hover, setHover] = useState<string | null>(null)
  const toggle = (o: Overlay) => setOn((s) => { const n = new Set(s); if (n.has(o)) n.delete(o); else n.add(o); return n })

  const { geom, db, t } = p
  const dh = holeDia(db)
  const W = geom.plateW, H = geom.plateH
  const bolts = useMemo(() => geom.bolts.map((b) => ({ id: b.id, x: b.x + geom.Cx, y: b.y + geom.Cy })), [geom])
  const force = (id: string) => p.forces.find((f) => f.id === id)
  // the push of each bolt ON THE TAB: Vu down, Hu along +x
  const push = (id: string): Pt => { const f = force(id); return f ? { x: f.Vx, y: -f.Vy } : { x: 0, y: -1 } }
  const block = blockShearPath(bolts, W, H, bsCase === 0 ? 'A' : 'B')
  const bc = p.blockShear[bsCase]
  const bcAvail = p.availBlockShear[bsCase]

  // ── shapes, mm ─────────────────────────────────────────────────────────
  const bd = p.beam.d ?? 310, btf = p.beam.tf ?? 10, btw = p.beam.tw ?? 6
  const cd = p.column.d ?? 260, ctf = p.column.tf ?? 14, cbf = p.column.bf ?? 255
  // The tab-to-column weld is NOT designed on this page — it is drawn at the
  // Table J2.4 minimum for the thinner part, on BOTH faces of the tab, and
  // labelled as exactly that.
  const wWeld = minFilletSize(Math.min(t, ctf))
  const yc = H / 2
  const setback = 13
  const beamEnd = W + 170
  const yTop = yc + bd / 2, yBot = yc - bd / 2
  const colTop = yTop + 70, colBot = yBot - 70

  // ── elevation frame ────────────────────────────────────────────────────
  // the column is cut off 120 mm back from its flange: the joint is at the
  // flange face, and the full depth only pushed the tab into a corner
  const cdv = Math.min(cd, 120)
  const EW = 380, EH = 400
  const xMin = -cdv - 12, xMax = beamEnd + 10
  const s = Math.min(EW / (xMax - xMin), EH / (colTop - colBot))
  const ox = 20 - xMin * s, oy = 36 + colTop * s
  const X = (x: number) => ox + x * s, Y = (y: number) => oy - y * s
  const elevBottom = Y(colBot)

  // ── section A–A frame: through the critical bolt's row, looking down ──
  const crit = bolts.find((b) => b.id === p.critical) ?? bolts[0]
  const rowBolts = bolts.filter((b) => Math.abs(b.y - crit.y) < 1e-6)
  const plies = p.nShear === 2
    ? [{ z0: btw / 2, z1: btw / 2 + t, kind: 'plate' }, { z0: -btw / 2 - t, z1: -btw / 2, kind: 'plate' }]
    : [{ z0: btw / 2, z1: btw / 2 + t, kind: 'plate' }]
  const zFar = btw / 2 + t + 0.65 * db + 8, zNear = -(p.nShear === 2 ? btw / 2 + t : btw / 2) - 0.65 * db - 8
  const sxMin = -ctf - 30, sxMax = W + 70
  const SX0 = 20 + EW + 40, SW = 260, SH = 230
  const ss = Math.min(SW / (sxMax - sxMin), SH / (zFar - zNear))
  const SX = (x: number) => SX0 + (x - sxMin) * ss
  const SZ = (z: number) => 60 + (zFar - z) * ss
  const secBottom = SZ(zNear)

  const totalW = SX0 + SW + 30
  const readY = Math.max(elevBottom, secBottom) + 26
  const lines = readout(p, on, bc, bcAvail, block, bsCase, dh)
  const totalH = readY + lines.length * 15 + 10

  const hb = hover ? bolts.find((b) => b.id === hover) : null
  const hf = hb ? force(hb.id) : null
  const hlc = hb ? clearDistance(hb, push(hb.id), bolts, W, H, dh) : null

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="Show on the drawing">
        {CHIPS.map(([k, label]) => (
          <button key={k} type="button" onClick={() => toggle(k)} aria-pressed={on.has(k)}
            className={`rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium ${
              on.has(k) ? 'border-brand bg-brand text-on-solid' : 'border-field-line bg-field text-ink hover:border-brand-hover'}`}>
            {label}
          </button>
        ))}
        {on.has('block') && p.blockShear.length > 1 && (
          <span className="ml-1 inline-flex rounded-md border border-field-line p-0.5 text-[11px]">
            {(['A — from bottom edge', 'B — from top edge'] as const).map((l, k) => (
              <button key={l} type="button" onClick={() => setBsCase(k as 0 | 1)} aria-pressed={bsCase === k}
                className={`rounded px-2 py-0.5 ${bsCase === k ? 'bg-brand text-on-solid' : 'text-muted hover:bg-brand-tint'}`}>
                Case {l}
              </button>
            ))}
          </span>
        )}
      </div>
      <DrawingFrame label="shear tab connection">
        <svg viewBox={`0 0 ${totalW} ${totalH}`} className="mx-auto block h-auto w-full" style={{ fontFamily: 'Arial, sans-serif' }}>
          <defs>
            <marker id="stm-f" markerWidth="7" markerHeight="7" refX="6" refY="2.5" orient="auto"><path d="M0 0 L6 2.5 L0 5 z" fill={FORCE} /></marker>
            <marker id="stm-c" markerWidth="7" markerHeight="7" refX="6" refY="2.5" orient="auto"><path d="M0 0 L6 2.5 L0 5 z" fill={CRIT} /></marker>
            <pattern id="stm-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="5" stroke={SHEAR} strokeWidth="1.2" />
            </pattern>
          </defs>

          <text x={20} y={20} fontSize={11} fontWeight={700} fill={INK}>ELEVATION — shear tab to column flange</text>

          {/* column: flanges edge-on, web between */}
          <rect x={X(-cdv)} y={Y(colTop)} width={cdv * s} height={(colTop - colBot) * s} fill={STEEL_FILL} stroke="none" />
          <rect x={X(-ctf)} y={Y(colTop)} width={ctf * s} height={(colTop - colBot) * s} fill={STEEL_DARK} stroke={INK} strokeWidth={0.9} />
          {cd > cdv
            ? <path d={zig(X(-cdv), Y(colTop), Y(colBot))} fill="none" stroke={INK} strokeWidth={0.9} />
            : <rect x={X(-cd)} y={Y(colTop)} width={ctf * s} height={(colTop - colBot) * s} fill={STEEL_DARK} stroke={INK} strokeWidth={0.9} />}
          <text x={X(-cdv / 2)} y={Y(colBot) + 14} fontSize={9.5} fill={NOTE} textAnchor="middle">{p.column.name} column</text>

          {/* beam: flanges and web, broken at the far end */}
          <rect x={X(setback)} y={Y(yTop)} width={(beamEnd - setback) * s} height={bd * s} fill={STEEL_FILL} stroke="none" />
          <rect x={X(setback)} y={Y(yTop)} width={(beamEnd - setback) * s} height={btf * s} fill={STEEL_DARK} stroke={INK} strokeWidth={0.9} />
          <rect x={X(setback)} y={Y(yBot + btf)} width={(beamEnd - setback) * s} height={btf * s} fill={STEEL_DARK} stroke={INK} strokeWidth={0.9} />
          <line x1={X(setback)} y1={Y(yTop)} x2={X(setback)} y2={Y(yBot)} stroke={INK} strokeWidth={0.9} />
          <path d={zig(X(beamEnd), Y(yTop) - 4, Y(yBot) + 4)} fill="none" stroke={INK} strokeWidth={0.9} />
          <text x={X(beamEnd) - 4} y={Y(yTop) - 6} fontSize={9.5} fill={NOTE} textAnchor="end">{p.beam.name} beam · tw {btw} mm</text>

          {/* the tab, welded to the flange */}
          <rect x={X(0)} y={Y(H)} width={W * s} height={H * s} fill={PLATE} fillOpacity={0.92} stroke={INK} strokeWidth={1.2} />
          <line x1={X(0)} y1={Y(H)} x2={X(0)} y2={Y(0)} stroke={WELD} strokeWidth={3.2} />
          <line x1={X(0) + 2} y1={Y(H) + 6} x2={X(0) + 22} y2={Y(H) - 16} stroke={WELD} strokeWidth={0.8} />
          <text x={X(0) + 24} y={Y(H) - 18} fontSize={9} fill={WELD}>fillets both faces, w {wWeld} (J2.4 min.) — not checked</text>
          <text x={X(W) + 6} y={Y(0) - 2} fontSize={9.5} fill={NOTE}>PL {Math.round(W)}×{Math.round(H)}×{t}</text>

          {/* block shear */}
          {on.has('block') && bc && (
            <g>
              <polygon points={block.polygon.map((q) => `${X(q.x)},${Y(q.y)}`).join(' ')} fill="url(#stm-hatch)" fillOpacity={0.55} stroke="none" />
              <line x1={X(block.shear[0].x)} y1={Y(block.shear[0].y)} x2={X(block.shear[1].x)} y2={Y(block.shear[1].y)} stroke={SHEAR} strokeWidth={2.6} strokeDasharray="7 3" />
              <line x1={X(block.tension[0].x)} y1={Y(block.tension[0].y)} x2={X(block.tension[1].x)} y2={Y(block.tension[1].y)} stroke={TENS} strokeWidth={2.6} />
              <text x={X(W) + 6} y={(Y(block.shear[0].y) + Y(block.shear[1].y)) / 2} fontSize={9.5} fill={SHEAR} fontWeight={700}>Agv / Anv — shear plane</text>
              <text x={X((block.tension[0].x + block.tension[1].x) / 2)} y={Y(block.tension[0].y) + (bsCase === 0 ? -6 : 13)} fontSize={9.5} fill={TENS} textAnchor="middle" fontWeight={700}>Ant</text>
            </g>
          )}

          {/* bolts — hover one to read it */}
          {bolts.map((b) => {
            const isCrit = b.id === p.critical
            const f = force(b.id)
            const u = push(b.id)
            const ul = Math.hypot(u.x, u.y) || 1
            const lc = on.has('bearing') ? clearDistance(b, u, bolts, W, H, dh) : null
            const ang = Math.atan2(-u.y, u.x)            // page angle of the push
            const r = (dh / 2) * s
            return (
              <g key={b.id} onMouseEnter={() => setHover(b.id)} onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(b.id)} onBlur={() => setHover(null)} tabIndex={0} style={{ cursor: 'pointer', outline: 'none' }}>
                {on.has('shear') && <circle cx={X(b.x)} cy={Y(b.y)} r={(db / 2) * s} fill={SHEAR} fillOpacity={0.35} />}
                <circle cx={X(b.x)} cy={Y(b.y)} r={r} fill="#fff" fillOpacity={on.has('shear') ? 0 : 1} stroke={isCrit ? CRIT : INK} strokeWidth={isCrit ? 1.8 : 1.1} />
                {on.has('bearing') && (
                  <path d={halfDisc(X(b.x), Y(b.y), r, ang)} fill={BEAR} fillOpacity={0.75} />
                )}
                {lc && (
                  <g>
                    <line x1={X(b.x) + Math.cos(ang) * r} y1={Y(b.y) + Math.sin(ang) * r} x2={X(lc.to.x)} y2={Y(lc.to.y)} stroke={BEAR} strokeWidth={1.6} />
                    <text x={(X(b.x) + X(lc.to.x)) / 2 + 5} y={(Y(b.y) + Y(lc.to.y)) / 2 + 3} fontSize={9} fill={BEAR} fontWeight={700}>lc {Math.round(lc.lc)}</text>
                  </g>
                )}
                {on.has('forces') && f && f.R > 0 && (() => {
                  const L = Math.min(48, 14 + 30 * (f.R / Math.max(...p.forces.map((q) => q.R), 1e-9)))
                  return <line x1={X(b.x)} y1={Y(b.y)} x2={X(b.x) + (u.x / ul) * L} y2={Y(b.y) - (u.y / ul) * L}
                    stroke={isCrit ? CRIT : FORCE} strokeWidth={1.6} markerEnd={`url(#${isCrit ? 'stm-c' : 'stm-f'})`} />
                })()}
                <text x={X(b.x) - r - 3} y={Y(b.y) - r} fontSize={9} fill={isCrit ? CRIT : NOTE} textAnchor="end">{b.id}</text>
              </g>
            )
          })}

          {/* ── section A–A ────────────────────────────────────────────── */}
          <text x={SX0} y={20} fontSize={11} fontWeight={700} fill={INK}>SECTION A–A</text>
          <text x={SX0} y={33} fontSize={9} fill={NOTE}>through {crit.id}'s row, looking down · thickness to scale</text>
          {/* column flange (cut), web of the beam, plate(s) */}
          <rect x={SX(-ctf)} y={SZ(zFar)} width={ctf * ss} height={(zFar - zNear) * ss} fill={STEEL_DARK} stroke={INK} strokeWidth={0.9} />
          <rect x={SX(setback)} y={SZ(btw / 2)} width={(sxMax - setback) * ss} height={btw * ss} fill={STEEL_FILL} stroke={INK} strokeWidth={0.9} />
          <text x={SX(sxMax) - 2} y={SZ(-btw / 2) + 11} fontSize={8.5} fill={NOTE} textAnchor="end">beam web {btw}</text>
          {plies.map((q, k) => (
            <g key={k}>
              <rect x={SX(0)} y={SZ(q.z1)} width={W * ss} height={t * ss} fill={PLATE} stroke={INK} strokeWidth={1} />
              {/* the two fillets, one on each face of the tab, against the
                  column flange face (x = 0) — leg wWeld on both surfaces */}
              {[[q.z1, 1], [q.z0, -1]].map(([zf, dir]) => (
                <polygon key={dir} points={`${SX(0)},${SZ(zf)} ${SX(0)},${SZ(zf + dir * wWeld)} ${SX(wWeld)},${SZ(zf)}`}
                  fill={WELD} stroke={WELD} strokeWidth={0.6} />
              ))}
            </g>
          ))}
          <text x={SX(W) + 3} y={SZ(btw / 2 + t) - 3} fontSize={8.5} fill={NOTE}>tab t {t}</text>
          <text x={SX(-ctf / 2)} y={secBottom + 12} fontSize={8.5} fill={NOTE} textAnchor="middle">col. flange (bf {Math.round(cbf)}, cut)</text>
          {/* the bolts of the row, through every ply */}
          {rowBolts.map((b) => {
            const zTopB = btw / 2 + t, zBotB = p.nShear === 2 ? -btw / 2 - t : -btw / 2
            const hx = SX(b.x - db / 2)
            return (
              <g key={b.id}>
                {on.has('bearing') && plies.concat([{ z0: -btw / 2, z1: btw / 2, kind: 'web' }]).map((q, k) => (
                  <rect key={k} x={hx} y={SZ(q.z1)} width={db * ss} height={(q.z1 - q.z0) * ss} fill={BEAR} fillOpacity={0.6} />
                ))}
                <rect x={hx} y={SZ(zTopB + 0.65 * db)} width={db * ss} height={(zTopB - zBotB + 1.3 * db) * ss} fill="none" stroke={INK} strokeWidth={1} />
                <rect x={SX(b.x - 0.8 * db)} y={SZ(zTopB + 0.65 * db)} width={1.6 * db * ss} height={0.65 * db * ss} fill="#e2e8f0" stroke={INK} strokeWidth={1} />
                <rect x={SX(b.x - 0.8 * db)} y={SZ(zBotB)} width={1.6 * db * ss} height={0.65 * db * ss} fill="#e2e8f0" stroke={INK} strokeWidth={1} />
                {on.has('shear') && [btw / 2, ...(p.nShear === 2 ? [-btw / 2] : [])].map((z) => (
                  <line key={z} x1={SX(b.x - db)} y1={SZ(z)} x2={SX(b.x + db)} y2={SZ(z)} stroke={SHEAR} strokeWidth={2.4} strokeDasharray="4 2" />
                ))}
              </g>
            )
          })}
          {on.has('shear') && <text x={SX(rowBolts[rowBolts.length - 1].x + db) + 4} y={SZ(-btw / 2) + 12} fontSize={9} fill={SHEAR} fontWeight={700}>↑ shear plane{p.nShear === 2 ? 's' : ''} at the ply interface</text>}
          {on.has('bearing') && <text x={SX(rowBolts[0].x) } y={SZ(zNear) + 0} fontSize={9} fill={BEAR} fontWeight={700} textAnchor="middle" dy={-2}>d × t bearing</text>}

          {/* readout — what the visible overlays are, with the engine's numbers */}
          {lines.map((l, k) => (
            <text key={k} x={20} y={readY + k * 15} fontSize={10} fill={l.color} fontWeight={l.bold ? 700 : 400}>{l.text}</text>
          ))}
        </svg>
      </DrawingFrame>
      <p className="mt-1 min-h-[1.25rem] text-[12px] text-muted" aria-live="polite">
        {hb && hf
          ? `${hb.id}: R = ${hf.R.toFixed(2)} kN (Vx ${hf.Vx.toFixed(2)}, Vy ${hf.Vy.toFixed(2)}) · ${p.R} per bolt ${Math.min(p.avail.shear, p.avail.bearing).toFixed(2)} kN · fv ${hf.fv.toFixed(0)} MPa · fbr ${hf.fbr.toFixed(0)} MPa${hlc ? ` · lc ${Math.round(hlc.lc)} mm` : ''}`
          : 'Hover or focus a bolt to read its force, stresses and clear distance.'}
      </p>
    </div>
  )
}

/** The half of a hole a bolt bears on, facing the way it pushes. */
function halfDisc(cx: number, cy: number, r: number, ang: number): string {
  const a0 = ang - Math.PI / 2, a1 = ang + Math.PI / 2
  const p0 = [cx + r * Math.cos(a0), cy + r * Math.sin(a0)], p1 = [cx + r * Math.cos(a1), cy + r * Math.sin(a1)]
  return `M${cx} ${cy} L${p0[0]} ${p0[1]} A${r} ${r} 0 0 1 ${p1[0]} ${p1[1]} Z`
}

/** A vertical break line. */
function zig(x: number, y0: number, y1: number): string {
  const n = 6, h = (y1 - y0) / n
  let d = `M${x} ${y0}`
  for (let k = 1; k <= n; k++) d += ` L${x + (k % 2 ? 5 : -5)} ${y0 + h * (k - 0.5)} L${x} ${y0 + h * k}`
  return d
}

interface Line { text: string; color: string; bold?: boolean }
function readout(
  p: ShearTabMechanicsProps, on: Set<Overlay>, bc: BlockShearCase | undefined, bcAvail: number | undefined,
  block: { Lv: number; Lt: number; holes: Pt[] }, k: 0 | 1, dh: number,
): Line[] {
  const L: Line[] = []
  const wWeld = minFilletSize(Math.min(p.t, p.column.tf ?? p.t))
  L.push({ text: `Tab weld: a fillet on each face at the Table J2.4 minimum w = ${wWeld} mm — its strength is NOT checked here (size it on Welded Connection).`, color: WELD })
  if (on.has('forces')) {
    const c = p.forces.find((f) => f.id === p.critical)
    if (c) L.push({ text: `Bolt forces — Vu ${p.Vu.toFixed(1)} kN down, Hu ${p.Hu.toFixed(1)} kN at e = (${p.ex_load}, ${p.ey_load}) mm; critical ${p.critical}: R = ${c.R.toFixed(2)} kN.`, color: FORCE })
  }
  if (on.has('block') && bc) {
    L.push({ text: `Block shear §J4.3, case ${k === 0 ? 'A' : 'B'}: shear plane Lv = ${block.Lv.toFixed(0)} mm through ${block.holes.length} holes (⌀${dh}); tension plane Lt = ${block.Lt.toFixed(0)} mm.`, color: SHEAR, bold: true })
    L.push({ text: `Agv = ${bc.Agv.toFixed(0)}, Anv = ${bc.Anv.toFixed(0)}, Ant = ${bc.Ant.toFixed(0)} mm² · Rn = min(0.6FuAnv, 0.6FyAgv) + Ubs·Fu·Ant = ${bc.Rn.toFixed(1)} kN · ${p.R} = ${(bcAvail ?? 0).toFixed(1)} kN vs Vu ${p.Vu.toFixed(1)} kN.`, color: SHEAR })
  }
  if (on.has('bearing')) {
    L.push({ text: `Bearing §J3.10: each bolt bears on d × t = ${p.db} × ${p.t} = ${p.db * p.t} mm² of tab on the side it pushes (amber); Rn = 2.4·d·t·Fu → ${p.R} = ${p.avail.bearing.toFixed(1)} kN per bolt.`, color: BEAR, bold: true })
    L.push({ text: `lc = clear distance from the hole edge to the free edge or next hole along the push — the steel the bolt would tear out through.`, color: BEAR })
    const tw = p.beam.tw ?? 0
    if (tw > 0 && tw < p.t) L.push({ text: `The beam web bears too — d × tw = ${p.db} × ${tw} = ${(p.db * tw).toFixed(0)} mm², thinner than the tab, so it governs bearing there. This page checks the tab only: check the web.`, color: CRIT })
  }
  if (on.has('shear')) {
    const Ab = (Math.PI / 4) * p.db * p.db
    L.push({ text: `Bolt shear §J3.6: Ab = π·${p.db}²/4 = ${Ab.toFixed(0)} mm² per plane × ${p.nShear} plane${p.nShear === 2 ? 's' : ''} (${p.nShear === 2 ? 'double' : 'single'} shear) → ${p.R} = ${p.avail.shear.toFixed(1)} kN per bolt.`, color: SHEAR, bold: true })
  }
  return L
}
