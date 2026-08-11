import { Link } from 'react-router-dom'
import { LegalLayout, Clause, Detail } from './LegalLayout'
import { SITE, businessName, addressOneLine } from '../../lib/siteConfig'

export default function Privacy() {
  const name = businessName()
  return (
    <LegalLayout
      title="Privacy Policy"
      subtitle={`How ${name} handles your personal information, under the Data Privacy Act of 2012 (RA 10173).`}
    >
      <Clause n="1" title="Who controls your data">
        <p>
          The personal information controller is{' '}
          <strong><Detail value={SITE.legalName} what="registered business name" /></strong>, of{' '}
          <Detail value={addressOneLine()} what="registered business address" />.
        </p>
        <p>
          For any privacy question or request, write to{' '}
          <a href={`mailto:${SITE.supportEmail}`} className="text-[#0056b3] underline">{SITE.supportEmail}</a>.
        </p>
      </Clause>

      <Clause n="2" title="What we collect">
        <p><strong>If you use the calculators without an account:</strong> nothing that identifies you.
          The calculations run in your browser. A counter of how many times you have used each free
          tool is kept in your own browser&rsquo;s storage and is never sent to us — clearing your
          site data resets it.</p>
        <p><strong>If you create an account:</strong> your email address, your password (stored only
          as a cryptographic hash, never in readable form), a display name if you give one, and your
          subscription plan.</p>
        <p><strong>If you save a project:</strong> the model and inputs you chose to save.</p>
        <p><strong>If you pay:</strong> our payment provider processes your card or e-wallet details.
          <strong> We never see or store your card number.</strong> We receive only confirmation that
          a payment succeeded and which plan it was for.</p>
        <p><strong>Automatically:</strong> standard server logs from our hosting provider — IP
          address, browser type, pages requested — kept for security and troubleshooting.</p>
      </Clause>

      <Clause n="3" title="Why we use it, and on what basis">
        <ul className="list-inside list-disc space-y-1">
          <li><strong>To provide the service</strong> — authenticate you, apply your plan, store your
            projects. Basis: performance of our contract with you.</li>
          <li><strong>To take payment</strong> — process subscriptions and issue receipts.
            Basis: contract, and our legal obligation to keep accounting records.</li>
          <li><strong>To keep the service secure</strong> — detect abuse and investigate faults.
            Basis: our legitimate interest in a working, un-abused service.</li>
          <li><strong>To contact you about the service</strong> — billing notices, security notices,
            material changes to these policies. Basis: contract.</li>
        </ul>
        <p>
          We do not sell your personal information, and we do not use your project data to train
          anything or to advertise to you.
        </p>
      </Clause>

      <Clause n="4" title="Who else processes it">
        <p>We use a small number of providers, each only for the purpose named:</p>
        <ul className="list-inside list-disc space-y-1">
          <li><strong>Supabase</strong> — accounts, authentication and saved projects.</li>
          <li><strong>Vercel</strong> — hosting and delivery of the website.</li>
          <li><strong>Xendit</strong> — payment processing. They are a separate controller of the
            payment details you give them; see their own privacy policy.</li>
        </ul>
        <p>
          Some of these store data on servers outside the Philippines. Where that happens, the
          transfer is covered by the provider&rsquo;s contractual data-protection commitments, as
          required by the Data Privacy Act.
        </p>
      </Clause>

      <Clause n="5" title="How long we keep it">
        <ul className="list-inside list-disc space-y-1">
          <li><strong>Account and project data</strong> — while your account is open, and for 30 days
            after you close it, so an accidental deletion can be undone.</li>
          <li><strong>Payment and billing records</strong> — for the period Philippine tax law
            requires records to be retained.</li>
          <li><strong>Server logs</strong> — a short rolling window, then discarded.</li>
        </ul>
      </Clause>

      <Clause n="6" title="Your rights under RA 10173">
        <p>As a data subject you have the right to:</p>
        <ul className="list-inside list-disc space-y-1">
          <li>be <strong>informed</strong> about how your data is processed;</li>
          <li><strong>access</strong> a copy of the personal data we hold about you;</li>
          <li>have inaccurate data <strong>corrected</strong>;</li>
          <li><strong>object</strong> to processing, or withdraw consent where consent is the basis;</li>
          <li>have your data <strong>erased or blocked</strong> in the circumstances the Act provides;</li>
          <li><strong>data portability</strong> — receive your data in a usable electronic format;</li>
          <li><strong>damages</strong> for a violation of your rights; and</li>
          <li>lodge a complaint with the <strong>National Privacy Commission</strong>.</li>
        </ul>
        <p>
          Write to <a href={`mailto:${SITE.supportEmail}`} className="text-[#0056b3] underline">{SITE.supportEmail}</a>{' '}
          to exercise any of these. We will respond within the period the Act allows.
        </p>
      </Clause>

      <Clause n="7" title="Security">
        <p>
          Passwords are hashed by our authentication provider and are never visible to us or stored
          in readable form. Traffic to the site is encrypted in transit. Access to production data is
          limited to what is needed to operate the service.
        </p>
        <p>
          No system is perfectly secure. If a breach occurs that is likely to put your rights at
          risk, we will notify you and the National Privacy Commission as the Act requires.
        </p>
      </Clause>

      <Clause n="8" title="Cookies and local storage">
        <p>
          We use browser storage for two things: keeping you signed in, and remembering your free-tool
          usage count. We do not use advertising or third-party tracking cookies.
        </p>
      </Clause>

      <Clause n="9" title="Children">
        <p>
          The service is intended for engineering professionals and students and is not directed at
          children under 13. We do not knowingly collect their personal information.
        </p>
      </Clause>

      <Clause n="10" title="Changes">
        <p>
          We will post any update here and change the date at the top. Material changes will also be
          sent by email. See also our{' '}
          <Link to="/terms" className="text-[#0056b3] underline">Terms</Link>.
        </p>
      </Clause>
    </LegalLayout>
  )
}
