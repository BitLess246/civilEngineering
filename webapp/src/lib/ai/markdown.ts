// Markdown → a typed block/inline tree for the calculation helper's replies.
//
// The free models answer in markdown with LaTeX — `**bold**`, `### headings`,
// bullet and numbered lists, pipe tables, `\( … \)` / `$$ … $$` math — and the
// widget printed it verbatim, asterisks and backslashes included. This parses
// the subset those replies use into a tree that `<AssistantMarkdown>` renders
// as React elements. Nothing here produces HTML: the model's text only ever
// reaches the page as text nodes, or as TeX handed to KaTeX (which escapes it,
// `trust` off). Pure and DOM-free, so it is unit-tested directly.

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'strong' | 'em'; c: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'math'; v: string }
  | { t: 'link'; href: string; c: Inline[] }
  | { t: 'br' }

export type Block =
  | { t: 'heading'; level: number; c: Inline[] }
  | { t: 'para'; c: Inline[] }
  | ListBlock
  | { t: 'code'; v: string }
  | { t: 'math'; v: string }
  | { t: 'table'; head: Inline[][]; rows: Inline[][][] }
  | { t: 'hr' }

/** A list; an item's `sub` is the list nested under it (any kind). */
export interface ListBlock { t: 'list'; ordered: boolean; start: number; items: { c: Inline[]; sub?: ListBlock }[] }

// ── inline ────────────────────────────────────────────────────────────────
/**
 * One inline construct at the start of `s`, or null. Order matters: code
 * first (nothing parses inside it), then math, then emphasis and links.
 * `$…$` needs a non-space just inside both dollars and no digit right after
 * the closing one, so "₱1,200 and $5 off" stays text.
 */
function matchInline(s: string): { node: Inline; len: number } | null {
  let m: RegExpMatchArray | null
  if ((m = s.match(/^`([^`\n]+)`/))) return { node: { t: 'code', v: m[1] }, len: m[0].length }
  if ((m = s.match(/^\$\$([^$]+?)\$\$/))) return { node: { t: 'math', v: m[1].trim() }, len: m[0].length }
  if ((m = s.match(/^\\\((.+?)\\\)/))) return { node: { t: 'math', v: m[1].trim() }, len: m[0].length }
  if ((m = s.match(/^\$(?=\S)([^$\n]+?)(?<=\S)\$(?!\d)/))) return { node: { t: 'math', v: m[1] }, len: m[0].length }
  if ((m = s.match(/^\*\*(?=\S)([\s\S]+?)(?<=\S)\*\*/)) || (m = s.match(/^__(?=\S)([\s\S]+?)(?<=\S)__(?!\w)/)))
    return { node: { t: 'strong', c: parseInline(m[1]) }, len: m[0].length }
  if ((m = s.match(/^\*(?=[^\s*])([^*\n]+?)(?<=\S)\*/)) || (m = s.match(/^_(?=\S)([^_\n]+?)(?<=\S)_(?!\w)/)))
    return { node: { t: 'em', c: parseInline(m[1]) }, len: m[0].length }
  if ((m = s.match(/^\[([^\]\n]+)\]\(([^)\s]+)\)/))) {
    // only web links survive as links; anything else (javascript:, data:, a
    // bare path) keeps its label as plain text
    const ok = /^https?:\/\//i.test(m[2])
    return { node: ok ? { t: 'link', href: m[2], c: parseInline(m[1]) } : { t: 'text', v: m[1] }, len: m[0].length }
  }
  return null
}

export function parseInline(src: string): Inline[] {
  const out: Inline[] = []
  let buf = ''
  const flush = () => { if (buf) { out.push({ t: 'text', v: buf }); buf = '' } }
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (ch === '\n') { flush(); out.push({ t: 'br' }); i++; continue }
    // `_` opens emphasis only at a word start, so snake_case and x_1 stay text
    const canOpen = '`$\\*[_'.includes(ch) && !(ch === '_' && i > 0 && /\w/.test(src[i - 1]))
    const hit = canOpen ? matchInline(src.slice(i)) : null
    if (hit) { flush(); out.push(hit.node); i += hit.len; continue }
    // a backslash escaping punctuation (\*, \_, \$) prints the punctuation
    if (ch === '\\' && i + 1 < src.length && /[\\`*_[\]#$|-]/.test(src[i + 1])) { buf += src[i + 1]; i += 2; continue }
    buf += ch; i++
  }
  flush()
  return out
}

// ── blocks ────────────────────────────────────────────────────────────────
const LIST_RE = /^(\s*)([-*+•]|(\d+)[.)])\s+(.*)$/
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/
const cells = (line: string): string[] => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())

interface RawItem { indent: number; ordered: boolean; num: number; text: string }

/** Items from `at.i` at the indent of the first one; deeper items nest under the item before them. */
function nestList(raw: RawItem[], at: { i: number }): ListBlock {
  const first = raw[at.i]
  const list: ListBlock = { t: 'list', ordered: first.ordered, start: first.num, items: [] }
  while (at.i < raw.length && raw[at.i].indent >= first.indent) {
    const it = raw[at.i]
    if (it.indent > first.indent && list.items.length) {
      const last = list.items[list.items.length - 1]
      const sub = nestList(raw, at)
      // a second run of sub-items under the same parent joins the first
      if (last.sub) last.sub.items.push(...sub.items)
      else last.sub = sub
      continue
    }
    list.items.push({ c: parseInline(it.text) })
    at.i++
  }
  return list
}

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n')
  const out: Block[] = []
  let para: string[] = []
  const flushPara = () => {
    if (para.length) out.push({ t: 'para', c: parseInline(para.join('\n').trim()) })
    para = []
  }
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()
    if (!trimmed) { flushPara(); i++; continue }

    // fenced code
    if (/^```/.test(trimmed)) {
      flushPara()
      const body: string[] = []
      i++
      while (i < lines.length && !/^```/.test(lines[i].trim())) body.push(lines[i++])
      i++
      out.push({ t: 'code', v: body.join('\n') })
      continue
    }
    // display math: $$ … $$ or \[ … \], on one line or spanning several
    const open = trimmed.startsWith('$$') ? '$$' : trimmed.startsWith('\\[') ? '\\[' : null
    if (open) {
      const close = open === '$$' ? '$$' : '\\]'
      const rest = trimmed.slice(2)
      const end = rest.indexOf(close)
      if (end >= 0 && !rest.slice(end + 2).trim()) {
        flushPara(); out.push({ t: 'math', v: rest.slice(0, end).trim() }); i++; continue
      }
      if (end < 0) {
        const body = [rest]
        let j = i + 1
        while (j < lines.length && !lines[j].includes(close)) body.push(lines[j++])
        if (j < lines.length) {
          flushPara()
          const last = lines[j]
          body.push(last.slice(0, last.indexOf(close)))
          out.push({ t: 'math', v: body.join('\n').trim() })
          i = j + 1
          continue
        }
      }
    }
    // heading
    const m = trimmed.match(/^(#{1,6})\s+(.*?)\s*#*$/)
    if (m) { flushPara(); out.push({ t: 'heading', level: m[1].length, c: parseInline(m[2]) }); i++; continue }
    // rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) { flushPara(); out.push({ t: 'hr' }); i++; continue }
    // pipe table: a header row, then a separator row
    if (trimmed.includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
      flushPara()
      const head = cells(line).map(parseInline)
      const rows: Inline[][][] = []
      i += 2
      while (i < lines.length && lines[i].trim().includes('|')) rows.push(cells(lines[i++]).map(parseInline))
      out.push({ t: 'table', head, rows })
      continue
    }
    // list: consecutive items (any indent); an indented plain line continues
    // the item above. Indentation nests — a bullet under a numbered step is
    // that step's sub-list, not the next number.
    if (LIST_RE.test(line)) {
      flushPara()
      const raw: RawItem[] = []
      while (i < lines.length) {
        const lm = lines[i].match(LIST_RE)
        if (lm && (raw.length === 0 || lm[1].length > 0 || (lm[3] !== undefined) === raw[0].ordered)) {
          raw.push({ indent: lm[1].replace(/\t/g, '    ').length, ordered: lm[3] !== undefined, num: lm[3] !== undefined ? Number(lm[3]) : 1, text: lm[4] })
          i++
        } else if (!lm && lines[i].trim() && /^\s{2,}/.test(lines[i]) && raw.length) {
          raw[raw.length - 1].text += '\n' + lines[i].trim()
          i++
        } else break
      }
      out.push(nestList(raw, { i: 0 }))
      continue
    }
    para.push(line)
    i++
  }
  flushPara()
  return out
}
