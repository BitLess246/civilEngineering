import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  PLANS, CHECKOUT_ENABLED, planOf, priceFor, monthlyEquivalent, annualSaving,
  annualDiscountOf, formatPeso, ANNUAL_DISCOUNT, type Plan, type BillingPeriod,
} from '../lib/plans'
import { useAuth } from '../lib/auth/authContext'

function PriceLine({ plan, period }: { plan: Plan; period: BillingPeriod }) {
  const price = priceFor(plan, period)
  if (price === null) return <p className="mt-3 text-2xl font-bold text-slate-800">—</p>
  if (price === 0) return <p className="mt-3 text-2xl font-bold text-slate-800">Free</p>

  const perMonth = monthlyEquivalent(plan, period)!
  return (
    <div className="mt-3">
      <p className="text-2xl font-bold text-slate-800">
        {formatPeso(perMonth)}
        <span className="text-sm font-medium text-slate-500"> /month</span>
      </p>
      {period === 'annual' ? (
        <p className="mt-0.5 text-[12px] leading-5 text-slate-500">
          {formatPeso(price)} billed yearly · save {formatPeso(annualSaving(plan))}
        </p>
      ) : (
        <p className="mt-0.5 text-[12px] leading-5 text-slate-500">billed monthly</p>
      )}
    </div>
  )
}

function PlanCard({ plan, current, period }: { plan: Plan; current: boolean; period: BillingPeriod }) {
  const featured = plan.id === 'pro'
  return (
    <div className={`flex flex-col rounded-xl border bg-white p-5 shadow-sm ${
      featured ? 'border-[#0056b3] ring-1 ring-[#0056b3]/20' : 'border-slate-200'}`}>
      <div className="flex items-baseline justify-between">
        <h2 className="text-[1.05rem] font-bold text-[#0056b3]">{plan.name}</h2>
        {current && (
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
        {plan.id === 'guest' ? (
          <p className="text-center text-[12px] text-slate-500">No sign-up needed</p>
        ) : plan.priceMonthly === 0 ? (
          <Link to="/signup"
            className="block rounded-md bg-[#0056b3] px-4 py-2 text-center text-sm font-semibold text-white hover:bg-[#0f4c92]">
            Create a free account
          </Link>
        ) : CHECKOUT_ENABLED ? (
          <Link to="/signup"
            className="block rounded-md bg-[#0056b3] px-4 py-2 text-center text-sm font-semibold text-white hover:bg-[#0f4c92]">
            Choose {plan.name}
          </Link>
        ) : (
          <div className="rounded-md border border-dashed border-slate-300 px-3 py-2 text-center text-[12px] text-slate-500">
            Not open for sign-up yet
          </div>
        )}
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

      {!CHECKOUT_ENABLED && (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] leading-6 text-amber-900">
          <strong>Paid plans are not open for sign-up yet.</strong> Payments are handled by Xendit, and the
          server that verifies a payment is in place — but nothing yet starts one, so no card details are collected
          anywhere in this app. Pro and Max are listed so you can see what they cover. Guest and Free are fully
          available.
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((p) => <PlanCard key={p.id} plan={p} current={p.id === current.id} period={period} />)}
      </div>

      <p className="mt-4 text-[12px] leading-6 text-slate-500">
        Prices are in Philippine pesos and include no hidden fees. Annual billing saves{' '}
        {formatPeso(annualSaving('pro'))} on Pro ({(annualDiscountOf('pro') * 100).toFixed(1)}%) and{' '}
        {formatPeso(annualSaving('max'))} on Max ({(annualDiscountOf('max') * 100).toFixed(1)}%) over a year.
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
