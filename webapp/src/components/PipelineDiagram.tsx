// The six steps, as one inline SVG. View layer.
//
// This replaced an 87-second screen recording that weighed 5.6 MB. The caption
// under that video was doing the real work — it explained the SEQUENCE — and a
// reader takes a sequence in faster from a diagram than from watching someone
// click through it. So the caption became the picture.
//
// INLINE SVG, NOT AN IMAGE FILE. About 4 KB of markup, no network request, no
// layout shift while it loads, sharp at any zoom, and the labels are real text
// — so they are selectable, searchable, translatable, and readable by a screen
// reader. A PNG of this would be heavier and none of those things.
//
// It is decorative in the strict sense — the same six steps are listed in the
// prose beside it — so it carries `aria-hidden` and the accessible version is
// the list. Reading out twelve <text> nodes in visual order would be worse than
// silence.

const STEPS = [
  { k: 'grid', top: 'Geometry', bot: 'grid → frame' },
  { k: 'load', top: 'Loading', bot: 'D · L · E · W' },
  { k: 'anal', top: 'Analysis', bot: '3D FEM' },
  { k: 'dsgn', top: 'Design', bot: 'every member' },
  { k: 'schd', top: 'Schedules', bot: 'worked solutions' },
  { k: 'pdf', top: 'Report', bot: 'signed PDF' },
] as const

const W = 1160          // viewBox width — the boxes are laid out in these units
const BOX_W = 168
const BOX_H = 66
const GAP = (W - STEPS.length * BOX_W) / (STEPS.length - 1)

export function PipelineDiagram({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${W} 96`}
      className={`block w-full ${className}`}
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      {STEPS.map((s, i) => {
        const x = i * (BOX_W + GAP)
        const last = i === STEPS.length - 1
        return (
          <g key={s.k}>
            <rect
              x={x} y={14} width={BOX_W} height={BOX_H} rx={8}
              // The last box is the deliverable, so it is the filled one — the
              // eye should land on what you walk away with.
              fill={last ? '#0f4c92' : '#ffffff'}
              stroke={last ? '#0f4c92' : '#d6d3c9'}
              strokeWidth={1.5}
            />
            <text
              x={x + BOX_W / 2} y={41}
              textAnchor="middle"
              fontSize={15} fontWeight={700}
              fill={last ? '#ffffff' : '#0f1b2a'}
            >{s.top}</text>
            <text
              x={x + BOX_W / 2} y={60}
              textAnchor="middle"
              fontSize={12}
              fill={last ? '#c7d8ef' : '#7a7568'}
            >{s.bot}</text>

            {/* Connector, drawn from THIS box to the next one. Sitting in the
                gap rather than under the boxes means no overlap at any width. */}
            {!last && (
              <g stroke="#c9c5ba" strokeWidth={1.5} fill="none">
                <line x1={x + BOX_W + 6} y1={47} x2={x + BOX_W + GAP - 12} y2={47} />
                <path
                  d={`M ${x + BOX_W + GAP - 14} 42.5 L ${x + BOX_W + GAP - 6} 47 L ${x + BOX_W + GAP - 14} 51.5 Z`}
                  fill="#c9c5ba" stroke="none"
                />
              </g>
            )}
          </g>
        )
      })}
    </svg>
  )
}
