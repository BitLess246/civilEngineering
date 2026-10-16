// Whether a scrolling box has content past its left or right edge — read by
// `components/ScrollEdges` to draw the fades. Kept apart from the component so
// the component file exports components only (fast refresh).
import { useCallback, useEffect, useState, type RefObject } from 'react'

export interface Edges { left: boolean; right: boolean; touched: boolean }

/** Whether `ref`'s content runs past its left or right edge, kept current on
 *  scroll and resize. */
export function useScrollEdges(ref: RefObject<HTMLElement | null>): Edges {
  const [e, setE] = useState<Edges>({ left: false, right: false, touched: false })
  const read = useCallback(() => {
    const el = ref.current
    if (!el) return
    const left = el.scrollLeft > 2
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2
    setE((p) => (p.left === left && p.right === right && (p.touched || !left) ? p : { left, right, touched: p.touched || left }))
  }, [ref])
  useEffect(() => {
    const el = ref.current
    if (!el) return
    read()
    el.addEventListener('scroll', read, { passive: true })
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(read)
    ro?.observe(el)
    // the content can grow without the box resizing (a drawing re-renders)
    if (el.firstElementChild) ro?.observe(el.firstElementChild)
    return () => { el.removeEventListener('scroll', read); ro?.disconnect() }
  }, [ref, read])
  return e
}
