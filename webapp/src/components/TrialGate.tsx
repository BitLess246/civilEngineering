// ─────────────────────────────────────────────────────────────────────────
// TRIAL GATE — where the guest allowance is actually spent.
//
// It was not being spent anywhere. `trialQuota` had the route lists, the
// verdicts, the counter and a full test suite; `AuthProvider` exposed
// `spendTrial`; and NOTHING CALLED IT. `RequireAuth` wrapped only the
// members-only routes, so on `/beam-design` the quota was never consulted and
// a guest had unlimited runs. The pricing page has been promising "5 runs of
// each single-purpose calculator" the whole time.
//
// WHAT COUNTS AS ONE RUN: one visit to the calculator.
//
// Not one press of a button — these pages recompute live, on a 250 ms debounce,
// every time a field changes (`useCalcResult`), so counting computations would
// burn the whole allowance while somebody typed a beam width. Not one session
// either, or the counter would never move for a visitor who leaves the tab
// open. Arriving at the page is the event a person would describe as "using
// the calculator", so that is the unit.
//
// It gates ONLY the trial verdicts. `members-only` is deliberately passed
// through untouched: those routes are `RequireAuth`'s business, and having two
// components decide the same question is how a page ends up double-gated or,
// worse, gated by the one that was not updated.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth/authContext'
import { GUEST_TRIAL_LIMIT, trialNotice, type AccessVerdict } from '../lib/trialQuota'

export function TrialGate({ children }: { children: ReactNode }) {
  const { access, spendTrial, loading, configured } = useAuth()
  const { pathname, key } = useLocation()

  /**
   * The verdict AS IT STOOD ON ARRIVAL, before this visit was charged for.
   *
   * Judging the live verdict instead costs the visitor a run: on the fifth
   * arrival they are `trial` with one left, the effect charges it, and the
   * re-render — now `trial-exhausted` — replaces the page they were just
   * admitted to with the paywall. Five runs would buy four pages.
   *
   * Keyed on `location.key` rather than `pathname` because that is what
   * identifies an ARRIVAL: it changes even when navigating to the same path,
   * which `pathname` does not.
   */
  const [arrival, setArrival] = useState<{ key: string; verdict: AccessVerdict } | null>(null)

  useEffect(() => {
    // A signed-in engineer whose session has not resolved yet is not a guest;
    // charging them would spend an allowance that does not apply to them.
    if (configured && loading) return
    if (arrival?.key === key) return
    const snapshot = access(pathname)
    // Capturing state in an effect is exactly what this snapshot IS: the value
    // has to be read before `spendTrial` changes it, so it cannot be derived
    // during render. The `arrival?.key === key` guard above means it settles
    // after one extra render rather than looping.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setArrival({ key, verdict: snapshot })
    if (snapshot.kind === 'trial') spendTrial(pathname)
  }, [key, pathname, loading, configured, access, spendTrial, arrival])

  if (configured && loading) return <>{children}</>

  // Before the effect runs, judge live — that is the correct answer for a
  // visitor arriving already exhausted, and the effect confirms it a tick later.
  //
  // A visitor whose local cache is empty gets THIS page while the server's
  // record is still in flight, and is stopped on the next arrival. Blocking
  // the first paint on a round trip to Supabase would make every guest page
  // load wait on the network to defend a five-run courtesy.
  const verdict = arrival?.key === key ? arrival.verdict : access(pathname)

  if (verdict.kind === 'trial-exhausted') {
    return (
      <main className="mx-auto max-w-2xl px-5 py-16 text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Free trial used up</p>
        <h1 className="mt-1 text-2xl font-bold text-[#0056b3]">Create a free account to keep going</h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-600">
          You have used all {GUEST_TRIAL_LIMIT} free runs of this calculator. A free
          account removes the counter from every single-purpose calculator — no card,
          no trial period.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link to="/signup"
            className="rounded-md bg-[#0056b3] px-5 py-2 text-sm font-semibold text-white hover:bg-[#0f4c92]">
            Create a free account
          </Link>
          <Link to="/signin"
            className="rounded-md border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-700 hover:border-[#0056b3] hover:text-[#0056b3]">
            Sign in
          </Link>
        </div>
        <p className="mt-6 text-[12.5px] text-slate-500">
          The <Link to="/docs" className="underline">documentation</Link> and{' '}
          <Link to="/validation" className="underline">validation</Link> pages stay open to everyone.
        </p>
      </main>
    )
  }

  const notice = trialNotice(verdict)
  return (
    <>
      {notice && (
        <div className="no-print border-b border-amber-200 bg-amber-50 px-5 py-2 text-center text-[12.5px] text-amber-900">
          {notice}{' '}
          <Link to="/signup" className="font-semibold underline">Create a free account</Link>
        </div>
      )}
      {children}
    </>
  )
}
