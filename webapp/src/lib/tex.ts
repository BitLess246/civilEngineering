// '⌀' and '§' have no KaTeX glyph metrics — every render logs
// "LaTeX-incompatible input" / "No character metrics" warnings and falls back
// to a wrong-font glyph. Swap them for the proper commands before compiling
// (\varnothing renders ∅; \S renders §). The \text{⌀} form must be lifted out
// of text mode first or \varnothing would throw there; \S is valid in both.
//
// Lives beside `math.tsx` rather than inside it so that module exports only the
// <Math> component — a file mixing components with plain values breaks React
// Fast Refresh.
export const sanitizeTex = (tex: string) =>
  tex.replaceAll('\\text{⌀}', '\\varnothing ')
    .replaceAll('⌀', '\\varnothing ')
    .replaceAll('§', '\\S ')
