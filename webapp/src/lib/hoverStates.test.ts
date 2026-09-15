import { describe, it, expect } from 'vitest'
// Vite's glob rather than `node:fs` — the app project carries no @types/node,
// the same reason pipelineComposition.test.ts reaches for `?raw`.
const SOURCES = import.meta.glob('../**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

/**
 * A hover state that resolves to its own rest state is not feedback.
 *
 * This shipped as a regression from the token migration (#755): `#135caf` and
 * `#004a99` are brand-family blues that were used as HOVER shades, and the
 * migration's hover rule only named `#0f4c92` and the `#0d3f78` family — so
 * those two fell through to the generic `brand` mapping and eleven buttons
 * stopped responding to the pointer. The visual result is subtle enough that
 * no screenshot review caught it; the pairing is mechanical enough that a test
 * can.
 *
 * Reads source rather than rendering, because the defect is a class-name pair
 * and the repo has no DOM harness.
 */

/**
 * ONE element's classes per chunk, and never two classes that cannot apply at
 * the same time.
 *
 * The first cut split on every quote in the file and kept the odd spans. That
 * works until a string literal appears inside a JSX expression —
 * `style={embed ? { pointerEvents: 'none' } : undefined}` — whose lone quote
 * pair opens a span that runs on for sixty lines and swallows a dozen
 * elements. It then reported the header badge's `text-brand` as the dead hover
 * of the hamburger's `hover:text-brand`, two elements 17 lines apart.
 *
 * So anchor on `className=` and model what a class expression actually
 * produces. `${cond ? 'bg-sheet text-brand' : 'text-slate-600 hover:text-brand'}`
 * is a SELECTED tab that is brand-coloured and an UNSELECTED one that hovers
 * to brand — correct, and a dead pair only if you pretend both branches paint
 * the same element at once. Each branch therefore gets its own chunk, carrying
 * the template's unconditional classes with it.
 *
 * Known blind spot, stated rather than discovered later: a rest in one
 * interpolation paired with a hover in a DIFFERENT interpolation of the same
 * element is not reported, because the branches are expanded independently
 * rather than as a cross product.
 */
interface Lit { static: string; branches: string[] }

/** Split a template body into its unconditional text and its `${…}` bodies. */
function splitTemplate(body: string): { fixed: string; exprs: string[] } {
  let fixed = ''
  const exprs: string[] = []
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '$' && body[i + 1] === '{') {
      let depth = 0, j = i + 1
      for (; j < body.length; j++) {
        if (body[j] === '{') depth++
        else if (body[j] === '}' && --depth === 0) break
      }
      exprs.push(body.slice(i + 2, j)); i = j
    } else fixed += body[i]
  }
  return { fixed, exprs }
}

/** Every string/template literal in `src`, as [content, isTemplate] pairs. */
function literals(src: string): [string, boolean][] {
  const out: [string, boolean][] = []
  for (let i = 0; i < src.length; i++) {
    const q = src[i]
    if (q !== '"' && q !== "'" && q !== '`') continue
    if (q !== '`') {
      const end = src.indexOf(q, i + 1)
      if (end < 0) break
      out.push([src.slice(i + 1, end), false]); i = end
      continue
    }
    // A template ends at the backtick that is not inside one of its own `${}`.
    let j = i + 1, depth = 0
    for (; j < src.length; j++) {
      if (src[j] === '$' && src[j + 1] === '{') { depth++; j++ }
      else if (src[j] === '}' && depth > 0) depth--
      else if (src[j] === '`' && depth === 0) break
    }
    out.push([src.slice(i + 1, j), true]); i = j
  }
  return out
}

/** The unconditional classes, and one entry per alternative branch. */
function classExpr(src: string): Lit {
  const lit: Lit = { static: '', branches: [] }
  for (const [text, tmpl] of literals(src)) {
    if (!tmpl) { lit.branches.push(text); continue }
    const { fixed, exprs } = splitTemplate(text)
    lit.static += ' ' + fixed
    for (const e of exprs) {
      const inner = classExpr(e)
      lit.static += ' ' + inner.static
      lit.branches.push(...inner.branches)
    }
  }
  return lit
}

function chunks(src: string): string[] {
  const out: string[] = []
  const re = /className=/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) {
    const i = m.index + m[0].length
    const q = src[i]
    if (q === '"' || q === "'") {
      const end = src.indexOf(q, i + 1)
      if (end > 0) { out.push(src.slice(i + 1, end)); re.lastIndex = end }
      continue
    }
    if (q !== '{') continue
    let depth = 0, j = i
    for (; j < src.length; j++) {
      if (src[j] === '{') depth++
      else if (src[j] === '}' && --depth === 0) break
    }
    const { static: fixed, branches } = classExpr(src.slice(i + 1, j))
    out.push(...(branches.length ? branches.map((b) => `${fixed} ${b}`) : [fixed]))
    re.lastIndex = j
  }
  return out
}

const PROPS = ['bg', 'text', 'border'] as const

/**
 * Roles whose hover may not resolve to their own rest value.
 *
 * `brand` was the original set. The status roles joined it when the stock
 * status colours were retired: a button carrying `bg-amber-600
 * hover:bg-amber-700` has TWO steps, and one role cannot absorb two without
 * collapsing the hover onto the rest — which is why `ok-hover`, `warn-hover`
 * and `fail-hover` exist. Three such collapses were created and caught here
 * during that migration.
 */
const ROLES = [
  'brand', 'brand-hover',
  'ok', 'warn', 'fail',
  'ok-tint', 'warn-tint', 'fail-tint',
  'ok-line', 'warn-line', 'fail-line',
  'ok-hover', 'warn-hover', 'fail-hover',
] as const
const ROLE_RE = ROLES.join('|')

function deadPairs(src: string): string[] {
  const found: string[] = []
  for (const c of chunks(src)) {
    for (const prop of PROPS) {
      const rest = new Set([...c.matchAll(new RegExp(`(?<![\\w:-])${prop}-(${ROLE_RE})(?![\\w-/])`, 'g'))].map((m) => m[1]))
      const hov = new Set([...c.matchAll(new RegExp(`hover:${prop}-(${ROLE_RE})(?![\\w-/])`, 'g'))].map((m) => m[1]))
      for (const t of rest) if (hov.has(t)) found.push(`${prop}-${t} with hover:${prop}-${t}`)
    }
  }
  return found
}

describe('hover states are distinguishable from rest', () => {
  const files = Object.keys(SOURCES)

  it('no element sets a brand hover to its own rest value', () => {
    const offenders: string[] = []
    for (const f of files) for (const d of deadPairs(SOURCES[f])) offenders.push(`${f}: ${d}`)
    expect(offenders).toEqual([])
  })

  it('DISCRIMINATES — the shipped defect is detected', () => {
    // Exactly the shape that shipped: rest and hover collapsed onto one token.
    expect(deadPairs(`className="rounded bg-brand px-5 hover:bg-brand"`)).toHaveLength(1)
    // …and a real pair is not flagged.
    expect(deadPairs(`className="rounded bg-brand px-5 hover:bg-brand-hover"`)).toEqual([])
    // …nor is a hover on a DIFFERENT property than the rest state.
    expect(deadPairs(`className="bg-brand text-on-solid hover:text-brand"`)).toEqual([])
  })

  it('does not pair across separate class strings', () => {
    // Two different elements may legitimately use bg-brand and hover:bg-brand.
    expect(deadPairs(`const a = "bg-brand"\nconst b = "hover:bg-brand"`)).toEqual([])
  })

  it('actually scanned the tree', () => {
    expect(files.length).toBeGreaterThan(100)
  })
})
