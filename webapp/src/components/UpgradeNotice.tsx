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
      <p className="mt-1 text-[11.5px] leading-5 text-amber-800">
        🔒 {message}{' '}
        <Link to="/pricing" className="font-semibold underline">See plans</Link>
      </p>
    )
  }
  return (
    <div className="col-span-full rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
      <p className="text-[13px] font-semibold text-amber-900">🔒 Not on your plan</p>
      <p className="mt-1 text-[12.5px] leading-6 text-amber-900">{message}</p>
      <Link to="/pricing"
        className="mt-2 inline-block rounded-md bg-amber-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-amber-700">
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
    <main className="mx-auto max-w-2xl px-5 py-16 text-center">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Plan required</p>
      <h1 className="mt-1 text-2xl font-bold text-[#0056b3]">{title}</h1>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-600">{message}</p>
      {blurb && <p className="mx-auto mt-2 max-w-lg text-[13px] leading-6 text-slate-500">{blurb}</p>}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link to="/pricing"
          className="rounded-md bg-[#0056b3] px-5 py-2 text-sm font-semibold text-white hover:bg-[#0f4c92]">
          Compare plans
        </Link>
        <Link to="/docs"
          className="rounded-md border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-700 hover:border-[#0056b3] hover:text-[#0056b3]">
          Browse the calculators
        </Link>
      </div>
    </main>
  )
}
