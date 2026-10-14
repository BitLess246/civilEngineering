// ─────────────────────────────────────────────────────────────────────────
// What a standalone calculator shows on screen → what its PDF can print.
//
// The export used to read a detail block with `textContent`, which drops every
// line break: a column of check cards came out as one run-on line
// ("…RESULT1.2D + 1.6L…Mmax79.2 kN·mVmax52.8 kN…"), and every <table> was
// flattened to "a | b | c" text. This walks the rendered DOM instead and keeps
// the structure the reader saw:
//   · a <table>           → a table (header row kept)
//   · check cards         → one table row each (title · basis · value · ratio · status)
//   · a CSS grid of cells → a table, one row per grid line
//   · a flex row          → one line, items separated by " · "
//   · any other block     → its own line
// SVG is skipped (charts are captured as figures), as are form controls and
// anything hidden or marked `data-pdf-skip`.
//
// Layout facts come from `styleOf`, so the walk is testable without a browser.
// ─────────────────────────────────────────────────────────────────────────

export interface CapturedTable { title?: string; head?: string[]; rows: string[][] }
export type DetailBlock = { kind: 'text'; text: string } | { kind: 'table'; table: CapturedTable }

/** The layout facts the walk needs about one element. */
export interface BoxStyle {
  display: string            // 'none' | 'inline' | 'block' | 'flex' | 'grid' | …
  gridColumns?: number       // track count of grid-template-columns
  flexRow?: boolean          // flex-direction is row / row-reverse
}
export type StyleOf = (el: Element) => BoxStyle

const SKIP_TAGS = new Set(['svg', 'script', 'style', 'input', 'select', 'textarea', 'noscript', 'template'])
const collapse = (s: string) => s.replace(/\s+/g, ' ').trim()

function hidden(el: Element, styleOf: StyleOf): boolean {
  return styleOf(el).display === 'none' || el.getAttribute('aria-hidden') === 'true' || el.hasAttribute('data-pdf-skip')
}

/** All visible text of a node on one line (cells, card fields, flex items). */
export function inlineText(node: Node, styleOf: StyleOf): string {
  if (node.nodeType === 3) return node.textContent ?? ''
  if (node.nodeType !== 1) return ''
  const el = node as Element
  if (SKIP_TAGS.has(el.tagName.toLowerCase()) || hidden(el, styleOf)) return ''
  const parts: string[] = []
  for (const c of Array.from(el.childNodes)) {
    const t = inlineText(c, styleOf)
    if (!t) continue
    // block children of one cell still need a gap between them
    const blockish = c.nodeType === 1 && styleOf(c as Element).display !== 'inline'
    parts.push(blockish ? ` ${t} ` : t)
  }
  return collapse(parts.join(''))
}

/** A <table> as head + rows, empty rows dropped. */
export function tableOf(table: Element, styleOf: StyleOf, title?: string): CapturedTable | null {
  const trs = Array.from(table.querySelectorAll('tr')).filter((tr) => !hidden(tr, styleOf))
  const cells = (tr: Element) => Array.from(tr.children).filter((c) => /^(td|th)$/i.test(c.tagName) && !hidden(c, styleOf))
  let head: string[] | undefined
  const rows: string[][] = []
  for (const tr of trs) {
    const cs = cells(tr)
    const vals = cs.map((c) => inlineText(c, styleOf))
    if (!vals.some(Boolean)) continue
    const isHead = tr.parentElement?.tagName.toLowerCase() === 'thead' || (cs.length > 0 && cs.every((c) => c.tagName.toLowerCase() === 'th'))
    if (isHead && !head && rows.length === 0) head = vals
    else rows.push(vals)
  }
  if (rows.length === 0 && !head) return null
  return { title, head, rows }
}

/** Check cards (`data-pdf-card`) → one row each. */
const CARD_HEAD = ['Check', 'Basis', 'Value', 'Utilization', 'Status', 'Details']
/** Details: the card's formula line, then its secondary label/value pairs. */
function cardRow(card: Element, styleOf: StyleOf): string[] {
  const a = (k: string) => card.getAttribute(`data-pdf-card-${k}`) ?? ''
  const note = card.querySelector('[data-pdf-card-note]')
  const details = [note ? inlineText(note, styleOf) : '', a('pairs')].filter(Boolean).join(' · ')
  return [a('title'), a('basis'), a('value'), a('ratio'), a('status'), details]
}
/** Drop a column no card filled — most cards carry no details. */
function cardTable(rows: string[][]): CapturedTable {
  const keep = CARD_HEAD.map((_, k) => k < 5 || rows.some((r) => r[k]))
  return { head: CARD_HEAD.filter((_, k) => keep[k]), rows: rows.map((r) => r.filter((_, k) => keep[k])) }
}

/**
 * Walk one rendered block into ordered text and table blocks.
 * `seen` collects the tables consumed here, so the caller can leave them out
 * of its page-wide table sweep.
 */
export function extractBlocks(root: Element, styleOf: StyleOf, seen?: Set<Element>): DetailBlock[] {
  const out: DetailBlock[] = []
  let lines: string[] = []
  let line = ''
  const breakLine = () => { const t = collapse(line); if (t) lines.push(t); line = '' }
  const flush = () => { breakLine(); if (lines.length) out.push({ kind: 'text', text: lines.join('\n') }); lines = [] }
  const pushTable = (t: CapturedTable | null) => { if (t && t.rows.length + (t.head ? 1 : 0) > 0) { flush(); out.push({ kind: 'table', table: t }) } }
  let cards: string[][] = []
  const flushCards = () => { if (cards.length) { pushTable(cardTable(cards)); cards = [] } }

  const walk = (node: Node) => {
    if (node.nodeType === 3) { line += node.textContent ?? ''; return }
    if (node.nodeType !== 1) return
    const el = node as Element
    const tag = el.tagName.toLowerCase()
    if (SKIP_TAGS.has(tag) || hidden(el, styleOf)) return
    if (el.hasAttribute('data-pdf-card')) { breakLine(); cards.push(cardRow(el, styleOf)); return }
    flushCards()
    if (tag === 'table') { seen?.add(el); pushTable(tableOf(el, styleOf, el.getAttribute('aria-label') ?? undefined)); return }
    if (tag === 'br') { breakLine(); return }
    const st = styleOf(el)
    const kids = Array.from(el.children).filter((c) => !hidden(c, styleOf) && !SKIP_TAGS.has(c.tagName.toLowerCase()))
    if (st.display.includes('grid') && (st.gridColumns ?? 1) >= 2 && kids.length >= 2 * (st.gridColumns ?? 1)) {
      const n = st.gridColumns!
      const vals = kids.map((k) => inlineText(k, styleOf))
      const rows: string[][] = []
      for (let i = 0; i < vals.length; i += n) rows.push(vals.slice(i, i + n))
      // a first line of words over lines that carry numbers reads as a header
      const numeric = (r: string[]) => r.some((v) => /\d/.test(v))
      const head = rows.length > 1 && !numeric(rows[0]) && rows.slice(1).some(numeric) ? rows.shift() : undefined
      pushTable({ head, rows })
      return
    }
    if (st.display.includes('flex') && st.flexRow && kids.length > 1 && kids.every((k) => !k.querySelector('table, [data-pdf-card]'))) {
      breakLine()
      line = kids.map((k) => inlineText(k, styleOf)).filter(Boolean).join(' · ')
      breakLine()
      return
    }
    const block = st.display !== 'inline' && st.display !== 'inline-block'
    if (block) breakLine()
    for (const c of Array.from(el.childNodes)) walk(c)
    if (block) breakLine()
  }
  walk(root)
  flushCards()
  flush()
  return out
}

/** The browser's own layout facts for an element. */
export const domStyleOf: StyleOf = (el) => {
  const cs = getComputedStyle(el)
  const tracks = cs.gridTemplateColumns && cs.gridTemplateColumns !== 'none' ? cs.gridTemplateColumns.trim().split(/\s+/).length : undefined
  return { display: cs.display, gridColumns: tracks, flexRow: cs.flexDirection === 'row' || cs.flexDirection === 'row-reverse' }
}
