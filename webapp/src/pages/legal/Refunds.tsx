import { Link } from 'react-router-dom'
import { LegalLayout, Clause, Detail } from './LegalLayout'
import { SITE, businessName } from '../../lib/siteConfig'

export default function Refunds() {
  const name = businessName()
  return (
    <LegalLayout
      title="Refund and Cancellation Policy"
      subtitle={`When ${name} refunds a subscription payment, and how to ask.`}
    >
      <Clause n="1" title="Try it before you pay">
        <p>
          Every single-purpose calculator is free to use — permanently, with an account, and for a
          number of trial runs without one. The{' '}
          <Link to="/validation" className="text-[#0056b3] underline">validation page</Link> shows our
          engine checked against hand calculations, and the{' '}
          <Link to="/docs" className="text-[#0056b3] underline">documentation</Link> covers every
          control.
        </p>
        <p>
          We would much rather you satisfied yourself that the software is right for you before
          paying than ask for your money back afterwards.
        </p>
      </Clause>

      <Clause n="2" title="14-day refund on a first subscription">
        <p>
          If you are unhappy with a paid plan, tell us within <strong>14 days</strong> of your first
          payment and we will refund it in full. You do not need to give a reason.
        </p>
        <p>
          This applies to your first payment on an account. Renewals are covered by clause 3.
        </p>
      </Clause>

      <Clause n="3" title="Renewals">
        <p>
          Subscriptions renew automatically. You can cancel at any time, and cancelling stops the
          next renewal while leaving you access for the period you have already paid for.
        </p>
        <p>
          <strong>If a renewal catches you by surprise</strong> — you meant to cancel and forgot, and
          you have not used the service since it renewed — write to us within 14 days of the charge
          and we will refund it. We would rather return the money than keep a payment somebody did
          not intend to make.
        </p>
        <p>
          Beyond that, renewal payments are not refundable for periods already used, since a
          subscription is access rather than goods.
        </p>
      </Clause>

      <Clause n="4" title="Annual plans">
        <p>
          Annual plans are covered by the same 14-day first-payment refund. After 14 days, if you
          cancel part-way through a year we do not refund the remainder as a matter of course — but
          if your circumstances have changed materially, ask. We will look at it.
        </p>
      </Clause>

      <Clause n="5" title="If something is broken">
        <p>
          The 14-day window does not limit your rights when the service does not do what we said it
          does. If a defect prevents you from using a feature you paid for and we cannot fix it in
          reasonable time, you are entitled to a refund for the affected period regardless of how
          long you have been a customer.
        </p>
        <p>
          Nothing in this policy limits your rights under the Consumer Act of the Philippines
          (RA 7394) or any other law.
        </p>
      </Clause>

      <Clause n="6" title="What is not refunded">
        <ul className="list-inside list-disc space-y-1">
          <li>Periods you have already used, outside the cases above.</li>
          <li>Accounts closed for a breach of the{' '}
            <Link to="/terms" className="text-[#0056b3] underline">Terms</Link>.</li>
          <li>Disappointment with a calculation result that the software produced correctly from the
            inputs given. Checking the inputs and the result is the engineer&rsquo;s responsibility —
            see clause 3 of the Terms.</li>
        </ul>
      </Clause>

      <Clause n="7" title="How to request a refund">
        <p>
          Email <a href={`mailto:${SITE.supportEmail}`} className="text-[#0056b3] underline">{SITE.supportEmail}</a>{' '}
          from the address on the account, saying which payment you mean. You do not need a form or a
          reference number — the date and amount is enough.
        </p>
        <p>
          You can also call <Detail value={SITE.supportPhone} what="customer service number" /> during{' '}
          {SITE.supportHours}.
        </p>
      </Clause>

      <Clause n="8" title="How long it takes">
        <p>
          We acknowledge refund requests within <strong>2 business days</strong> and approve or
          explain within <strong>7 business days</strong>.
        </p>
        <p>
          Approved refunds go back to the original payment method. How quickly the money appears is
          up to your bank or e-wallet provider — usually a few business days for e-wallets and up to
          one billing cycle for cards. We cannot speed that part up, but we can tell you the date we
          released it.
        </p>
      </Clause>

      <Clause n="9" title="Cancelling without a refund">
        <p>
          To simply stop future billing, cancel from your account or write to us. Cancellation is
          effective immediately for future renewals; you keep access until the end of the period you
          have paid for.
        </p>
      </Clause>
    </LegalLayout>
  )
}
