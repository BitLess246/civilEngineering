import katex from 'katex'
import { sanitizeTex } from './tex'

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
