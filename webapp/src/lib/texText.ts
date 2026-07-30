// LaTeX → plain unicode text for the direct-PDF report (user-selected
// formatting: mono-font equations with unicode symbols instead of typeset
// KaTeX). Covers the command vocabulary used by the lib/*Solution builders:
// \frac family, \sqrt, \text/\mathbf, sub/superscripts, greek, operators,
// spacing and check marks. Lossy by design — layout commands become plain
// spacing; subscripts are flattened (M_u → Mu) which matches hand-written
// engineering shorthand.

const SUP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻', '+': '⁺',
}

/** Commands replaced 1:1 (longest first at use). */
const SYMBOLS: [string, string][] = [
  ['\\checkmark', '✓'], ['\\Rightarrow', '⇒'], ['\\rightarrow', '→'],
  ['\\leftarrow', '←'], ['\\varepsilon', 'ε'], ['\\varnothing', '⌀'],
  ['\\lambda', 'λ'], ['\\alpha', 'α'], ['\\beta', 'β'], ['\\gamma', 'γ'],
  ['\\delta', 'δ'], ['\\Delta', 'Δ'], ['\\epsilon', 'ε'], ['\\theta', 'θ'],
  ['\\kappa', 'κ'], ['\\sigma', 'σ'], ['\\Sigma', 'Σ'], ['\\omega', 'ω'],
  ['\\Omega', 'Ω'], ['\\phi', 'φ'], ['\\Phi', 'Φ'], ['\\psi', 'ψ'],
  ['\\rho', 'ρ'], ['\\tau', 'τ'], ['\\mu', 'µ'], ['\\nu', 'ν'],
  ['\\eta', 'η'], ['\\pi', 'π'], ['\\chi', 'χ'], ['\\zeta', 'ζ'],
  ['\\approx', '≈'], ['\\infty', '∞'], ['\\propto', '∝'],
  ['\\lceil', '⌈'], ['\\rceil', '⌉'], ['\\lfloor', '⌊'], ['\\rfloor', '⌋'],
  ['\\cdot', '·'], ['\\times', '×'], ['\\div', '÷'], ['\\pm', '±'],
  ['\\leq', '≤'], ['\\geq', '≥'], ['\\le', '≤'], ['\\ge', '≥'],
  ['\\neq', '≠'], ['\\ne', '≠'], ['\\sum', 'Σ'], ['\\to', '→'],
  ['\\circ', '°'], ['\\degree', '°'], ['\\prime', '′'],
  // ℓ (U+2113) deliberately becomes a plain l: equations are set in DejaVu Sans
  // MONO, which has no U+2113 at all — the character is not in the upstream
  // font, so no subset can add it — and jsPDF draws a missing glyph as nothing.
  // "c'ℓ" was silently printing as "c'". A plain l is legible; a blank is not.
  ['\\ell', 'l'],
  ['\\min', 'min'], ['\\max', 'max'], ['\\tan', 'tan'], ['\\cos', 'cos'],
  ['\\sin', 'sin'], ['\\ln', 'ln'], ['\\log', 'log'],
  ['\\qquad', '    '], ['\\quad', '  '],
]

/** Index of the `}` matching the `{` at `open`. −1 when unbalanced. */
function matchBrace(s: string, open: number): number {
  let depth = 0
  for (let i = open; i < s.length; i++) {
    if (s[i] === '{') depth++
    else if (s[i] === '}') { depth--; if (depth === 0) return i }
  }
  return -1
}

/** Pull the {…} group starting at `at` (or single token when unbraced);
 *  returns [content, indexAfter]. */
function grabArg(s: string, at: number): [string, number] {
  if (s[at] === '{') {
    const close = matchBrace(s, at)
    if (close < 0) return [s.slice(at + 1), s.length]
    return [s.slice(at + 1, close), close + 1]
  }
  // unbraced: one command or one character
  if (s[at] === '\\') {
    let j = at + 1
    while (j < s.length && /[a-zA-Z]/.test(s[j])) j++
    return [s.slice(at, j), j]
  }
  return [s[at] ?? '', at + 1]
}

/**
 * Precomposed macron letters. The combining macron U+0304 is NOT in the
 * embedded subsets, so `x` + U+0304 drew as a bare `x` — the bar vanished and
 * a mean silently read as an instantaneous value. Anything without a
 * precomposed form falls back to the explicit `_bar` shorthand instead.
 */
const MACRON: Record<string, string> = {
  a: 'ā', e: 'ē', i: 'ī', o: 'ō', u: 'ū', y: 'ȳ',
  A: 'Ā', E: 'Ē', I: 'Ī', O: 'Ō', U: 'Ū', Y: 'Ȳ',
}
const overbar = (a: string) => MACRON[a.trim()] ?? `${a.trim()}_bar`

/** Does a fraction/sqrt operand need parentheses in linear form? */
const needsParens = (s: string) => /[+\-−·×/ ]/.test(s.trim())
const wrap = (s: string) => (needsParens(s) ? `(${s.trim()})` : s.trim())

/** Replace every \cmd{a}(…{b}) via a handler, innermost-safe (single pass per
 *  occurrence, called until the command disappears). */
function replaceCommand(s: string, cmd: string, nArgs: number, render: (args: string[]) => string): string {
  // The cursor must advance PAST what was just emitted. Restarting the scan at
  // index 0 deadlocks whenever a handler re-emits its own command — `^\circ`
  // renders back to `^°`, so the loop found the same caret 200 times and every
  // LATER superscript in the same equation was silently dropped ("kN/m³" came
  // out as "kN/m^3"). Args are converted recursively, so nothing before the
  // cursor still needs processing.
  let from = 0
  for (let guard = 0; guard < 500; guard++) {
    const at = s.indexOf(cmd, from)
    if (at < 0) return s
    let i = at + cmd.length
    const args: string[] = []
    for (let k = 0; k < nArgs; k++) {
      while (s[i] === ' ') i++
      const [content, next] = grabArg(s, i)
      args.push(content)
      i = next
    }
    const out = render(args.map((a) => texToPlain(a)))
    s = s.slice(0, at) + out + s.slice(i)
    from = at + out.length
  }
  return s
}

/** Convert a LaTeX (KaTeX-dialect) formula to plain unicode text. */
export function texToPlain(tex: string): string {
  let s = tex
  // structure commands (brace-aware, recursive through texToPlain on args)
  for (const f of ['\\dfrac', '\\tfrac', '\\frac'])
    s = replaceCommand(s, f, 2, ([a, b]) => `${wrap(a)}/${wrap(b)}`)
  s = replaceCommand(s, '\\sqrt', 1, ([a]) => `√${needsParens(a) ? `(${a.trim()})` : a.trim()}`)
  for (const t of ['\\textbf', '\\text', '\\mathbf', '\\mathrm', '\\operatorname'])
    s = replaceCommand(s, t, 1, ([a]) => a)
  for (const c of ['\\overline', '\\bar']) s = replaceCommand(s, c, 1, ([a]) => overbar(a))
  // delimiter sizing → keep the delimiter
  s = s.replace(/\\left\s*/g, '').replace(/\\right\s*/g, '').replace(/\\[bB]igg?[lr]?\s*/g, '')
  // symbols (order matters: longest names first in the table)
  for (const [k, v] of SYMBOLS) s = s.split(k).join(v)
  // superscripts: ^{…} then ^c — digits/sign to unicode, else caret notation
  s = replaceCommand(s, '^', 1, ([a]) => {
    const t = a.trim()
    // ° and ′ are already superscript-height glyphs — `30^\circ` reads as 30°,
    // never as 30^°.
    if (t === '°' || t === '′' || t === '″') return t
    if (t.length > 0 && [...t].every((ch) => SUP[ch] !== undefined)) return [...t].map((ch) => SUP[ch]).join('')
    return `^${needsParens(t) ? `(${t})` : t}`
  })
  // subscripts flatten: M_u → Mu, A_{s,max} → As,max
  s = replaceCommand(s, '_', 1, ([a]) => a.trim())
  // spacing / residual control sequences (thin/med spaces → space, \! → none)
  s = s.replace(/\\[,;:]/g, ' ').replace(/\\!/g, '').replace(/\\ /g, ' ').replace(/~/g, ' ')
  s = s.replace(/\\[a-zA-Z]+/g, '')   // anything unhandled: drop the command, keep args
  // strip residual grouping braces, collapse whitespace
  s = s.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim()
  return s
}
