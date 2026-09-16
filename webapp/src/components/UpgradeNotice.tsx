import { Link } from 'react-router-dom'

/**
 * Explains why something is unavailable and what would unlock it.
 *
 * Always states the plan by name — the message comes from `upgradeMessage`,
 * which never says "upgrade to continue". A paywall that does not say what it
 * wants is just a broken button.
 */
export function UpgradeNotice({ message, compact }: { message: string; compact?: boolean }) {
  if (compact) {
    return (
      <p className="mt-1 text-[11.5px] leading-5 text-warn">
        🔒 {message}{' '}
        <Link to="/pricing" className="font-semibold underline">See plans</Link>
      </p>
    )
  }
  return (
    <div className="col-span-full rounded-lg border border-warn-line bg-warn-tint px-4 py-3">
      <p className="text-[13px] font-semibold text-warn">🔒 Not on your plan</p>
      <p className="mt-1 text-[12.5px] leading-6 text-warn">{message}</p>
      <Link to="/pricing"
        className="mt-2 inline-block rounded-md bg-warn px-3 py-1.5 text-[12px] font-semibold text-on-solid hover:bg-warn-hover">
        Compare plans
      </Link>
    </div>
  )
}

/**
 * Full-page version, for a route the plan cannot open at all.
 *
 * Shows what the page WOULD do rather than bouncing the visitor somewhere else:
 * being redirected away with no explanation is the worst version of a paywall.
 */
export function UpgradeGate({ title, message, blurb }: { title: string; message: string; blurb?: string }) {
  return (
    <div className="mx-auto max-w-2xl px-5 py-16 text-center">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted">Plan required</p>
      <h1 className="mt-1 text-2xl font-bold text-brand">{title}</h1>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted">{message}</p>
      {blurb && <p className="mx-auto mt-2 max-w-lg text-[13px] leading-6 text-muted">{blurb}</p>}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link to="/pricing"
          className="rounded-md bg-brand px-5 py-2 text-sm font-semibold text-on-solid hover:bg-brand-hover">
          Compare plans
        </Link>
        <Link to="/docs"
          className="rounded-md border border-field-line px-5 py-2 text-sm font-semibold text-ink-2 hover:border-brand hover:text-brand">
          Browse the calculators
        </Link>
      </div>
    </div>
  )
}
