import type { JSX } from 'react'
import type { EdgeLoads, TributaryResult } from '../engine/tributary'
import { DimBelow, DimSide } from './dims'
import { sideLabelReach } from './dimLabel'
import { DrawingFrame } from './DrawingFrame'

const STROKE = '#37526e'
const FILL = '#eef3f8'
const TRIB = '#16a34a'
const LOAD = '#15803d'
const EDGE = '#0056b3'
const MUTED_LABEL = '#6b7280'

/** The edge's equivalent uniform line load, kN/m — Σ over its categories. */
const edgeW = (e: EdgeLoads | undefined): number =>
  (e?.loads ?? []).reduce((s, l) => s + (l.type === 'udl' ? l.w : 0), 0)

/** Plan of the slab panel with its tributary areas — the 45° trapezoids and
 *  triangles (two-way) or the two half-strips (one-way) — each washed and
 *  labelled with the uniform line load its edge beam is given. Drawn to one
 *  scale; the frame is fitted to the panel, not a fixed landscape box. */
export function PanelSketch({ r }: { r: TributaryResult }): JSX.Element {
  const twoWay = r.behaviour === 'two-way'
  const s = Math.min(300 / r.ly, 190 / r.lx)
  const w = r.ly * s, h = r.lx * s
  const lxLabel = `ℓx = ${r.lx.toFixed(2)} m`
  // left margin carries the ℓx dimension (26 out) and its label, plus "S1"
  const ML = 26 + sideLabelReach(0, h, lxLabel) + 6, MR = 26, MT = 30
  const inner = Math.max(w, 330 - ML - MR)
  const x0 = ML + (inner - w) / 2, y0 = MT
  const W = ML + inner + MR, H = y0 + h + 66
  const xm = x0 + w / 2, ym = y0 + h / 2, k = h / 2
  const by = (id: EdgeLoads['edge']) => r.edges.find((e) => e.edge === id)
  const wL = edgeW(by('L1')), wS = edgeW(by('S1'))
  const kNm = (v: number) => `w = ${v.toFixed(2)} kN/m`
  const pts = (p: [number, number][]) => p.map((q) => q.join(',')).join(' ')

  return (
    <DrawingFrame label="slab panel plan">
      <svg viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', height: 'auto', fontFamily: 'Arial, sans-serif' }}>
        <text x={x0} y={14} fontSize={11} fontWeight={700} fill={EDGE}>PANEL PLAN — {r.behaviour}</text>

        <rect x={x0} y={y0} width={w} height={h} fill={FILL} />
        {/* the tributary areas: the long edges' share lighter, the short edges' darker */}
        {twoWay ? (
          <g stroke="none" fill={TRIB}>
            <polygon points={pts([[x0, y0], [x0 + w, y0], [x0 + w - k, ym], [x0 + k, ym]])} fillOpacity={0.07} />
            <polygon points={pts([[x0, y0 + h], [x0 + w, y0 + h], [x0 + w - k, ym], [x0 + k, ym]])} fillOpacity={0.07} />
            <polygon points={pts([[x0, y0], [x0 + k, ym], [x0, y0 + h]])} fillOpacity={0.18} />
            <polygon points={pts([[x0 + w, y0], [x0 + w - k, ym], [x0 + w, y0 + h]])} fillOpacity={0.18} />
          </g>
        ) : (
          <g stroke="none" fill={TRIB}>
            <rect x={x0} y={y0} width={w} height={h / 2} fillOpacity={0.07} />
            <rect x={x0} y={ym} width={w} height={h / 2} fillOpacity={0.12} />
          </g>
        )}
        <rect x={x0} y={y0} width={w} height={h} fill="none" stroke={STROKE} strokeWidth={1.6} />

        {twoWay ? (
          <g stroke={TRIB} strokeWidth={1} strokeDasharray="5 3">
            <line x1={x0} y1={y0} x2={x0 + k} y2={ym} />
            <line x1={x0} y1={y0 + h} x2={x0 + k} y2={ym} />
            <line x1={x0 + w} y1={y0} x2={x0 + w - k} y2={ym} />
            <line x1={x0 + w} y1={y0 + h} x2={x0 + w - k} y2={ym} />
            <line x1={x0 + k} y1={ym} x2={x0 + w - k} y2={ym} />
          </g>
        ) : (
          <g stroke={TRIB} strokeWidth={1} strokeDasharray="5 3">
            <line x1={x0} y1={ym} x2={x0 + w} y2={ym} />
            {/* span arrows at sixths, the middle one left out for the load label */}
            {[1, 2, 4, 5].map((i) => {
              const x = x0 + (w * i) / 6
              return (
                <g key={i}>
                  <line x1={x} y1={y0 + 6} x2={x} y2={y0 + h - 6} strokeDasharray="2 3" strokeWidth={0.8} />
                  <path d={`M ${x - 3} ${y0 + 10} L ${x} ${y0 + 5} L ${x + 3} ${y0 + 10}`} fill="none" strokeDasharray="" />
                  <path d={`M ${x - 3} ${y0 + h - 10} L ${x} ${y0 + h - 5} L ${x + 3} ${y0 + h - 10}`} fill="none" strokeDasharray="" />
                </g>
              )
            })}
          </g>
        )}

        {/* what each edge beam is given — the load-conserving uniform load */}
        <g fontSize={8.5} fill={LOAD} textAnchor="middle">
          <text x={xm} y={y0 + h / 4 + 3}>{kNm(wL)}</text>
          <text x={xm} y={y0 + (3 * h) / 4 + 3}>{kNm(wL)}</text>
          {twoWay && [x0 + k / 3, x0 + w - k / 3].map((x) => (
            <text key={x} x={x} y={ym} transform={`rotate(-90 ${x} ${ym})`} dy={3}>{kNm(wS)}</text>
          ))}
        </g>

        {/* edge labels */}
        <text x={xm} y={y0 - 5} fontSize={9} fill={EDGE} textAnchor="middle" fontWeight={700}>L1 (long)</text>
        <text x={xm} y={y0 + h + 11} fontSize={9} fill={EDGE} textAnchor="middle" fontWeight={700}>L2 (long)</text>
        <text x={x0 - 6} y={ym + 3} fontSize={9} fill={EDGE} textAnchor="end" fontWeight={700}>S1</text>
        <text x={x0 + w + 6} y={ym + 3} fontSize={9} fill={EDGE} fontWeight={700}>S2</text>

        <DimBelow xA={x0} xB={x0 + w} featY={y0 + h} dY={y0 + h + 30} label={`ℓy = ${r.ly.toFixed(2)} m`} />
        <DimSide yA={y0} yB={y0 + h} featX={x0} dX={x0 - 26} label={lxLabel} side="left" />

        <text x={W / 2} y={y0 + h + 52} fontSize={7.5} fill={MUTED_LABEL} textAnchor="middle">
          {twoWay
            ? 'drawn to scale · 45° lines · each share replaced by the uniform load with the same total'
            : 'drawn to scale · ℓy/ℓx ≥ 2: the long edges carry q·ℓx/2 each, the short edges nothing'}
        </text>
      </svg>
    </DrawingFrame>
  )
}
