// ─────────────────────────────────────────────────────────────────────────
// Live schematics for the engineering-economy calculators: cash-flow
// diagrams in the textbook convention (receipts up, disbursements down on a
// time line), the book-value staircase and the break-even chart. Amounts are
// to scale within each drawing. Ink is `currentColor`, so they theme.
// ─────────────────────────────────────────────────────────────────────────
import type { ReactNode } from 'react'
import { DrawingFrame } from './DrawingFrame'
import { amount } from '../lib/money'

const W = 640, H = 300
const ink = { stroke: 'currentColor', fill: 'none' } as const
const T = ({ x, y, children, anchor = 'start', size = 11, bold = false, op = 1 }: {
  x: number; y: number; children: ReactNode; anchor?: 'start' | 'middle' | 'end'; size?: number; bold?: boolean; op?: number
}) => <text x={x} y={y} textAnchor={anchor} fontSize={size} fontWeight={bold ? 700 : 400} fill="currentColor" opacity={op}>{children}</text>

function Sheet({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div data-pdf-drawing className="mx-auto max-w-[680px]">
      <DrawingFrame label={label}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={label}>
          <title>{label}</title>
          <defs>
            <marker id="es-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
            </marker>
          </defs>
          {children}
        </svg>
      </DrawingFrame>
    </div>
  )
}

const Arrow = ({ x, y0, y1, w = 2, dash, op = 1 }: { x: number; y0: number; y1: number; w?: number; dash?: string; op?: number }) =>
  Math.abs(y1 - y0) < 1 ? null
    : <line x1={x} y1={y0} x2={x} y2={y1} {...ink} strokeWidth={w} strokeDasharray={dash} opacity={op} markerEnd="url(#es-arrow)" />

/** Label every k-th period so a long horizon stays legible. */
const tickStep = (n: number) => (n <= 12 ? 1 : n <= 30 ? 5 : 10)

/** A uniform series A over n periods with its two equivalents, P at t = 0 and
 *  F at t = n, all three drawn to one scale. */
export function EquivalenceSketch({ n, A, P, F }: { n: number; A: number; P: number; F: number }) {
  const x0 = 90, x1 = 560, base = 240
  const X = (t: number) => x0 + ((x1 - x0) * t) / Math.max(n, 1)
  const top = Math.max(Math.abs(P), Math.abs(F), Math.abs(A), 1e-9)
  const len = (v: number) => Math.max(6, (Math.abs(v) / top) * 190)
  const k = tickStep(n)
  return (
    <Sheet label="Uniform series and its equivalents">
      <line x1={x0 - 30} y1={base} x2={x1 + 50} y2={base} {...ink} strokeWidth="1.3" />
      {Array.from({ length: n + 1 }, (_, t) => (
        <g key={t}>
          <line x1={X(t)} y1={base - 3} x2={X(t)} y2={base + 3} {...ink} strokeWidth="1" />
          {(t % k === 0 || t === n) && <T x={X(t)} y={base + 17} anchor="middle" size={10} op={0.7}>{t}</T>}
          {t > 0 && <Arrow x={X(t)} y0={base} y1={base - len(A)} w={n > 30 ? 1 : 1.8} />}
        </g>
      ))}
      <Arrow x={X(0) - 22} y0={base} y1={base - len(P)} w={2.4} dash="6 4" />
      <T x={X(0) - 28} y={base - len(P) - 8} anchor="start" bold>P = {amount(P)}</T>
      <Arrow x={X(n) + 26} y0={base} y1={base - len(F)} w={2.4} dash="6 4" />
      <T x={X(n) + 30} y={base - len(F) - 8} anchor="end" bold>F = {amount(F)}</T>
      <T x={(X(0) + X(n)) / 2} y={base - len(A) - 8} anchor="middle">A = {amount(A)} each period</T>
      <T x={x1 + 50} y={base + 32} anchor="end" size={10} op={0.7}>period</T>
    </Sheet>
  )
}

/** The cash-flow series as arrows, with the cumulative present worth at the
 *  hurdle rate traced over it: where that line crosses zero is the
 *  discounted payback, and where it ends is the NPV. */
export function CashFlowSketch({ cfs, rate }: { cfs: number[]; rate: number }) {
  const x0 = 80, x1 = 590, mid = 150
  const n = Math.max(cfs.length - 1, 1)
  const X = (t: number) => x0 + ((x1 - x0) * t) / n
  const cum: number[] = []
  cfs.reduce((s, c, t) => { const v = s + c / Math.pow(1 + rate, t); cum.push(v); return v }, 0)
  const top = Math.max(1e-9, ...cfs.map(Math.abs), ...cum.map(Math.abs))
  const Y = (v: number) => mid - (v / top) * 110
  const k = tickStep(n)
  return (
    <Sheet label="Cash-flow diagram">
      <line x1={x0 - 30} y1={mid} x2={x1 + 30} y2={mid} {...ink} strokeWidth="1.3" />
      {cfs.map((c, t) => (
        <g key={t}>
          <Arrow x={X(t)} y0={mid} y1={Y(c)} w={cfs.length > 30 ? 1 : 2} />
          {(t % k === 0 || t === cfs.length - 1) && <T x={X(t) + 6} y={mid + (c >= 0 ? 14 : -6)} size={10} op={0.7}>{t}</T>}
          {cfs.length <= 12 && c !== 0 && <T x={X(t)} y={c >= 0 ? Y(c) - 7 : Y(c) + 15} anchor="middle" size={10}>{amount(c)}</T>}
        </g>
      ))}
      <polyline points={cum.map((v, t) => `${X(t)},${Y(v)}`).join(' ')} {...ink} strokeWidth="1.6" strokeDasharray="5 4" opacity="0.75" />
      {cum.map((v, t) => <circle key={t} cx={X(t)} cy={Y(v)} r="2.6" fill="currentColor" opacity="0.75" />)}
      <T x={x1 + 30} y={24} anchor="end" size={11} bold>NPV = {amount(cum[cum.length - 1])}</T>
      <T x={x0 - 30} y={24} size={10} op={0.7}>arrows: cash flow · dashed: cumulative present worth</T>
    </Sheet>
  )
}

/** Book value at the end of each year as a staircase of bars, the year's
 *  charge shaded on top of each, salvage as a dashed floor. */
export function BookValueSketch({ cost, salvage, book }: { cost: number; salvage: number; book: number[] }) {
  const x0 = 90, x1 = 600, base = 255
  const life = book.length
  const slot = (x1 - x0) / (life + 1)
  const bw = Math.min(66, slot * 0.74)
  const Y = (v: number) => base - (v / Math.max(cost, 1e-9)) * 205
  const X = (y: number) => x0 + slot * (y + 0.5)
  const values = [cost, ...book]
  const label = life <= 15
  return (
    <Sheet label="Book value by year">
      <line x1={x0 - 10} y1={base} x2={x1} y2={base} {...ink} strokeWidth="1.3" />
      <line x1={x0 - 10} y1={Y(salvage)} x2={x1} y2={Y(salvage)} {...ink} strokeWidth="1.2" strokeDasharray="6 4" opacity="0.7" />
      <T x={x0 - 14} y={Y(salvage) + 4} anchor="end" size={10}>salvage</T>
      {values.map((v, y) => (
        <g key={y}>
          <rect x={X(y) - bw / 2} y={Y(v)} width={bw} height={base - Y(v)} fill="currentColor" opacity="0.18" />
          <rect x={X(y) - bw / 2} y={Y(v)} width={bw} height={base - Y(v)} {...ink} strokeWidth="1" />
          {y > 0 && <rect x={X(y) - bw / 2} y={Y(values[y - 1])} width={bw} height={Y(v) - Y(values[y - 1])} fill="currentColor" opacity="0.45" />}
          {(label || y % 5 === 0) && <T x={X(y)} y={base + 15} anchor="middle" size={10} op={0.7}>{y}</T>}
          {label && (
            <text x={X(y)} y={base - Y(v) > 22 ? Y(v) + 13 : Y(y > 0 ? values[y - 1] : v) - 5} textAnchor="middle" fontSize={life > 8 ? 8.5 : 9.5}
              fill="currentColor" paintOrder="stroke" stroke="var(--sheet)" strokeWidth={3}>{amount(v)}</text>
          )}
        </g>
      ))}
      <T x={x1} y={24} anchor="end" size={10} op={0.7}>bar = book value at year end · dark cap = that year&apos;s charge</T>
      <T x={x1} y={base + 30} anchor="end" size={10} op={0.7}>year</T>
    </Sheet>
  )
}

/** Revenue and total cost against volume; they cross at the break-even
 *  quantity, with loss to the left of it and profit to the right. */
export function BreakEvenSketch({ fixed, price, variable, qBE }: { fixed: number; price: number; variable: number; qBE: number }) {
  const x0 = 90, x1 = 600, base = 260
  const qMax = Number.isFinite(qBE) && qBE > 0 ? qBE * 2 : Math.max(1, fixed / Math.max(price, 1e-9))
  const yMax = Math.max(price * qMax, fixed + variable * qMax, 1e-9)
  const X = (q: number) => x0 + ((x1 - x0) * q) / qMax
  const Y = (v: number) => base - (v / yMax) * 220
  const ok = Number.isFinite(qBE)
  return (
    <Sheet label="Break-even chart">
      <line x1={x0} y1={base} x2={x1 + 10} y2={base} {...ink} strokeWidth="1.3" />
      <line x1={x0} y1={base} x2={x0} y2={28} {...ink} strokeWidth="1.3" />
      <line x1={X(0)} y1={Y(fixed)} x2={X(qMax)} y2={Y(fixed)} {...ink} strokeWidth="1.2" strokeDasharray="6 4" opacity="0.7" />
      <T x={X(qMax)} y={Y(fixed) + 14} anchor="end" size={10}>fixed {amount(fixed)}</T>
      <line x1={X(0)} y1={Y(fixed)} x2={X(qMax)} y2={Y(fixed + variable * qMax)} {...ink} strokeWidth="2" />
      <T x={X(qMax) - 4} y={Y(fixed + variable * qMax) - 8} anchor="end" size={10.5} bold>total cost</T>
      <line x1={X(0)} y1={Y(0)} x2={X(qMax)} y2={Y(price * qMax)} {...ink} strokeWidth="2.6" />
      <T x={X(qMax) - 4} y={Y(price * qMax) - 8} anchor="end" size={10.5} bold>revenue</T>
      {ok && <>
        <line x1={X(qBE)} y1={Y(price * qBE)} x2={X(qBE)} y2={base} {...ink} strokeWidth="1" strokeDasharray="3 3" />
        <circle cx={X(qBE)} cy={Y(price * qBE)} r="4.5" fill="currentColor" />
        <T x={X(qBE)} y={base + 16} anchor="middle" size={10.5} bold>Q = {amount(qBE)}</T>
        <T x={X(qBE * 0.45)} y={(Y(price * qBE * 0.45) + Y(fixed + variable * qBE * 0.45)) / 2 + 4} anchor="middle" size={10.5} op={0.75}>loss</T>
        <T x={X(qBE * 1.7)} y={(Y(price * qBE * 1.7) + Y(fixed + variable * qBE * 1.7)) / 2 + 4} anchor="middle" size={10.5} op={0.75}>profit</T>
      </>}
      <T x={x1 + 10} y={base + 30} anchor="end" size={10} op={0.7}>units</T>
      <T x={x0 + 6} y={38} size={10} op={0.7}>amount</T>
    </Sheet>
  )
}
