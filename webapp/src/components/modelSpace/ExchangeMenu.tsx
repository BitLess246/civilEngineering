// ─────────────────────────────────────────────────────────────────────────
// THE EXCHANGE MENU — the model in and out of other analysis programs.
//
// ONE ribbon command with a menu, not a button per format. The File block sits
// at the end of a ribbon that already overflows a 1500 px screen; two more
// 76 px buttons pushed Import off it, and every further format (ETABS, SAP2000)
// would push another. A menu grows downward instead.
//
// PORTALLED TO <body>, fixed at a position measured at open. The ribbon is an
// `overflow-x-auto` strip, and an overflow container clips both axes — a menu
// placed inside it is cut off at the ribbon's bottom edge, and focusing an item
// inside it scrolls the strip, which moves the button out from under the menu.
// ─────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ActionBtn } from './panelKit'

export interface ExchangeItem {
  label: string
  /** What happens, in the words the item cannot fit. */
  hint: string
  disabled?: boolean
  onSelect: () => void
}

export function ExchangeMenu({ items }: { items: ExchangeItem[] }) {
  const [at, setAt] = useState<{ left: number; top: number } | null>(null)
  const wrap = useRef<HTMLSpanElement>(null)
  const menu = useRef<HTMLDivElement>(null)

  /** Right-aligned under the button, kept on screen. */
  const place = () => {
    const r = wrap.current?.getBoundingClientRect()
    if (!r) return null
    const w = 280
    return { left: Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)), top: r.bottom + 4 }
  }

  const open = at !== null
  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !wrap.current?.contains(e.target as Node) && !menu.current?.contains(e.target as Node)) setAt(null)
    }
    // The menu FOLLOWS the button: a resize, or the ribbon strip scrolling
    // (which a click on a half-visible button does by itself, a frame after
    // the click), re-measures it rather than closing it under the pointer.
    const follow = () => { const p = place(); if (p) setAt((q) => (q && q.left === p.left && q.top === p.top ? q : p)) }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    window.addEventListener('resize', follow)
    window.addEventListener('scroll', follow, true)
    menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true })
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
      window.removeEventListener('resize', follow)
      window.removeEventListener('scroll', follow, true)
    }
  }, [open])   // bind once per open, not on every move

  const toggle = () => setAt((q) => (q ? null : place()))

  return (
    <span ref={wrap} className="inline-flex">
      <ActionBtn label="Exchange" icon="exchange" onClick={toggle}
        title="Export the model to, or import one from, another analysis program" />
      {at && createPortal(
        <div ref={menu} role="menu" aria-label="Exchange model"
          className="fixed z-50 w-[280px] rounded-lg border border-hairline bg-sheet p-1 shadow-lg"
          style={{ left: at.left, top: at.top }}>
          {items.map((it) => (
            <button key={it.label} type="button" role="menuitem" disabled={it.disabled}
              onClick={() => { setAt(null); it.onSelect() }}
              className="flex w-full flex-col items-start rounded-md px-3 py-2 text-left hover:bg-brand-tint focus-visible:bg-brand-tint focus-visible:outline-none disabled:opacity-40 disabled:hover:bg-transparent">
              <span className="text-[12.5px] font-semibold text-ink">{it.label}</span>
              <span className="text-[11px] leading-4 text-muted">{it.hint}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </span>
  )
}
