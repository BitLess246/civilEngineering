import type { ToolDef } from './tools'

/**
 * "Did you mean" for an address that matched no route.
 *
 * A mistyped or stale URL is usually close to the page it was meant to be,
 * so the catalogue is ranked by how much of the path it shares rather than
 * dumped in full. Pure so the ranking can be tested; the page only renders it.
 */

/** Length of the shared leading `a`/`b` prefix, in characters. */
export const commonPrefix = (a: string, b: string): number => {
  let n = 0
  while (n < a.length && n < b.length && a[n] === b[n]) n++
  return n
}

/**
 * Score of `a` against `b`: the shared leading path, summed over
 * `/`-separated segments. A segment only counts once it shares at least three
 * characters, so `/beam-analysis` scores against `/beam-design` while
 * `/x` scores against nothing.
 */
export function pathScore(a: string, b: string): number {
  const x = a.split('/').filter(Boolean), y = b.split('/').filter(Boolean)
  let n = 0
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const common = commonPrefix(x[i], y[i])
    if (common < 3) break
    n += common
  }
  return n
}

/** The `limit` catalogue entries nearest `pathname`, best first. */
export function nearestTools(pathname: string, tools: readonly ToolDef[], limit = 4): ToolDef[] {
  return tools
    .map((t) => ({ t, score: pathScore(t.to, pathname) }))
    .filter((x) => x.score > 1 && x.t.to !== pathname)
    .sort((a, b) => b.score - a.score || a.t.to.localeCompare(b.t.to))
    .slice(0, limit)
    .map((x) => x.t)
}
