// Renders a calculation-helper reply: the markdown subset parsed by
// lib/ai/markdown, as React elements (text nodes only — the model's output is
// never injected as HTML) with math through the app's KaTeX wrapper.
import { Fragment, type ReactNode } from 'react'
import { Math } from '../../lib/math'
import { parseMarkdown, type Block, type Inline, type ListBlock } from '../../lib/ai/markdown'

function inl(nodes: Inline[]): ReactNode[] {
  return nodes.map((n, k) => {
    switch (n.t) {
      case 'text': return <Fragment key={k}>{n.v}</Fragment>
      case 'br': return <br key={k} />
      case 'strong': return <strong key={k} className="font-semibold text-ink">{inl(n.c)}</strong>
      case 'em': return <em key={k}>{inl(n.c)}</em>
      case 'code': return <code key={k} className="rounded bg-sheet px-1 font-mono text-[12px]">{n.v}</code>
      case 'math': return <Math key={k} tex={n.v} />
      case 'link': return <a key={k} href={n.href} target="_blank" rel="noopener noreferrer" className="text-brand underline">{inl(n.c)}</a>
    }
  })
}

function list(b: ListBlock, k: number, nested = false): ReactNode {
  const Tag = b.ordered ? 'ol' : 'ul'
  return (
    <Tag key={k} start={b.ordered ? b.start : undefined}
      className={`space-y-0.5 pl-5 ${b.ordered ? 'list-decimal' : nested ? 'list-[circle]' : 'list-disc'} ${nested ? 'mt-0.5' : ''}`}>
      {b.items.map((it, j) => <li key={j}>{inl(it.c)}{it.sub && list(it.sub, 0, true)}</li>)}
    </Tag>
  )
}

function block(b: Block, k: number): ReactNode {
  switch (b.t) {
    case 'heading': return <p key={k} className="mt-1.5 font-semibold text-ink first:mt-0">{inl(b.c)}</p>
    case 'para': return <p key={k}>{inl(b.c)}</p>
    case 'hr': return <hr key={k} className="border-hairline-2" />
    case 'code': return <pre key={k} className="overflow-x-auto rounded bg-sheet px-2 py-1 font-mono text-[12px] leading-snug">{b.v}</pre>
    case 'math': return <Math key={k} tex={b.v} block />
    case 'list': return list(b, k)
    case 'table': return (
      <div key={k} className="overflow-x-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead><tr>{b.head.map((c, j) => <th key={j} className="border-b border-hairline px-1.5 py-0.5 text-left font-semibold text-ink">{inl(c)}</th>)}</tr></thead>
          <tbody>{b.rows.map((r, j) => <tr key={j}>{r.map((c, q) => <td key={q} className="border-b border-hairline-2 px-1.5 py-0.5 align-top">{inl(c)}</td>)}</tr>)}</tbody>
        </table>
      </div>
    )
  }
}

export function AssistantMarkdown({ text }: { text: string }) {
  return <div className="space-y-1.5 [overflow-wrap:anywhere]">{parseMarkdown(text).map(block)}</div>
}
