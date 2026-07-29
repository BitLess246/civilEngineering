import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AUTH_ENV_KEYS } from '../lib/auth/authClient'
import { passwordStrength } from '../lib/auth/validation'

/** Shell shared by every auth page: centred card, title, footer link. */
export function AuthCard({ title, subtitle, children, footer }: {
  title: string; subtitle?: string; children: ReactNode; footer?: ReactNode
}) {
  return (
    <main className="mx-auto flex max-w-md flex-col px-5 py-14">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Account</p>
      <h1 className="mt-1 text-2xl font-bold text-[#0056b3]">{title}</h1>
      {subtitle && <p className="mt-2 text-sm leading-6 text-slate-600">{subtitle}</p>}
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">{children}</div>
      {footer && <div className="mt-4 text-center text-sm text-slate-600">{footer}</div>}
    </main>
  )
}

export function TextField({ label, type = 'text', value, onChange, error, autoComplete, placeholder, disabled }: {
  label: string; type?: string; value: string; onChange: (v: string) => void
  error?: string; autoComplete?: string; placeholder?: string; disabled?: boolean
}) {
  const id = `f-${label.toLowerCase().replace(/\W+/g, '-')}`
  return (
    <label htmlFor={id} className="mb-4 flex flex-col text-sm">
      <span className="mb-1 font-medium text-slate-700">{label}</span>
      <input
        id={id} type={type} value={value} disabled={disabled}
        autoComplete={autoComplete} placeholder={placeholder}
        aria-invalid={!!error} aria-describedby={error ? `${id}-err` : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={`rounded-md border px-3 py-2 outline-none disabled:bg-slate-50 ${
          error ? 'border-red-400 focus:border-red-500' : 'border-slate-300 focus:border-[#0f4c92]'}`}
      />
      {error && <span id={`${id}-err`} role="alert" className="mt-1 text-[12px] text-red-600">{error}</span>}
    </label>
  )
}

/** Password field with a show/hide toggle — typing a password blind is a
 *  common cause of the mismatch error, so let people look at it. */
export function PasswordField(props: Omit<Parameters<typeof TextField>[0], 'type'> & { meter?: boolean }) {
  const [show, setShow] = useState(false)
  const { meter, ...rest } = props
  const s = meter ? passwordStrength(props.value) : null
  const tone = ['bg-red-400', 'bg-red-400', 'bg-amber-400', 'bg-lime-500', 'bg-emerald-500']
  return (
    <div className="relative">
      <button
        type="button" onClick={() => setShow((v) => !v)}
        className="absolute right-0 top-0 z-10 text-[11px] font-medium text-slate-500 hover:text-[#0056b3]"
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        {show ? 'Hide' : 'Show'}
      </button>
      <TextField {...rest} type={show ? 'text' : 'password'} />
      {s && props.value && (
        <div className="-mt-2 mb-4">
          <div className="flex gap-1" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={`h-1 flex-1 rounded ${i < s.score ? tone[s.score] : 'bg-slate-200'}`} />
            ))}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            <span className="font-medium capitalize">{s.label}</span>
            {s.hint && <span> — {s.hint}</span>}
          </p>
        </div>
      )}
    </div>
  )
}

export function SubmitButton({ busy, children, disabled }: {
  busy?: boolean; children: ReactNode; disabled?: boolean
}) {
  return (
    <button
      type="submit" disabled={busy || disabled}
      className="w-full rounded-md bg-[#0056b3] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0f4c92] disabled:cursor-not-allowed disabled:bg-slate-300"
    >
      {busy ? 'Working…' : children}
    </button>
  )
}

export function FormAlert({ tone, children }: { tone: 'error' | 'success' | 'info'; children: ReactNode }) {
  const cls = tone === 'error' ? 'border-red-200 bg-red-50 text-red-800'
    : tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : 'border-sky-200 bg-sky-50 text-sky-900'
  return (
    <div role={tone === 'error' ? 'alert' : 'status'}
      className={`mb-4 rounded-md border px-3 py-2 text-[13px] leading-5 ${cls}`}>
      {children}
    </div>
  )
}

/**
 * Shown in place of a form when the deployment has no Supabase keys.
 *
 * Names the exact variables rather than saying "not configured", because the
 * person who sees this is almost always the one who has to fix it. A form that
 * silently fails to submit would be worse than no form.
 */
export function NotConfigured() {
  return (
    <FormAlert tone="info">
      <p className="font-semibold">Sign-in is not set up on this deployment.</p>
      <p className="mt-1">
        Set <code className="rounded bg-white/70 px-1">{AUTH_ENV_KEYS[0]}</code> and{' '}
        <code className="rounded bg-white/70 px-1">{AUTH_ENV_KEYS[1]}</code> from your Supabase project
        settings, then redeploy. The anon key is safe to expose in the browser bundle; the service-role key
        is not, and must never be used here.
      </p>
      <p className="mt-1">
        The calculators remain available meanwhile — see the{' '}
        <Link to="/docs" className="underline">documentation</Link>.
      </p>
    </FormAlert>
  )
}
