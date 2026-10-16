// ─────────────────────────────────────────────────────────────────────────
// MOTION — the two pieces of the app's animation that need React: a number
// that counts to its new value, and a block that rises in when it scrolls
// into view. The rest is CSS (`styles/motion.css`); the arithmetic is
// `lib/motion`. Both do nothing under reduced motion.
// ─────────────────────────────────────────────────────────────────────────
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { formatLike, motionOK, parseNumeric, tween } from '../lib/motion'

/**
 * `text`, counting to it from the last value shown (from zero on first
 * paint). Ends on `text` exactly; anything that is not a plain number is
 * shown as-is.
 *
 * The count writes the text node directly, in a LAYOUT effect: React renders
 * the final text, and before the browser paints it the node is wound back to
 * where the count starts — so the final figure never flashes ahead of its own
 * count, and no render happens per frame. React keeps the same text node for
 * a lone string child and only ever sets its value, so the two never fight.
 */
export function AnimatedNumber({ text, ms = 650 }: { text: string; ms?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const last = useRef<number | null>(null)
  useLayoutEffect(() => {
    const node = ref.current?.firstChild
    const spec = parseNumeric(text)
    if (!node) return
    if (!spec || !motionOK() || last.current === spec.value) {
      node.nodeValue = text
      if (spec) last.current = spec.value
      return
    }
    const from = last.current ?? 0, to = spec.value, t0 = performance.now()
    node.nodeValue = formatLike(from, spec)
    let raf = 0
    const step = (now: number) => {
      const t = (now - t0) / ms
      if (t >= 1) { node.nodeValue = text; last.current = to; return }
      const v = tween(from, to, t)
      last.current = v
      node.nodeValue = formatLike(v, spec)
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [text, ms])
  return <span ref={ref}>{text}</span>
}

/**
 * Its children rise into place the first time they scroll into view. Shown
 * at once without IntersectionObserver or under reduced motion, so nothing
 * is ever left hidden.
 */
export function Reveal({ children, className = '', as = 'div', delay = 0 }: {
  children: ReactNode; className?: string; as?: 'div' | 'section'; delay?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(() => !motionOK() || typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    const el = ref.current
    if (shown || !el) return
    const io = new IntersectionObserver(([e]) => {
      if (e?.isIntersecting) { setShown(true); io.disconnect() }
    }, { rootMargin: '0px 0px -8% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [shown])
  const props = {
    className: `reveal ${className}`, 'data-revealed': shown ? '' : undefined,
    style: delay ? { transitionDelay: `${delay}ms` } : undefined,
  }
  return as === 'section' ? <section ref={ref} {...props}>{children}</section> : <div ref={ref} {...props}>{children}</div>
}
