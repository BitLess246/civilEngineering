import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth/authContext'
import { usePlan } from '../../lib/auth/usePlan'
import { loadProfile, saveProfile, preparedByLine, type Profile as ProfileData } from '../../lib/auth/profile'
import { formatUsd, priceFor } from '../../lib/plans'
import { CHECKOUT_ENABLED } from '../../lib/billing/paddleConfig'
import { openPortalSession, portalMessage } from '../../lib/billing/portal'
import {
  fetchBillingHistory, rowAmount, rowDate, statusLabel, needsAttention, type HistoryRow,
} from '../../lib/billing/history'
import { DisciplinePicker } from '../../components/DisciplinePicker'
import { useToolPrefs, setToolPrefs } from '../../lib/useToolPrefs'
import { useTheme, setTheme } from '../../lib/useTheme'
import { THEMES } from '../../lib/theme'
import { chosenFromPrefs, prefsFromChosen, CHOOSABLE_GROUPS } from '../../lib/toolPrefs'

/**
 * "Tools you use" — the answer to the first-run question, changeable.
 *
 * Saving publishes through `setToolPrefs`, so the sidebar and the home
 * directory update on the same click rather than on the next reload. A Save
 * button whose effect only appears after F5 reads as a broken Save button.
 *
 * The picker is the SAME component the first-run dialog uses, so the two lists
 * cannot drift apart — this page exists to change an answer that one took.
 */
/**
 * Appearance — the theme picker.
 *
 * No Save button, unlike Tool preferences below: a theme is judged by looking
 * at it, so choosing one applies it immediately to the page you are standing
 * on. A preview that needs a round trip through Save is a preview of nothing.
 *
 * The swatches are the theme's real paper / ink / accent values, so the choice
 * is legible before it is made — and each card paints itself in its own theme
 * via `data-theme`, which is the same mechanism the whole app uses. That makes
 * the card an honest sample rather than a hand-drawn approximation that can
 * drift from the stylesheet.
 */
function Appearance() {
  const theme = useTheme()
  return (
    <section className="mt-5 rounded-xl border border-hairline bg-sheet p-5 shadow-sm">
      <h2 className="text-[1.02rem] font-bold text-brand">Appearance</h2>
      <p className="mt-1 text-[13px] leading-6 text-muted">
        Applies straight away and is remembered on this device. Drawings and exported
        PDFs are <strong>not</strong> themed — a report keeps its own ink whichever
        theme you work in.
      </p>

      <fieldset className="mt-4">
        <legend className="sr-only">Interface theme</legend>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {THEMES.map((t) => {
            const active = t.id === theme
            return (
              <label key={t.id} data-theme={t.id}
                className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-left transition-colors ${
                  active ? 'border-brand ring-2 ring-brand' : 'border-hairline hover:border-brand-line'
                } bg-sheet`}>
                <input type="radio" name="theme" value={t.id} checked={active}
                  onChange={() => setTheme(t.id)} className="sr-only" />
                <span aria-hidden="true" className="mt-0.5 flex h-9 w-9 flex-none overflow-hidden rounded-md border border-hairline">
                  {t.swatch.map((c) => (
                    <span key={c} className="h-full flex-1" style={{ background: c }} />
                  ))}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span className="text-[13px] font-bold text-ink">{t.name}</span>
                    {active && <span className="font-mono text-[9.5px] font-semibold uppercase tracking-wide text-brand">current</span>}
                  </span>
                  <span className="mt-0.5 block text-[11.5px] leading-5 text-muted">{t.blurb}</span>
                </span>
              </label>
            )
          })}
        </div>
      </fieldset>
    </section>
  )
}

function ToolPreferences() {
  const prefs = useToolPrefs()
  const [chosen, setChosen] = useState<ReadonlySet<string>>(() => chosenFromPrefs(prefs, CHOOSABLE_GROUPS))
  const [saved, setSaved] = useState(false)

  const toggle = (label: string) => {
    setChosen((s) => {
      const next = new Set(s)
      if (!next.delete(label)) next.add(label)
      return next
    })
    setSaved(false)
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setToolPrefs(prefsFromChosen(chosen, CHOOSABLE_GROUPS))
    setSaved(true)
  }

  const none = chosen.size === 0
  const all = chosen.size === CHOOSABLE_GROUPS.length

  return (
    <form onSubmit={submit} className="mt-5 rounded-xl border border-hairline bg-sheet p-5 shadow-sm">
      <h2 className="text-[1.02rem] font-bold text-brand">Tools you use</h2>
      <p className="mt-1 text-[13px] leading-6 text-muted">
        The home page and the sidebar show the disciplines you tick. <strong>Nothing is removed</strong> —
        unticked tools keep working, stay reachable by link, and still turn up in ⌘K search.
      </p>

      <div className="mb-3 mt-4 flex items-center justify-between gap-3">
        <span className="text-[12px] font-semibold text-muted">
          {chosen.size} of {CHOOSABLE_GROUPS.length} selected
        </span>
        <button type="button"
          onClick={() => { setChosen(all ? new Set() : new Set(CHOOSABLE_GROUPS)); setSaved(false) }}
          className="text-[12px] font-semibold text-brand hover:underline">
          {all ? 'Clear all' : 'Select all'}
        </button>
      </div>

      <DisciplinePicker chosen={chosen} onToggle={toggle} />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={none}
          className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-on-solid hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50">
          Save
        </button>
        {saved && <span role="status" className="text-[13px] font-medium text-ok">Saved</span>}
        {none && (
          <span className="text-[13px] font-medium text-warn">
            Pick at least one — hiding everything would leave nothing to navigate.
          </span>
        )}
      </div>

      <p className="mt-4 border-t border-hairline-2 pt-3 text-[12px] leading-5 text-muted">
        Stored in this browser, like the letterhead below. A different computer starts with the
        full catalog and asks again.
      </p>
    </form>
  )
}

/**
 * "Manage subscription" — the way out.
 *
 * Shown to anyone on a paid plan, and it opens Paddle's portal, where the
 * cancel button lives alongside invoices and card details. When the session
 * carries a direct cancellation link, that is offered as a second, plainly
 * labelled button: making somebody hunt for the exit is a dark pattern, and it
 * costs more in support mail than the subscription is worth.
 *
 * The session is minted per click and never held, because a portal URL is
 * single-use and expires.
 */
function ManageSubscription() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cancelUrl, setCancelUrl] = useState<string | null>(null)

  const open = async () => {
    setBusy(true)
    setError(null)
    const r = await openPortalSession()
    setBusy(false)
    if (!r.ok) { setError(portalMessage(r.reason)); return }
    // Remembered only long enough to render the link on this screen; the
    // navigation below leaves the page anyway.
    setCancelUrl(r.cancelUrl)
    window.location.href = r.url
  }

  return (
    <div className="mt-4 border-t border-hairline-2 pt-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={open} disabled={busy}
          className="rounded-md border border-field-line px-3 py-1.5 text-[13px] font-semibold text-ink-2 hover:border-brand hover:text-brand disabled:opacity-60">
          {busy ? 'Opening…' : 'Manage subscription'}
        </button>
        {cancelUrl && (
          <a href={cancelUrl} className="text-[13px] font-semibold text-fail underline">
            Cancel subscription
          </a>
        )}
      </div>
      <p className="mt-2 text-[12px] leading-5 text-muted">
        Invoices, payment method and cancellation are handled by Paddle, who processed the payment.
      </p>
      {error && <p role="alert" className="mt-2 text-[12px] leading-5 text-fail">{error}</p>}
    </div>
  )
}

/**
 * What this account has been charged.
 *
 * Renders NOTHING until there is something to show — no empty-state panel, no
 * "no transactions yet". An account that has never bought anything is being
 * told about a relationship it has not entered into, and an account whose
 * history failed to load is better served by the portal button directly above
 * than by an error about a list it did not ask for.
 *
 * Deliberately less than the portal: no downloads, no card changes. This is the
 * glance-able summary; the portal is the system of record, and the line at the
 * bottom says so.
 */
function BillingHistory() {
  const [rows, setRows] = useState<HistoryRow[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    void fetchBillingHistory().then((r) => {
      if (!live || !r.ok) return
      setRows(r.page.items)
      setHasMore(r.page.hasMore)
    })
    return () => { live = false }
  }, [])

  const more = async () => {
    setBusy(true)
    // Paddle paginates by cursor, so the last row on screen is the position.
    const r = await fetchBillingHistory(rows[rows.length - 1]?.id)
    setBusy(false)
    if (!r.ok) { setHasMore(false); return }
    setRows((prev) => [...prev, ...r.page.items])
    setHasMore(r.page.hasMore)
  }

  if (!rows.length) return null

  return (
    <div className="mt-4 border-t border-hairline-2 pt-4">
      <h3 className="text-[13px] font-bold text-ink-2">Billing history</h3>
      <ul className="mt-2 divide-y divide-hairline-2">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2 text-[13px]">
            <span className="text-muted">{rowDate(row.billedAt) || 'Not billed yet'}</span>
            <span className="flex items-baseline gap-3">
              <span className={needsAttention(row.status) ? 'text-[12px] font-semibold text-fail' : 'text-[12px] text-muted'}>
                {statusLabel(row.status)}
              </span>
              <span className="font-medium text-ink">{rowAmount(row)}</span>
            </span>
          </li>
        ))}
      </ul>
      {hasMore && (
        <button type="button" onClick={more} disabled={busy}
          className="mt-2 text-[12px] font-semibold text-brand underline disabled:opacity-60">
          {busy ? 'Loading…' : 'Show earlier payments'}
        </button>
      )}
      <p className="mt-2 text-[12px] leading-5 text-muted">
        Invoices to download are in the billing portal above.
      </p>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, hint }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string
}) {
  const id = `p-${label.toLowerCase().replace(/\W+/g, '-')}`
  return (
    <label htmlFor={id} className="flex flex-col text-sm">
      <span className="mb-1 font-medium text-ink-2">{label}</span>
      <input id={id} value={value} placeholder={placeholder} maxLength={120}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-field-line px-3 py-2 outline-none focus:border-brand" />
      {hint && <span className="mt-1 text-[11.5px] text-muted">{hint}</span>}
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
    <div className="mx-auto max-w-3xl px-5 py-10">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted">Account</p>
      <h1 className="mt-1 text-2xl font-bold text-brand">Profile</h1>

      {/* ── Account ── */}
      <section className="mt-6 rounded-xl border border-hairline bg-sheet p-5 shadow-sm">
        <h2 className="text-[1.02rem] font-bold text-brand">Account</h2>
        {!configured ? (
          <p className="mt-2 text-[13px] leading-6 text-muted">
            Sign-in is not set up on this deployment, so there is no account to show. The letterhead
            settings below still work — they are stored in this browser.
          </p>
        ) : user ? (
          <dl className="mt-3 space-y-2 text-[13px]">
            <div className="flex justify-between gap-4 border-b border-hairline-2 pb-2">
              <dt className="text-muted">Email</dt>
              <dd className="font-medium text-ink">{user.email ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-hairline-2 pb-2">
              <dt className="text-muted">Email verified</dt>
              <dd className={user.emailVerified ? 'font-medium text-ok' : 'font-medium text-warn'}>
                {user.emailVerified ? 'Yes' : 'Not yet — check your inbox'}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Plan</dt>
              <dd className="font-medium text-ink">
                {plan.name}
                {plan.priceMonthly ? (
                  <span className="text-muted"> · {formatUsd(priceFor(plan, 'monthly')!)}/month</span>
                ) : null}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-2 text-[13px] leading-6 text-muted">
            You are not signed in. <Link to="/signin" className="text-brand underline">Sign in</Link>{' '}
            or <Link to="/signup" className="text-brand underline">create an account</Link> to save
            projects. The letterhead settings below work either way.
          </p>
        )}

        {/* Offered on a paid plan only. `plan.priceMonthly` is 0 for Free and
            null for Guest, so neither is asked to manage a subscription that
            does not exist. */}
        {user && CHECKOUT_ENABLED && !!plan.priceMonthly && <ManageSubscription />}

        {/* Asked for on any signed-in account, because a lapsed subscriber is
            back on Free and still has payments worth seeing. It renders nothing
            when there are none. */}
        {user && CHECKOUT_ENABLED && <BillingHistory />}

        <p className="mt-3 text-[12px] leading-5 text-muted">
          {CHECKOUT_ENABLED
            ? <>Compare plans on the <Link to="/pricing" className="text-brand underline">Plans page</Link>.</>
            : <>Paid plans are not open for sign-up yet — see <Link to="/pricing" className="text-brand underline">Plans</Link> for what they include.</>}
        </p>
      </section>

      {/* ── Tools you use ── */}
      <Appearance />
      <ToolPreferences />

      {/* ── Letterhead ── */}
      <form onSubmit={submit} className="mt-5 rounded-xl border border-hairline bg-sheet p-5 shadow-sm">
        <h2 className="text-[1.02rem] font-bold text-brand">Calculation sheet letterhead</h2>
        <p className="mt-1 text-[13px] leading-6 text-muted">
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

        <div className="mt-4 rounded-lg border border-hairline bg-sheet-2 px-3.5 py-2.5">
          <p className="text-[10.5px] font-semibold uppercase tracking-widest text-muted">Sheet preview</p>
          <p className="mt-1 font-mono text-[13px] text-ink">
            Prepared by: {preview || <span className="text-faint">(not set)</span>}
          </p>
          <p className="font-mono text-[13px] text-ink">
            Project: {form.defaultProject.trim() || <span className="text-faint">(not set)</span>}
          </p>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button type="submit"
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-on-solid hover:bg-brand-hover">
            Save
          </button>
          {saved && <span role="status" className="text-[13px] font-medium text-ok">Saved</span>}
        </div>

        <p className="mt-4 border-t border-hairline-2 pt-3 text-[12px] leading-5 text-muted">
          <strong>These are stored in this browser, not in your account.</strong> They follow the
          device rather than the login, so a different computer starts blank and clearing site data
          clears them. That is deliberate: the same account field carries your subscription plan, and
          a page that could write to it is a page that could try to grant itself one.
        </p>
      </form>
    </div>
  )
}
