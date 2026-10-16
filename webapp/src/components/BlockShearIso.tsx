// ─────────────────────────────────────────────────────────────────────────
// Block shear, isometric — the tab exploded along the planes §J4.3 adds.
//
// `ShearTabMechanics` draws the tear-out path in elevation, where the shear
// and tension planes are lines. Here they are the faces they are: the plate's
// thickness times their length, a gap cut at every hole — so Anv and Ant
// read straight off the picture. The governing case is drawn.
//
// Geometry from `lib/blockShearIso` (face areas asserted = engine Agv/Anv/Agt/Ant).
// ─────────────────────────────────────────────────────────────────────────
import { useId } from 'react'
import { DrawingFrame } from './DrawingFrame'
import { Leader } from './Leader'
import type { BlockShearCase } from '../engine/steelDesign'
import { blockShearIso } from '../lib/blockShearIso'
import type { Pt } from '../lib/connectionMechanics'
import { extrudeFaces, faceVisible, fitIso, isoPath, sortFaces, type Face, type IsoView, type Vec3 } from '../lib/isometric'

/** Turned toward the plate's face so its holes and the cut faces both read. */
const BLOCK_VIEW: IsoView = { az: -58, el: 24 }
const INK = '#37526e', CRIT = '#c2402a', TENS = '#b45309', FAINT = '#8a8f98'
const STEEL: Record<string, string> = { front: '#dfe6ee', side: '#b9c6d4', top: '#ced8e3' }
const BORE = '#97a6b6'      // the hole's inner wall, a shade darker than the plate's side
const halo = { paintOrder: 'stroke' as const, stroke: 'var(--sheet, #fff)', strokeWidth: 2.6, strokeLinejoin: 'round' as const }
const fmt = (v: number) => Math.round(v).toLocaleString()

export interface BlockShearIsoProps {
  /** Bolt centres in plate mm (origin bottom-left, y up), plate W × H, thickness t, hole ⌀. */
  bolts: Pt[]
  W: number
  H: number
  t: number
  dh: number
  cases: BlockShearCase[]
  /** Available strength per case, kN, and its symbol (φRn or Rn/Ω). */
  avail: number[]
  R: string
}

export function BlockShearIso({ bolts, W, H, t, dh, cases, avail, R }: BlockShearIsoProps) {
  const uid = useId().replace(/:/g, '')
  if (cases.length < 2 || bolts.length === 0) return null
  const k = avail[1] < avail[0] ? 1 : 0
  const which = k === 0 ? 'A' : 'B'
  const g = blockShearIso(bolts, W, H, t, dh, which)
  const bc = cases[k]
  const view = BLOCK_VIEW
  const SW = 380
  const plateF = extrudeFaces(g.plate.outline, 0, g.tDraw)
  const blockF = extrudeFaces(g.block.outline, 0, g.tDraw, g.block.shift)
  const fit = fitIso([...plateF, ...blockF].flatMap((f) => f.pts), 14, 34, 190, 270, view)
  const { p } = fit
  const P = (pts: readonly Vec3[]) => isoPath(pts.map(p))
  const shade = (f: Face) => f.key === 'front' ? STEEL.front : f.n[2] > 0.5 ? STEEL.top : STEEL.side
  const sides = (fs: Face[]) => sortFaces(fs.filter((f) => f.key !== 'front' && faceVisible(f.n, view)), view)
  const cap = (fs: Face[]) => fs.find((f) => f.key === 'front')!
  const ctr = (pts: readonly Vec3[]): Vec3 => pts.reduce<Vec3>((s, q) => [s[0] + q[0] / pts.length, s[1] + q[1] / pts.length, s[2] + q[2] / pts.length], [0, 0, 0])

  // A hole is a BORE through the plate, not a white disc on it. Each body
  // draws only the piece of each hole it keeps (`holePieces`) — a half on the
  // shear line, a quarter at the far bolt where the tension plane cuts too.
  // A whole hole: its front outline filled with the bore wall and the opening
  // seen through it left empty. A piece on a cut edge is a NOTCH: its bore,
  // swept through the thickness, shaded, and only the front arc edged — the
  // outline stays on the steel, never across the gap or the cut planes.
  const xL = g.shear.strips[0]?.[0][0] ?? W
  const hole = (pc: (typeof g.holePieces)[number], i: number) => {
    const shift = pc.body === 'block' ? g.block.shift : [0, 0, 0] as Vec3
    const N = 24, r = dh / 2, whole = pc.a1 - pc.a0 > 2 * Math.PI - 1e-9
    const arc = (y: number): Vec3[] => Array.from({ length: N + 1 }, (_, k) => {
      const a = pc.a0 + ((pc.a1 - pc.a0) * k) / N
      return [pc.c.x + r * Math.cos(a) + shift[0], y + shift[1], pc.c.y + r * Math.sin(a) + shift[2]]
    })
    const sector = (y: number): Vec3[] => whole ? arc(y) : [[pc.c.x + shift[0], y + shift[1], pc.c.y + shift[2]], ...arc(y)]
    if (!whole) {
      // a NOTCH in the cut edge. Its bore is the arc swept through the thickness, but only what
      // can be SEEN of it is shaded: through the front opening, and through the strip of a cut
      // face the hole took away, where that face is in view. The only line is the front arc —
      // the steel's own edge.
      const f = arc(0), b = arc(g.tDraw)
      const at = (a: number, y: number): Vec3 => [pc.c.x + r * Math.cos(a) + shift[0], y + shift[1], pc.c.y + r * Math.sin(a) + shift[2]]
      const ctr = (y: number): Vec3 => [pc.c.x + shift[0], y + shift[1], pc.c.y + shift[2]]
      // each straight edge lies on a cut face; its outward normal points away from the piece
      const cutFaces = ([[pc.a0, [Math.sin(pc.a0), -Math.cos(pc.a0)]], [pc.a1, [-Math.sin(pc.a1), Math.cos(pc.a1)]]] as const)
        .filter(([, n]) => faceVisible([n[0], 0, n[1]], view))
        .map(([a]) => [ctr(0), at(a, 0), at(a, g.tDraw), ctr(g.tDraw)])
      const id = `${uid}-n${i}`
      return <g key={id}>
        <clipPath id={id}>
          <path d={P(sector(0))} />
          {cutFaces.map((q, k) => <path key={k} d={P(q)} />)}
        </clipPath>
        {/* the notch is open: what is not bore wall is the space through it */}
        <path d={P(sector(0))} fill="var(--sheet, #fff)" stroke="none" />
        <g clipPath={`url(#${id})`}>
          {f.slice(0, -1).map((q, k) => (
            <path key={k} d={P([q, f[k + 1], b[k + 1], b[k]])} fill={BORE} stroke={BORE} strokeWidth={0.4} strokeLinejoin="round" />
          ))}
        </g>
        <path d={isoPath(f.map(p), false)} fill="none" stroke={INK} strokeWidth={0.7} />
      </g>
    }
    const id = `${uid}-h${i}`
    return <g key={id}>
      <clipPath id={id}><path d={P(sector(0))} /></clipPath>
      <path d={P(sector(0))} fill={BORE} stroke="none" />
      <path d={P(sector(g.tDraw))} fill="var(--sheet, #fff)" stroke="none" clipPath={`url(#${id})`} />
      <path d={isoPath(arc(0).map(p), true)} fill="none" stroke={INK} strokeWidth={0.6} />
    </g>
  }
  const plateHoles = g.holePieces.map((pc, i) => pc.body === 'plate' ? hole(pc, i) : null)
  const blockHoles = g.holePieces.map((pc, i) => pc.body === 'block' ? hole(pc, i) : null)
  const strips = (f: typeof g.shear, color: string) => f.strips.map((s, i) => (
    <path key={i} d={P(s)} fill={color} fillOpacity={0.45} stroke={color} strokeWidth={1.1} strokeLinejoin="round" />
  ))
  const body = (fs: Face[]) => <>
    {sides(fs).map((f) => <path key={f.key} d={P(f.pts)} fill={shade(f)} stroke={INK} strokeWidth={0.7} strokeLinejoin="round" />)}
  </>

  // leaders leave from the top of the shear plane and the far end of the tension plane, so neither crosses the block
  const sTop = g.shear.strips.reduce((a, b) => (b[2][2] > a[2][2] ? b : a))
  const tEnd = g.tension.strips[g.tension.strips.length - 1]
  const sAt = ((q) => [q[0], q[1] + 5] as const)(p(ctr([sTop[2], sTop[3]])))
  const tAt = p(ctr([tEnd[1], tEnd[2]]))
  const bMid = p(ctr(cap(blockF).pts))
  const LX = 232
  const yS = Math.max(48, sAt[1]), yT = Math.max(tAt[1] + 8, yS + 46)
  const label = (y: number, color: string, head: string, l1: string, l2: string, at: readonly [number, number]) => (
    <Leader x={at[0]} y={at[1]} tx={LX} ty={y} fontSize={8.5} color={color} weight={700} leading={1.41} text={[head, l1, l2]} />
  )
  const holesOut = bolts.filter((b) => Math.abs(b.x - xL) < 1e-6).length - 0.5
  const exag = g.tDraw / t
  const yText = Math.max(fit.box.y + fit.box.h, yS + 100) + 20
  const HT = yText + 30

  return (
    <DrawingFrame label="block shear isometric">
      <svg viewBox={`0 0 ${SW} ${HT}`} className="mx-auto block h-auto w-full" style={{ fontFamily: 'Arial, sans-serif' }}
        role="img" aria-label={`Isometric of block shear case ${which}: shear plane Anv ${fmt(bc.Anv)} mm², tension plane Ant ${fmt(bc.Ant)} mm²`}>
        <text x={14} y={16} fontSize={9} fontWeight={700} fill={INK}>ISOMETRIC — the block torn out, case {which} (governs)</text>

        {body(plateF)}
        <path d={P(cap(plateF).pts)} fill={STEEL.front} stroke={INK} strokeWidth={0.9} strokeLinejoin="round" />
        {plateHoles}
        {strips(g.shear, CRIT)}
        {which === 'B' && strips(g.tension, TENS)}
        {body(blockF)}
        {which === 'A' && strips(g.tension, TENS)}
        <path d={P(cap(blockF).pts)} fill={STEEL.front} stroke={INK} strokeWidth={0.9} strokeLinejoin="round" />
        {blockHoles}
        <text x={bMid[0]} y={bMid[1] + 3} fontSize={8} fill={INK} textAnchor="middle" {...halo}>torn block</text>

        {label(yS, CRIT, 'SHEAR PLANE', `Agv = ${t} × ${fmt(g.shear.gross)} = ${fmt(bc.Agv)} mm²`, `Anv = ${fmt(bc.Anv)} mm² (${holesOut} holes out)`, sAt)}
        {label(yT, TENS, 'TENSION PLANE', `Agt = ${t} × ${fmt(g.tension.gross)} = ${fmt(bc.Agt)} mm²`, `Ant = ${fmt(bc.Ant)} mm² (½ hole out)`, tAt)}

        <text x={SW / 2} y={yText} fontSize={8} fill={INK} textAnchor="middle">
          Rn = min(0.6Fu·Anv, 0.6Fy·Agv) + Ubs·Fu·Ant = {bc.Rn.toFixed(1)} kN · {R} = {avail[k].toFixed(1)} kN (§J4.3)
        </text>
        <text x={SW / 2} y={yText + 13} fontSize={8} fill={FAINT} textAnchor="middle">
          {exag > 1.05 ? `Thickness drawn ×${exag.toFixed(1)} so the planes read; areas use t = ${t} mm.` : `Drawn to scale, t = ${t} mm.`}
        </text>
      </svg>
    </DrawingFrame>
  )
}
