// ─────────────────────────────────────────────────────────────────────────
// THE ONE RENDERER for every hand-drawn mark in this app.
//
// There are two icon SETS — `toolGroupIcons` for the sidebar's eleven tool
// groups, `ribbonIcons` for Model Space's twelve tabs — and exactly one piece
// of code that turns either into an `<svg>`. That is the point: `ICON_STROKE`
// being a shared constant only guarantees one weight if one component reads
// it. Two renderers is how a set quietly stops being a set.
//
// `vectorEffect` holds the stroke at its nominal width however the box is
// scaled; without it a 15 px icon draws visibly lighter than a 22 px one and
// the family falls apart across the two places it appears.
// ─────────────────────────────────────────────────────────────────────────
import { ICON_VIEWBOX, ICON_STROKE, type GroupIcon } from '../lib/toolGroupIcons'

export function DrawnIcon({ icon, size = 16, className = 'flex-none' }: {
  /** Undefined renders a SPACER of the same size rather than nothing: a
   *  missing mark should cost the row its picture, not its alignment. The
   *  coverage guards are what make that case unreachable. */
  icon: GroupIcon | undefined
  size?: number
  className?: string
}) {
  if (!icon) return <span style={{ width: size, height: size }} aria-hidden="true" className={className} />
  return (
    <svg viewBox={ICON_VIEWBOX} width={size} height={size} aria-hidden="true"
      fill="none" stroke="currentColor" strokeWidth={ICON_STROKE}
      strokeLinecap="round" strokeLinejoin="round" className={className}>
      {icon.paths.map((d, i) => <path key={i} d={d} vectorEffect="non-scaling-stroke" />)}
      {(icon.dots ?? []).map((c, i) => (
        <circle key={`d${i}`} cx={c.cx} cy={c.cy} r={c.r} fill="currentColor" stroke="none" />
      ))}
    </svg>
  )
}
