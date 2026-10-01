// What the assistant "sees" of a page that never published a snapshot.
//
// Only two calculators publish a hand-written `PageSnapshot`; the other sixty
// sent nothing, so "why is my footing failing?" reached the model with no
// footing in it. Every calculator already SHOWS its inputs and results, so the
// fallback is to read what is on screen: the heading, every labelled field
// with its current value (`innerText` never includes an input's value), and
// the visible text of the page, which is where the results and verdicts live.
//
// Only tool routes are read — never a profile, billing or sign-in page — and
// password, email and hidden fields are skipped wherever they appear.
// `readDomContext` is the thin DOM walk; `formatDomContext` is the pure part.

export interface DomField { label: string; value: string }
export interface DomContext { heading: string; fields: DomField[]; text: string }

/** Field types never read: secrets, identity, and anything not on screen. */
const SKIP_TYPES = new Set(['password', 'email', 'hidden', 'file', 'submit', 'button', 'reset', 'image'])

const squash = (s: string) => s.replace(/\s+/g, ' ').trim()

/**
 * Visible text, one line per line, blank runs and immediate repeats dropped —
 * a results table's header row repeated per group is noise, not context.
 */
export function cleanVisibleText(raw: string): string {
  const out: string[] = []
  for (const line of raw.split('\n')) {
    const t = squash(line)
    if (t && t !== out[out.length - 1]) out.push(t)
  }
  return out.join('\n')
}

/** One block the prompt quotes; fields first, so a cut keeps the inputs. */
export function formatDomContext(c: DomContext, maxChars: number): string {
  const lines = [`Page: ${c.heading || 'untitled'}`]
  if (c.fields.length) lines.push(`Fields: ${c.fields.map((f) => `${f.label}=${f.value}`).join('; ')}`)
  if (c.text) lines.push(`Visible text:\n${c.text}`)
  const text = lines.join('\n')
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text
}

/** Subtrees that are not page content: control internals, math source, drawings. */
const SKIP_TEXT = 'select, option, button, textarea, script, style, svg, canvas, [data-ai-ignore], [hidden], [aria-hidden="true"], .sr-only'

/**
 * Whether a text node is read. KaTeX renders every formula three times — the
 * visible HTML (aria-hidden), MathML, and the TeX source in an `annotation` —
 * so inside a formula only the TeX is read: `f'_c`, `P_u`, once.
 */
function readable(n: Node): boolean {
  const p = n.parentElement
  if (!p) return false
  if (p.closest('.katex')) return !!p.closest('annotation') && !p.closest('[data-ai-ignore], [hidden]')
  return !p.closest(SKIP_TEXT)
}
/** Displays that start a new line in the reading. */
const INLINE = new Set(['inline', 'inline-block', 'inline-flex', 'contents'])

/**
 * The text of `el` as a reader sees it: math once (see `readable`), a unit kept
 * apart from its label ("Width b mm", not "Width bmm"), option lists dropped.
 */
function readableText(el: Element): string {
  const parts: string[] = []
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    if (!readable(n)) continue
    parts.push(n.textContent ?? '')
  }
  return squash(parts.join(' '))
}

function fieldLabel(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): string {
  const label = el.labels?.[0]
  const byledby = el.getAttribute('aria-labelledby')?.split(/\s+/)
    .map((id) => el.ownerDocument.getElementById(id)).filter((x): x is HTMLElement => !!x).map(readableText).join(' ')
  return squash((label && readableText(label)) || el.getAttribute('aria-label') || byledby || el.getAttribute('title') || el.getAttribute('placeholder') || el.name || '')
}

function fieldValue(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): string | null {
  if (el instanceof HTMLSelectElement) return squash(el.selectedOptions[0]?.textContent ?? el.value)
  if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
    // a radio group is one fact: report the checked one only
    if (el.type === 'radio') return el.checked ? 'selected' : null
    return el.checked ? 'on' : 'off'
  }
  return squash(el.value)
}

/** Not on screen, or marked as not page content. */
const skipped = (el: Element) =>
  !!el.closest('[data-ai-ignore], [hidden], [aria-hidden="true"]') || (el as HTMLElement).offsetParent === null

/**
 * The page's visible text, one line per block, without the text inside a
 * `<label>` — every labelled field is already listed with its value, and the
 * labels were most of the page. What is left is headings, results, verdicts
 * and notes: what the page SAYS about the inputs.
 */
function visibleText(root: Element): string {
  const lines: string[] = []
  let cur = '', block: Element | null = null
  const blockOf = (el: Element): Element => {
    for (let e: Element | null = el; e && e !== root; e = e.parentElement)
      if (!INLINE.has(getComputedStyle(e).display)) return e
    return root
  }
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const p = n.parentElement
    if (!p || !readable(n) || p.closest('label') || ((p.closest('.katex') ?? p) as HTMLElement).offsetParent === null) continue
    const t = squash(n.textContent ?? '')
    if (!t) continue
    const b = blockOf(p)
    if (b !== block && cur) { lines.push(cur); cur = '' }
    block = b
    cur = cur ? `${cur} ${t}` : t
  }
  if (cur) lines.push(cur)
  return cleanVisibleText(lines.join('\n'))
}

/** Read the page inside `root` (the app's `<main>`). Browser only. */
export function readDomContext(root: Element): DomContext {
  const h = root.querySelector('h1') ?? root.querySelector('h2')
  const heading = h ? readableText(h) : ''
  const fields: DomField[] = []
  for (const el of root.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea')) {
    if (el instanceof HTMLInputElement && SKIP_TYPES.has(el.type)) continue
    if (el.autocomplete?.includes('email') || skipped(el)) continue
    const value = fieldValue(el)
    if (value === null || value === '') continue
    const label = fieldLabel(el)
    if (!label) continue
    fields.push({ label, value })
  }
  return { heading, fields, text: visibleText(root) }
}
