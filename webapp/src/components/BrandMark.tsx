import { useId } from 'react'
import { MARK_FACES, MARK_GRADIENTS, MARK_SHADOWS, WORDMARK } from '../lib/brandArt'
import { BRAND_NAME } from '../lib/brand'

// The Zeta mark and wordmark, drawn from the generated brand art so the header,
// the favicon and the files in branding/ are one geometry. The mark carries its
// own blues (it sits on both the paper and the rail grounds); the wordmark is
// currentColor, so it takes whatever ink token the surrounding text uses.

/** The folded-Z mark. `size` is the rendered height in px. Decorative unless
 *  `label` is given — beside the wordmark it adds nothing to the accessible name. */
export function ZetaMark({ size = 24, label, className }: { size?: number; label?: string; className?: string }) {
  const p = useId().replace(/:/g, '')
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}>
      <defs>
        {Object.entries(MARK_GRADIENTS).map(([k, g]) => {
          const [x1, y1, x2, y2] = g.v.split(' ')
          return (
            <linearGradient key={k} id={`${p}${k}`} x1={x1} y1={y1} x2={x2} y2={y2}>
              {g.stops.map(([o, c]) => <stop key={o} offset={o} stopColor={c} />)}
            </linearGradient>
          )
        })}
        {Object.entries(MARK_SHADOWS).map(([k, s]) => (
          <linearGradient key={k} id={`${p}${k}`} gradientUnits="userSpaceOnUse"
            x1={s.x[0]} y1={s.x[1]} x2={s.x[2]} y2={s.x[3]}>
            <stop offset="0" stopColor={s.color} stopOpacity={s.alpha} />
            <stop offset="1" stopColor={s.color} stopOpacity="0" />
          </linearGradient>
        ))}
      </defs>
      <polygon points={MARK_FACES.top} fill={`url(#${p}t)`} />
      <polygon points={MARK_FACES.shTop} fill={`url(#${p}s1)`} />
      <polygon points={MARK_FACES.diag} fill={`url(#${p}d)`} />
      <polygon points={MARK_FACES.shBot} fill={`url(#${p}s2)`} />
      <polygon points={MARK_FACES.bot} fill={`url(#${p}b)`} />
    </svg>
  )
}

/** Mark + ZETA wordmark. `height` is the mark's height; the word's cap height
 *  is 34/64 of it, as in the lockup files. Named "Zeta" for assistive tech. */
export function ZetaLogo({ height = 24, className }: { height?: number; className?: string }) {
  const capH = (height * WORDMARK.h) / 64
  return (
    <span role="img" aria-label={BRAND_NAME} className={`inline-flex items-center ${className ?? ''}`}
      style={{ gap: height * 0.19 }}>
      <ZetaMark size={height} />
      <svg viewBox={`0 0 ${WORDMARK.w} ${WORDMARK.h}`} height={capH} width={(capH * WORDMARK.w) / WORDMARK.h}
        aria-hidden="true" fill="currentColor"><path d={WORDMARK.d} /></svg>
    </span>
  )
}
