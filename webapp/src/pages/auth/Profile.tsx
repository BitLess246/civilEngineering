import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth/authContext'
import { usePlan } from '../../lib/auth/usePlan'
import { loadProfile, saveProfile, preparedByLine, type Profile as ProfileData } from '../../lib/auth/profile'
import { CHECKOUT_ENABLED, formatPeso, priceFor } from '../../lib/plans'

function Field({ label, value, onChange, placeholder, hint }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string
}) {
  const id = `p-${label.toLowerCase().replace(/\W+/g, '-')}`
  return (
    <label htmlFor={id} className="flex flex-col text-sm">
      <span className="mb-1 font-medium text-slate-700">{label}</span>
      <input id={id} value={value} placeholder={placeholder} maxLength={120}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-[#0f4c92]" />
      {hint && <span className="mt-1 text-[11.5px] text-slate-500">{hint}</span>}
    </label>
  )
}

export default function Profile() {
  const { user, configured } = useAuth()
  const plan = usePlan()
  const [form, setForm] = useState<ProfileData>(() => loadProfile())
  const [saved, setSaved] = useState(false)

  const set = <K extends keyof ProfileData>(k: K) => (v: ProfileData[K]) => {
    setForm((s) => ({ ...s, [k]: v }))
    setSaved(false)
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    saveProfile(form)
    setSaved(true)
  }

  const preview = preparedByLine(form)

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Account</p>
      <h1 className="mt-1 text-2xl font-bold text-[#0056b3]">Profile</h1>

      {/* ── Account ── */}
      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-[1.02rem] font-bold text-[#0056b3]">Account</h2>
        {!configured ? (
          <p className="mt-2 text-[13px] leading-6 text-slate-600">
            Sign-in is not set up on this deployment, so there is no account to show. The letterhead
            settings below still work — they are stored in this browser.
          </p>
        ) : user ? (
          <dl className="mt-3 space-y-2 text-[13px]">
            <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
              <dt className="text-slate-500">Email</dt>
              <dd className="font-medium text-slate-800">{user.email ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
              <dt className="text-slate-500">Email verified</dt>
              <dd className={user.emailVerified ? 'font-medium text-emerald-700' : 'font-medium text-amber-700'}>
                {user.emailVerified ? 'Yes' : 'Not yet — check your inbox'}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Plan</dt>
              <dd className="font-medium text-slate-800">
                {plan.name}
                {plan.priceMonthly ? (
                  <span className="text-slate-500"> · {formatPeso(priceFor(plan, 'monthly')!)}/month</span>
                ) : null}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-2 text-[13px] leading-6 text-slate-600">
            You are not signed in. <Link to="/signin" className="text-[#0056b3] underline">Sign in</Link>{' '}
            or <Link to="/signup" className="text-[#0056b3] underline">create an account</Link> to save
            projects. The letterhead settings below work either way.
          </p>
        )}
        <p className="mt-3 text-[12px] leading-5 text-slate-500">
          {CHECKOUT_ENABLED
            ? <>Manage your subscription on the <Link to="/pricing" className="text-[#0056b3] underline">Plans page</Link>.</>
            : <>Paid plans are not open for sign-up yet — see <Link to="/pricing" className="text-[#0056b3] underline">Plans</Link> for what they include.</>}
        </p>
      </section>

      {/* ── Letterhead ── */}
      <form onSubmit={submit} className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-[1.02rem] font-bold text-[#0056b3]">Calculation sheet letterhead</h2>
        <p className="mt-1 text-[13px] leading-6 text-slate-600">
          These fill in the report letterhead on every calculator, so you stop retyping them on each
          sheet. You can still change them per sheet before exporting.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Prepared by" value={form.preparedBy} onChange={set('preparedBy')}
            placeholder="Engineer name" hint="Printed on every calculation sheet." />
          <Field label="PRC licence no." value={form.licenseNo} onChange={set('licenseNo')}
            placeholder="0123456" hint="Appended after your name when set." />
          <Field label="Organisation" value={form.organisation} onChange={set('organisation')}
            placeholder="Firm or office" />
          <Field label="Default project" value={form.defaultProject} onChange={set('defaultProject')}
            placeholder="Lot 12 Residence" hint="Starting value for the Project field." />
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 bg-[#f9f8f4] px-3.5 py-2.5">
          <p className="text-[10.5px] font-semibold uppercase tracking-widest text-slate-500">Sheet preview</p>
          <p className="mt-1 font-mono text-[13px] text-slate-800">
            Prepared by: {preview || <span className="text-slate-400">(not set)</span>}
          </p>
          <p className="font-mono text-[13px] text-slate-800">
            Project: {form.defaultProject.trim() || <span className="text-slate-400">(not set)</span>}
          </p>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button type="submit"
            className="rounded-md bg-[#0056b3] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0f4c92]">
            Save
          </button>
          {saved && <span role="status" className="text-[13px] font-medium text-emerald-700">Saved</span>}
        </div>

        <p className="mt-4 border-t border-slate-100 pt-3 text-[12px] leading-5 text-slate-500">
          <strong>These are stored in this browser, not in your account.</strong> They follow the
          device rather than the login, so a different computer starts blank and clearing site data
          clears them. That is deliberate: the same account field carries your subscription plan, and
          a page that could write to it is a page that could try to grant itself one.
        </p>
      </form>
    </main>
  )
}
