import { Link } from 'react-router-dom'
import { LegalLayout, Clause, Detail } from './LegalLayout'
import { SITE, businessName, addressOneLine } from '../../lib/siteConfig'

export default function Terms() {
  const name = businessName()
  return (
    <LegalLayout
      title="Terms and Conditions"
      subtitle={`The agreement between you and ${name} for use of the ${SITE.tradeName}.`}
    >
      <Clause n="1" title="Who you are contracting with">
        <p>
          The {SITE.tradeName} is operated by <strong><Detail value={SITE.legalName} what="registered business name" /></strong>,
          a business registered in the Philippines, with its registered address at{' '}
          <Detail value={addressOneLine()} what="registered business address" />.
        </p>
        <p>
          Contact: <a href={`mailto:${SITE.supportEmail}`} className="text-[#0056b3] underline">{SITE.supportEmail}</a>
        </p>
      </Clause>

      <Clause n="2" title="What this service is">
        <p>
          The {SITE.tradeName} is engineering calculation software. It performs structural and
          geotechnical calculations to Philippine and international design codes — NSCP 2015,
          ACI 318-14, AISC 360-16 and others named on each page — and produces calculation sheets
          from the inputs you supply.
        </p>
        <p>
          Most calculations run entirely in your own browser. Nothing you type into a calculator is
          sent to us unless you save a project to your account.
        </p>
      </Clause>

      <Clause n="3" title="Professional responsibility — read this one">
        <p>
          <strong>This software does not practise engineering, and it does not replace an engineer.</strong>{' '}
          Every result it produces is a computation from the inputs you gave it. It cannot know
          whether those inputs describe your structure, whether the code clause it applied is the
          right one for your situation, or whether the result is buildable.
        </p>
        <p>
          You are responsible for checking every result before it is used for construction. Under
          Philippine law, structural design must be prepared and sealed by a licensed Civil
          Engineer, and nothing produced here is sealed or certified. Where a calculation sheet
          carries your name, it carries it because you typed it in — not because we verified
          anything.
        </p>
        <p>
          We publish our engine benchmarks against hand calculations on the{' '}
          <Link to="/validation" className="text-[#0056b3] underline">validation page</Link> so you can
          judge the software for yourself. That page is open to everyone, and always will be.
        </p>
      </Clause>

      <Clause n="4" title="Accounts">
        <p>
          You may use the single-purpose calculators without an account, subject to a trial limit.
          An account removes that limit and allows saved projects. You are responsible for keeping
          your password secure and for activity under your account.
        </p>
        <p>
          You must give an email address you control. You may close your account at any time by
          writing to us; see the <Link to="/privacy" className="text-[#0056b3] underline">Privacy
          Policy</Link> for what happens to your data.
        </p>
      </Clause>

      <Clause n="5" title="Paid plans">
        <p>
          Paid plans are described on the <Link to="/pricing" className="text-[#0056b3] underline">Plans
          page</Link>, in Philippine pesos. Prices shown include any applicable taxes unless stated
          otherwise on that page.
        </p>
        <p>
          Subscriptions renew automatically at the end of each billing period until cancelled. You
          may cancel at any time; cancellation stops the next renewal and does not shorten the
          period you have already paid for. Refunds are governed by our{' '}
          <Link to="/refunds" className="text-[#0056b3] underline">Refund Policy</Link>.
        </p>
        <p>
          We may change prices. If we do, the new price applies from your next renewal, and we will
          tell you by email before it takes effect.
        </p>
      </Clause>

      <Clause n="6" title="Acceptable use">
        <p>You agree not to:</p>
        <ul className="list-inside list-disc space-y-1">
          <li>resell, sublicense or redistribute access to the service;</li>
          <li>attempt to circumvent plan limits, or share one account across a team;</li>
          <li>copy or extract the calculation engine for use outside this service;</li>
          <li>interfere with the service or attempt to gain access to other users&rsquo; data.</li>
        </ul>
      </Clause>

      <Clause n="7" title="Your content">
        <p>
          Models, projects and inputs you create remain yours. You grant us only the permission
          needed to store and display them back to you. We do not use your project data to promote
          the service or share it with third parties, except as described in the Privacy Policy.
        </p>
      </Clause>

      <Clause n="8" title="Availability">
        <p>
          We aim to keep the service available but do not guarantee uninterrupted access. We may
          suspend it for maintenance or for reasons outside our control. Because the calculators run
          in your browser, most of them keep working during a server outage.
        </p>
      </Clause>

      <Clause n="9" title="Limitation of liability">
        <p>
          To the extent permitted by Philippine law, our total liability arising from your use of the
          service is limited to the amount you paid us in the twelve months before the claim.
        </p>
        <p>
          We are not liable for construction cost, delay, rework, or loss arising from a design
          decision. That follows from clause 3: the engineering judgement is yours, and the
          responsibility that goes with it cannot be transferred to a calculator. Nothing here
          excludes liability that cannot be excluded by law, including for fraud.
        </p>
      </Clause>

      <Clause n="10" title="Ending the agreement">
        <p>
          You may stop using the service at any time. We may suspend or close an account that
          breaches these terms, and will explain why. If we close your account other than for a
          breach, we will refund the unused part of a prepaid period.
        </p>
      </Clause>

      <Clause n="11" title="Governing law">
        <p>
          These terms are governed by the laws of the Republic of the Philippines. Disputes are
          subject to the exclusive jurisdiction of the courts of{' '}
          <Detail value={SITE.address.city} what="business city" />, Philippines.
        </p>
      </Clause>

      <Clause n="12" title="Changes to these terms">
        <p>
          We may update these terms. Material changes will be announced by email or in the app at
          least 14 days before they take effect. Continuing to use the service after that means you
          accept the revised terms.
        </p>
      </Clause>
    </LegalLayout>
  )
}
