import { Link } from 'react-router-dom'
import { SITE, businessName, addressLines, missingSiteFields } from '../../lib/siteConfig'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-slate-100 py-3 sm:grid sm:grid-cols-[160px_1fr] sm:gap-4">
      <dt className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-[14px] leading-6 text-slate-800 sm:mt-0">{children}</dd>
    </div>
  )
}

const Unset = ({ what }: { what: string }) => (
  <span className="rounded bg-red-50 px-1 font-mono text-[12px] font-semibold text-red-700">
    [{what} not set]
  </span>
)

export default function Contact() {
  const missing = missingSiteFields()
  const addr = addressLines()
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Support</p>
      <h1 className="mt-1 text-2xl font-bold text-[#0056b3]">Contact us</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
        A real person reads these. If something is wrong with a calculation, tell us what you entered
        and what you expected — that is usually enough to reproduce it.
      </p>

      {missing.length > 0 && (
        <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] leading-6 text-red-900">
          <strong>Contact details incomplete.</strong> Missing: {missing.join(', ')}. Set them in{' '}
          <code className="rounded bg-white/70 px-1">webapp/src/lib/siteConfig.ts</code>.
        </div>
      )}

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <dl>
          <Row label="Business name">
            {SITE.legalName.trim()
              ? <><strong>{SITE.legalName}</strong>{' '}<span className="text-slate-500">trading as {SITE.tradeName}</span></>
              : <Unset what="registered business name" />}
          </Row>
          <Row label="Address">
            {addr.length > 1
              ? <address className="not-italic">{addr.map((l) => <div key={l}>{l}</div>)}</address>
              : <Unset what="registered business address" />}
          </Row>
          <Row label="Email">
            <a href={`mailto:${SITE.supportEmail}`} className="text-[#0056b3] underline">{SITE.supportEmail}</a>
          </Row>
          <Row label="Phone">
            {SITE.supportPhone.trim()
              ? <a href={`tel:${SITE.supportPhone.replace(/\s+/g, '')}`} className="text-[#0056b3] underline">{SITE.supportPhone}</a>
              : <Unset what="customer service number" />}
          </Row>
          <Row label="Support hours">{SITE.supportHours}</Row>
        </dl>
      </section>

      <h2 className="mt-8 text-[1.05rem] font-bold text-[#0056b3]">What to include</h2>
      <div className="mt-2 space-y-3 text-sm leading-6 text-slate-700">
        <p>
          <strong>A wrong or surprising result:</strong> the tool name, the inputs you used, and the
          number you expected. If you have a hand calculation, send it — that is the fastest possible
          bug report, and it is how several engine corrections have started.
        </p>
        <p>
          <strong>Billing:</strong> write from the address on the account and give the date and
          amount. See the <Link to="/refunds" className="text-[#0056b3] underline">Refund
          Policy</Link> for what we can do and how long it takes.
        </p>
        <p>
          <strong>Privacy requests</strong> — a copy of your data, a correction, or deletion — go to
          the same address. Your rights are set out in the{' '}
          <Link to="/privacy" className="text-[#0056b3] underline">Privacy Policy</Link>.
        </p>
      </div>

      <h2 className="mt-8 text-[1.05rem] font-bold text-[#0056b3]">Before you write</h2>
      <p className="mt-2 text-sm leading-6 text-slate-700">
        The <Link to="/docs" className="text-[#0056b3] underline">documentation</Link> explains every
        control on every page, and the{' '}
        <Link to="/validation" className="text-[#0056b3] underline">validation page</Link> shows the
        engine checked against closed-form results. If you are asking &ldquo;is this number
        right?&rdquo;, that page may answer it faster than we can.
      </p>

      <p className="mt-8 border-t border-slate-200 pt-4 text-[13px] text-slate-500">
        {businessName()} is a Philippine business. Our{' '}
        <Link to="/terms" className="text-[#0056b3] underline">Terms</Link>,{' '}
        <Link to="/privacy" className="text-[#0056b3] underline">Privacy Policy</Link> and{' '}
        <Link to="/refunds" className="text-[#0056b3] underline">Refund Policy</Link> apply to all
        use of the service.
      </p>
    </main>
  )
}
