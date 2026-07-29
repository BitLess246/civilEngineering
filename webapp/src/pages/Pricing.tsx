import { Link } from 'react-router-dom'
import { PLANS, CHECKOUT_ENABLED, type Plan } from '../lib/plans'
import { useAuth } from '../lib/auth/authContext'
import { planOf } from '../lib/plans'

function PlanCard({ plan, current }: { plan: Plan; current: boolean }) {
  const featured = plan.id === 'free'
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
      <p className="mt-3 text-2xl font-bold text-slate-800">
        {plan.price === null ? '—' : plan.price === 0 ? 'Free' : `$${plan.price}`}
        {plan.price ? <span className="text-sm font-medium text-slate-500"> /month</span> : null}
      </p>
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
        ) : plan.price === 0 ? (
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

export default function Pricing() {
  const { user } = useAuth()
  const current = planOf(user ? (user.plan ?? 'free') : 'guest')

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Plans</p>
      <h1 className="mt-1 text-2xl font-bold text-[#0056b3]">Pricing</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
        Every calculator is free to try without an account. A free account removes the trial limits and opens the
        3D Model Space; Pro adds the optimiser, nonlinear analysis, reports, estimating and scheduling.
      </p>

      {!CHECKOUT_ENABLED && (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] leading-6 text-amber-900">
          <strong>Paid plans are not open for sign-up yet.</strong> Taking card payments safely needs a server to
          verify the payment provider&rsquo;s webhook — a browser cannot do that, because anything checked in the
          browser can be forged by the person paying. Until that exists, Pro is listed so you can see what it
          covers, and no card details are collected anywhere in this app. The free tier is fully available.
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PLANS.map((p) => <PlanCard key={p.id} plan={p} current={p.id === current.id} />)}
      </div>

      <h2 className="mt-10 text-[1.05rem] font-bold text-[#0056b3]">What counts as a &ldquo;calculator&rdquo;</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
        The single-purpose pages — beam, column, footing, retaining wall, settlement, lateral pile, connections,
        slope stability and the rest. Each gives one answer from one set of inputs. The 3D Model Space, the frame
        and truss workbenches, estimating and scheduling are project-scale tools that hold state across a whole
        building, and those need an account.
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
