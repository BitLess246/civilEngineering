import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  PLANS, planOf, priceFor, monthlyEquivalent, annualSaving,
  annualDiscountOf, formatUsd, ANNUAL_DISCOUNT, type Plan, type BillingPeriod, type PlanId,
} from '../lib/plans'
import { CHECKOUT_ENABLED, type PaidPlanId } from '../lib/billing/paddleConfig'
import { openPlanCheckout, checkoutErrorMessage } from '../lib/billing/paddleCheckout'
import { useAuth } from '../lib/auth/authContext'

/** Where Paddle returns the browser after a payment. */
const successUrl = () => `${window.location.origin}/pricing?checkout=success`

/**
 * The buy button for one paid tier.
 *
 * Four states, and the order matters — each answers a different question, and
 * showing a "Choose Pro" button to someone who cannot use it is the version of
 * this component that generates support mail:
 *
 *   1. checkout not configured → say so, offer nothing
 *   2. not signed in          → sign in first, because the webhook needs a
 *                               user id to credit the payment to (see
 *                               paddleCheckout.ts) — a checkout without one
 *                               takes money and grants nothing
 *   3. already on this tier   → nothing to buy
 *   4. otherwise              → open the overlay
 */
function PlanAction({ plan, period, current }: { plan: Plan; period: BillingPeriod; current: PlanId }) {
  const { user } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const btn = 'block w-full rounded-md bg-[#0056b3] px-4 py-2 text-center text-sm font-semibold text-white hover:bg-[#0f4c92] disabled:opacity-60'

  if (plan.id === 'guest') return <p className="text-center text-[12px] text-slate-500">No sign-up needed</p>
  if (plan.priceMonthly === 0) {
    return user
      ? <p className="text-center text-[12px] text-slate-500">You have an account</p>
      : <Link to="/signup" className={btn}>Create a free account</Link>
  }

  if (!CHECKOUT_ENABLED) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 px-3 py-2 text-center text-[12px] text-slate-500">
        Not open for sign-up yet
      </div>
    )
  }

  if (current === plan.id) {
    return (
      <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-center text-[12px] font-semibold text-emerald-700">
        Your current plan
      </div>
    )
  }

  if (!user) {
    return (
      <Link to="/signin" state={{ from: '/pricing' }} className={btn}>
        Sign in to choose {plan.name}
      </Link>
    )
  }

  const buy = async () => {
    setBusy(true)
    setError(null)
    const outcome = await openPlanCheckout({
      plan: plan.id as PaidPlanId,
      period,
      userId: user.id,
      email: user.email,
      successUrl: successUrl(),
    })
    // The overlay is Paddle's from here; the button only stops spinning.
    setBusy(false)
    if (!outcome.ok) setError(checkoutErrorMessage(outcome.reason))
  }

  return (
    <div>
      <button type="button" onClick={buy} disabled={busy} className={btn}>
        {busy ? 'Opening…' : `Choose ${plan.name}`}
      </button>
      {error && <p role="alert" className="mt-2 text-[12px] leading-5 text-red-700">{error}</p>}
    </div>
  )
}

function PriceLine({ plan, period }: { plan: Plan; period: BillingPeriod }) {
  const price = priceFor(plan, period)
  if (price === null) return <p className="mt-3 text-2xl font-bold text-slate-800">—</p>
  if (price === 0) return <p className="mt-3 text-2xl font-bold text-slate-800">Free</p>

  const perMonth = monthlyEquivalent(plan, period)!
  return (
    <div className="mt-3">
      <p className="text-2xl font-bold text-slate-800">
        {formatUsd(perMonth)}
        <span className="text-sm font-medium text-slate-500"> /month</span>
      </p>
      {period === 'annual' ? (
        <p className="mt-0.5 text-[12px] leading-5 text-slate-500">
          {formatUsd(price)} billed yearly · save {formatUsd(annualSaving(plan))}
        </p>
      ) : (
        <p className="mt-0.5 text-[12px] leading-5 text-slate-500">billed monthly</p>
      )}
    </div>
  )
}

function PlanCard({ plan, current, period }: { plan: Plan; current: PlanId; period: BillingPeriod }) {
  const featured = plan.id === 'pro'
  const isCurrent = current === plan.id
  return (
    <div className={`flex flex-col rounded-xl border bg-white p-5 shadow-sm ${
      featured ? 'border-[#0056b3] ring-1 ring-[#0056b3]/20' : 'border-slate-200'}`}>
      <div className="flex items-baseline justify-between">
        <h2 className="text-[1.05rem] font-bold text-[#0056b3]">{plan.name}</h2>
        {isCurrent && (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
            Your plan
          </span>
        )}
      </div>
      <p className="mt-1 text-[13px] leading-5 text-slate-600">{plan.tagline}</p>
      <PriceLine plan={plan} period={period} />
      <ul className="mt-4 flex-1 space-y-1.5">
        {plan.highlights.map((h) => (
          <li key={h} className="flex gap-2 text-[13px] leading-5 text-slate-700">
            <span className="text-emerald-600">✓</span><span>{h}</span>
          </li>
        ))}
      </ul>
      <div className="mt-5">
        <PlanAction plan={plan} period={period} current={current} />
      </div>
    </div>
  )
}

/** Monthly / annual switch. Annual is preselected — it is the better deal. */
function PeriodToggle({ period, onChange }: { period: BillingPeriod; onChange: (p: BillingPeriod) => void }) {
  const btn = (p: BillingPeriod, label: string) => (
    <button key={p} type="button" onClick={() => onChange(p)}
      aria-pressed={period === p}
      className={`rounded-md px-4 py-1.5 text-[13px] font-semibold transition ${
        period === p ? 'bg-white text-[#0056b3] shadow-sm' : 'text-slate-600 hover:text-[#0056b3]'}`}>
      {label}
    </button>
  )
  return (
    <div className="mt-5 flex flex-wrap items-center gap-3">
      <div className="inline-flex rounded-lg bg-slate-100 p-1">
        {btn('monthly', 'Monthly')}
        {btn('annual', 'Annual')}
      </div>
      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11.5px] font-semibold text-emerald-700">
        Save {Math.round(ANNUAL_DISCOUNT * 100)}% paying yearly
      </span>
    </div>
  )
}

/**
 * The banner shown when Paddle returns the browser after a payment.
 *
 * Careful about what it claims. The plan is granted by the webhook, which
 * arrives independently of this redirect and may land a moment later — so this
 * says the payment went through and the plan follows shortly, rather than
 * "you're on Pro", which would be a lie for anyone who reads fast. The session
 * also has to be refreshed before `app_metadata.plan` changes, hence the
 * sign-out-and-in line rather than a spinner that might never resolve.
 */
function CheckoutReturn() {
  const [params, setParams] = useSearchParams()
  if (params.get('checkout') !== 'success') return null
  return (
    <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] leading-6 text-emerald-900">
      <strong>Payment received — thank you.</strong> Your plan is granted by our billing server the moment
      Paddle confirms the payment, which is usually within a few seconds. If this page still shows your old
      plan, sign out and back in to refresh your session; if it has not changed in a few minutes, email us and
      we will sort it out.
      <button type="button" onClick={() => { params.delete('checkout'); setParams(params, { replace: true }) }}
        className="ml-2 underline">Dismiss</button>
    </div>
  )
}

export default function Pricing() {
  const { user } = useAuth()
  const current = planOf(user ? (user.plan ?? 'free') : 'guest')
  const [period, setPeriod] = useState<BillingPeriod>('annual')

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Plans</p>
      <h1 className="mt-1 text-2xl font-bold text-[#0056b3]">Pricing</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
        Every calculator is free, with or without an account — a free account only removes the trial counter and
        lets you save work. The paid tiers are for project-scale tools: Pro opens the 3D Model Space and everything
        built on it, and Max adds the nonlinear and dynamic solvers plus construction scheduling.
      </p>

      <PeriodToggle period={period} onChange={setPeriod} />

      <CheckoutReturn />

      {!CHECKOUT_ENABLED && (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] leading-6 text-amber-900">
          <strong>Paid plans are not open for sign-up yet.</strong> Payments will be handled by Paddle, and the
          server that verifies a payment is in place — but this deployment has no checkout configured, so no card
          details are collected anywhere in this app. Pro and Max are listed so you can see what they cover. Guest
          and Free are fully available.
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((p) => <PlanCard key={p.id} plan={p} current={current.id} period={period} />)}
      </div>

      <p className="mt-4 text-[12px] leading-6 text-slate-500">
        Prices are in US dollars and include no hidden fees; Paddle converts them to your local currency at
        checkout, and any sales tax or VAT is shown there before you pay. Annual billing saves{' '}
        {formatUsd(annualSaving('pro'))} on Pro ({(annualDiscountOf('pro') * 100).toFixed(1)}%) and{' '}
        {formatUsd(annualSaving('max'))} on Max ({(annualDiscountOf('max') * 100).toFixed(1)}%) over a year.
      </p>

      <h2 className="mt-10 text-[1.05rem] font-bold text-[#0056b3]">What counts as a &ldquo;calculator&rdquo;</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
        The single-purpose pages — beam, column, footing, retaining wall, settlement, lateral pile, connections,
        slope stability and the rest. Each gives one answer from one set of inputs, and every one of them stays
        free. The 3D Model Space, the frame and truss workbenches, estimating and scheduling are project-scale
        tools that hold state across a whole building, and those are what the paid tiers are for.
      </p>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
        Documentation and the{' '}
        <Link to="/validation" className="text-[#0056b3] underline">validation page</Link>{' '}
        are open to everyone, always. Being able to check the engine against hand calculations should never be
        behind a paywall.
      </p>
    </main>
  )
}
