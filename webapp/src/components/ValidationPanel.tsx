import type { MeshIssue } from '../engine/meshValidation'

/** Pre-analysis mesh diagnostics (CLAUDE.md §1). Errors are fatal — the solve
 *  would produce a singular stiffness matrix; warnings are advisory. */
export function ValidationPanel({ issues, onSelect }: {
  issues: MeshIssue[]
  onSelect?: (refs: string[]) => void
}) {
  if (issues.length === 0) return null
  const errors = issues.filter((i) => i.severity === 'error')
  const warnings = issues.filter((i) => i.severity === 'warning')

  const Item = ({ i }: { i: MeshIssue }) => {
    const err = i.severity === 'error'
    return (
      <li className={`flex items-start gap-2 rounded px-2 py-1.5 text-xs ${err ? 'text-red-700' : 'text-amber-700'}`}>
        <span aria-hidden className="mt-px font-bold">{err ? '✗' : '⚠'}</span>
        <span className="flex-1">
          {i.message}
          {i.refs.length > 0 && onSelect && (
            <button type="button" onClick={() => onSelect(i.refs)}
              className="ml-1.5 rounded border border-current/30 px-1.5 py-px text-[10px] font-semibold opacity-80 hover:opacity-100">
              show
            </button>
          )}
        </span>
      </li>
    )
  }

  return (
    <div className={`rounded-xl border p-4 shadow-sm ${errors.length ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}>
      <h2 className={`mb-1 text-[1.02rem] font-bold ${errors.length ? 'text-red-700' : 'text-amber-700'}`}>
        Mesh validation — {errors.length} error{errors.length === 1 ? '' : 's'}, {warnings.length} warning{warnings.length === 1 ? '' : 's'}
      </h2>
      {errors.length > 0 && (
        <p className="mb-2 text-[11px] text-red-600">Fix the errors below before analysing — they would make the stiffness matrix singular.</p>
      )}
      <ul className="space-y-0.5">
        {errors.map((i, k) => <Item key={`e${k}`} i={i} />)}
        {warnings.map((i, k) => <Item key={`w${k}`} i={i} />)}
      </ul>
    </div>
  )
}
