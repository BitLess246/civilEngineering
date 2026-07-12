import katex from 'katex'

// '⌀' and '§' have no KaTeX glyph metrics — every render logs
// "LaTeX-incompatible input" / "No character metrics" warnings and falls back
// to a wrong-font glyph. Swap them for the proper commands before compiling
// (\varnothing renders ∅; \S renders §). The \text{⌀} form must be lifted out
// of text mode first or \varnothing would throw there; \S is valid in both.
export const sanitizeTex = (tex: string) =>
  tex.replaceAll('\\text{⌀}', '\\varnothing ')
    .replaceAll('⌀', '\\varnothing ')
    .replaceAll('§', '\\S ')

// Tiny KaTeX wrapper — renders to an HTML string and injects it. Avoids the
// react-katex peer-dependency friction with React 19 and keeps full control.
export function Math({ tex, block = false }: { tex: string; block?: boolean }) {
  const html = katex.renderToString(sanitizeTex(tex), { throwOnError: false, displayMode: block })
  return block ? (
    <div className="my-1 overflow-x-auto" dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <span dangerouslySetInnerHTML={{ __html: html }} />
  )
}
