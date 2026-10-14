import { describe, it, expect } from 'vitest'
import { extractBlocks, tableOf, type BoxStyle, type StyleOf } from './pdfCapture'

// A minimal element tree — enough DOM for the walk, with the layout supplied
// through `style` the way `domStyleOf` would read it from the browser.
interface FakeEl {
  nodeType: 1; tagName: string; childNodes: (FakeEl | FakeText)[]; children: FakeEl[]
  parentElement: FakeEl | null; attrs: Record<string, string>; style: BoxStyle
  getAttribute(k: string): string | null; hasAttribute(k: string): boolean
  querySelector(sel: string): FakeEl | null; querySelectorAll(sel: string): FakeEl[]
}
interface FakeText { nodeType: 3; textContent: string }
const txt = (s: string): FakeText => ({ nodeType: 3, textContent: s })
const INLINE = new Set(['span', 'b', 'strong', 'em', 'td', 'th', 'code'])
function h(tag: string, attrs: Record<string, string> = {}, ...kids: (FakeEl | string)[]): FakeEl {
  const style: BoxStyle = attrs.grid ? { display: 'grid', gridColumns: +attrs.grid } : attrs.flex ? { display: 'flex', flexRow: true }
    : attrs.hide ? { display: 'none' } : { display: INLINE.has(tag) ? 'inline' : 'block' }
  const el: FakeEl = {
    nodeType: 1, tagName: tag.toUpperCase(), childNodes: [], children: [], parentElement: null, attrs, style,
    getAttribute: (k) => (k in attrs ? attrs[k] : null), hasAttribute: (k) => k in attrs,
    querySelector: (sel) => all(el).find((e) => matches(e, sel)) ?? null,
    querySelectorAll: (sel) => all(el).filter((e) => matches(e, sel)),
  }
  for (const k of kids) {
    if (typeof k === 'string') el.childNodes.push(txt(k))
    else { k.parentElement = el; el.childNodes.push(k); el.children.push(k) }
  }
  return el
}
const all = (el: FakeEl): FakeEl[] => el.children.flatMap((c) => [c, ...all(c)])
const matches = (e: FakeEl, sel: string) => sel.split(',').map((s) => s.trim()).some((s) =>
  s.startsWith('[') ? e.hasAttribute(s.slice(1, -1)) : e.tagName.toLowerCase() === s)
const styleOf: StyleOf = (el) => (el as unknown as FakeEl).style
const blocks = (root: FakeEl) => extractBlocks(root as unknown as Element, styleOf)

describe('pdfCapture — what the PDF keeps of the rendered page', () => {
  it('keeps block line breaks that textContent drops', () => {
    const root = h('div', {}, h('h4', {}, 'Governing combination'), h('p', {}, 'largest ', h('b', {}, '|M|')), h('p', {}, '1.2D + 1.6L'))
    expect(blocks(root)).toEqual([{ kind: 'text', text: 'Governing combination\nlargest |M|\n1.2D + 1.6L' }])
  })

  it('turns check cards into one table row each, not run-on text', () => {
    const card = (t: string, v: string, r: string, s: string) =>
      h('section', { 'data-pdf-card': '', 'data-pdf-card-title': t, 'data-pdf-card-basis': '1.2D + 1.6L', 'data-pdf-card-value': v, 'data-pdf-card-ratio': r, 'data-pdf-card-status': s }, `${t}${v}${s}`)
    const out = blocks(h('div', {}, card('Mmax', '79.2 kN·m', '—', 'RESULT'), card('Deflection', '3.80 mm', '22.8%', 'PASS')))
    expect(out).toEqual([{ kind: 'table', table: { head: ['Check', 'Basis', 'Value', 'Utilization', 'Status'], rows: [
      ['Mmax', '1.2D + 1.6L', '79.2 kN·m', '—', 'RESULT'],
      ['Deflection', '1.2D + 1.6L', '3.80 mm', '22.8%', 'PASS'],
    ] } }])
  })

  it('carries a card\'s formula line and secondary values in a Details column', () => {
    const card = h('section', { 'data-pdf-card': '', 'data-pdf-card-title': 'Bearing', 'data-pdf-card-basis': 'Terzaghi', 'data-pdf-card-value': '2457.35 kPa',
      'data-pdf-card-ratio': '—', 'data-pdf-card-status': 'RESULT', 'data-pdf-card-pairs': 'Meyerhof (1963): 2359.08 kPa · Hansen (1970): 2378.16 kPa' },
      h('p', { 'data-pdf-card-note': '' }, 'q', h('sub', {}, 'ult'), ' over three methods'))
    const [b] = blocks(h('div', {}, card))
    expect(b).toEqual({ kind: 'table', table: { head: ['Check', 'Basis', 'Value', 'Utilization', 'Status', 'Details'], rows: [
      ['Bearing', 'Terzaghi', '2457.35 kPa', '—', 'RESULT', 'q ult over three methods · Meyerhof (1963): 2359.08 kPa · Hansen (1970): 2378.16 kPa'],
    ] } })
  })

  it('reads a CSS grid of cells as a table with its header line', () => {
    const cells = ['Combination', 'Vmax', 'Mmax', '1.4D', '33.6', '50.4', '1.2D + 1.6L', '52.8', '79.2'].map((c) => h('div', {}, c))
    const out = blocks(h('div', { grid: '3' }, ...cells))
    expect(out).toEqual([{ kind: 'table', table: { head: ['Combination', 'Vmax', 'Mmax'], rows: [['1.4D', '33.6', '50.4'], ['1.2D + 1.6L', '52.8', '79.2']] } }])
  })

  it('keeps a real <table> as a table, header row separate, and skips hidden rows', () => {
    const t = h('table', { 'aria-label': 'Reactions' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Support'), h('th', {}, 'R (kN)'))),
      h('tbody', {}, h('tr', {}, h('td', {}, 'A'), h('td', {}, '52.8')), h('tr', { hide: '1' }, h('td', {}, 'x'), h('td', {}, 'y'))))
    expect(tableOf(t as unknown as Element, styleOf, 'Reactions')).toEqual({ title: 'Reactions', head: ['Support', 'R (kN)'], rows: [['A', '52.8']] })
  })

  it('joins a flex row on one line, and skips SVG, controls and data-pdf-skip', () => {
    const out = blocks(h('div', {},
      h('div', { flex: '1' }, h('span', {}, 'Reaction A'), h('span', {}, '52.8 kN')),
      h('svg', {}, 'SHEAR — 52.6 kN·m'), h('input', {}, 'x'), h('div', { 'data-pdf-skip': '' }, 'duplicate'),
      h('p', {}, 'kept')))
    expect(out).toEqual([{ kind: 'text', text: 'Reaction A · 52.8 kN\nkept' }])
  })

  it('leaves out screen-only help marked no-print, as printing does', () => {
    const out = blocks(h('div', {}, h('p', {}, '★ governing (largest |M|).', h('span', { class: 'no-print' }, ' Click a row to view its reactions.')),
      h('div', { class: 'no-print pointer-events-none' }, 'drag to orbit · scroll to zoom')))
    expect(out).toEqual([{ kind: 'text', text: '★ governing (largest |M|).' }])
  })

  it('keeps text and tables in page order', () => {
    const out = blocks(h('div', {}, h('p', {}, 'Before'), h('table', {}, h('tr', {}, h('td', {}, '1'))), h('p', {}, 'After')))
    expect(out.map((b) => b.kind)).toEqual(['text', 'table', 'text'])
  })
})
