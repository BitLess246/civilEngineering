import { Link, useLocation } from 'react-router-dom'
import { TOOL_CATEGORIES } from '../lib/tools'
import { nearestTools } from '../lib/routeSuggest'

/**
 * WHAT A MISTYPED URL USED TO GIVE YOU: nothing.
 *
 * The route table lives inside a `path="*"` wrapper that mounts the app shell,
 * and the INNER table had no catch-all of its own — so any address that
 * matched no tool rendered the sidebar, the breadcrumb header and an empty
 * content area. A blank page reads as a broken app, not as a wrong address.
 *
 * A dead end deserves a way out, so this names what was asked for and offers
 * the catalogue it is probably a typo of, rather than a bare "404".
 */
export default function NotFound() {
  const { pathname } = useLocation()
  // Nearest matches by shared prefix — a typo is usually close to its target,
  // and "did you mean /beam-design" beats a list of fifty links.
  const near = nearestTools(pathname, TOOL_CATEGORIES.flatMap((c) => c.tools))

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <p className="font-mono text-[11px] uppercase tracking-wider text-faint">404 · page not found</p>
      <h1 className="mt-2 text-2xl font-bold text-ink">Nothing lives at that address</h1>
      <p className="mt-2 text-sm text-muted">
        <code className="rounded bg-sheet-2 px-1.5 py-0.5 font-mono text-[12.5px]">{pathname}</code>{' '}
        is not a page in this toolkit. It may have been renamed, or the link that brought you here may be out of date.
      </p>

      {near.length > 0 && (
        <div className="mt-6">
          <p className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wider text-muted">Did you mean</p>
          <ul className="space-y-1">
            {near.map((t) => (
              <li key={t.to}>
                <Link to={t.to} className="text-sm font-medium text-brand hover:underline">{t.name}</Link>
                <span className="ml-2 text-[11.5px] text-faint">{t.sub}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-8 flex gap-3">
        <Link to="/" className="rounded-md bg-brand px-3.5 py-2 text-[13px] font-semibold text-on-solid hover:bg-brand-hover">
          Back to the home page
        </Link>
        <Link to="/docs" className="rounded-md border border-field-line bg-sheet px-3.5 py-2 text-[13px] font-semibold text-ink hover:bg-sheet-2">
          Browse the documentation
        </Link>
      </div>
    </div>
  )
}
