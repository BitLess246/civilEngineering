import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { SITE, missingSiteFields } from '../../lib/siteConfig'

/**
 * Shared chrome for the public policy pages.
 *
 * The incomplete-config banner is the important part. These documents are
 * relied on by customers and reviewed by the payment provider, so a policy with
 * blank business details must SAY it is incomplete rather than render a
 * confident-looking page with holes in it.
 */
export function LegalLayout({ title, subtitle, children }: {
  title: string; subtitle?: string; children: ReactNode
}) {
  const missing = missingSiteFields()
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Legal</p>
      <h1 className="mt-1 text-2xl font-bold text-[#0056b3]">{title}</h1>
      {subtitle && <p className="mt-2 text-sm leading-6 text-slate-600">{subtitle}</p>}
      <p className="mt-1 text-[12px] text-slate-500">Last updated {SITE.policiesUpdated}</p>

      {missing.length > 0 && (
        <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] leading-6 text-red-900">
          <strong>This document is incomplete.</strong> The following business details have not been
          filled in yet, so the statements below that rely on them are unfinished:
          <ul className="mt-1.5 list-inside list-disc">
            {missing.map((m) => <li key={m}>{m}</li>)}
          </ul>
          <p className="mt-1.5">
            Set them in <code className="rounded bg-white/70 px-1">webapp/src/lib/siteConfig.ts</code> and
            redeploy. This notice disappears on its own once they are all present.
          </p>
        </div>
      )}

      <div className="prose-sm mt-6 space-y-5 text-[14px] leading-7 text-slate-700">{children}</div>

      <div className="mt-10 border-t border-slate-200 pt-5 text-[13px] text-slate-500">
        <p>
          These policies are drafts written for a Philippine software business. They are not legal
          advice and have not been reviewed by a lawyer. Have them checked before relying on them
          commercially — particularly the data-protection sections, which carry statutory duties
          under the Data Privacy Act.
        </p>
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          <Link to="/terms" className="text-[#0056b3] underline">Terms</Link>
          <Link to="/privacy" className="text-[#0056b3] underline">Privacy</Link>
          <Link to="/refunds" className="text-[#0056b3] underline">Refunds</Link>
          <Link to="/contact" className="text-[#0056b3] underline">Contact</Link>
          <Link to="/pricing" className="text-[#0056b3] underline">Plans</Link>
        </p>
      </div>
    </main>
  )
}

/** Numbered section heading, so clauses can be cited in an email. */
export function Clause({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <section id={`s${n}`}>
      <h2 className="mt-6 text-[15px] font-bold text-[#0f1b2a]">{n}. {title}</h2>
      <div className="mt-1.5 space-y-2">{children}</div>
    </section>
  )
}

/** A business detail that may not be filled in yet — never silently blank. */
export function Detail({ value, what }: { value: string; what: string }) {
  const v = value.trim()
  if (v) return <>{v}</>
  return (
    <span className="rounded bg-red-50 px-1 font-mono text-[12px] font-semibold text-red-700">
      [{what} not set]
    </span>
  )
}
