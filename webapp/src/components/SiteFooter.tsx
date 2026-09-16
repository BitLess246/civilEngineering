import { Link } from 'react-router-dom'
import { SITE, businessName, addressLines, missingSiteFields } from '../lib/siteConfig'
import { BRAND_MARK, BRAND_TAIL } from '../lib/brand'

/**
 * Public footer.
 *
 * Carries the business identity and the policy links on every page, which is
 * both what a customer expects to find and what a payment provider looks for
 * when reviewing a merchant site. Hidden in print — a calc sheet does not need
 * a refund policy on it.
 */
export function SiteFooter() {
  const addr = addressLines()
  const incomplete = missingSiteFields().length > 0
  return (
    <footer className="no-print mt-12 border-t border-hairline bg-sheet">
      {/* A DENSE COLOPHON, NOT A FOUR-COLUMN SITEMAP.
          Product / Legal / Contact columns over a hairline strip with a tiny
          copyright tail is the most-reproduced footer shape on the web, and
          this site has nine links — not a sitemap worth four columns. Every
          link, the business identity, the address and the disclaimer are all
          still here; they are set as one block that closes the page instead of
          cataloguing it. The legal links stay together and stay obvious, which
          is what a payment provider reviewing the site is looking for. */}
      <div className="mx-auto max-w-[1200px] px-6 py-8">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-[13px] font-extrabold tracking-[.14em] text-ink">{BRAND_MARK}</span>
          <span className="text-[8.5px] font-semibold uppercase tracking-[.22em] text-faint">{BRAND_TAIL}</span>
          <span className="text-[12px] leading-5 text-muted">
            Structural and geotechnical calculation software to NSCP 2015, ACI 318-14 and AISC 360-16.
          </span>
        </div>

        {/* One run of links. `min-h` keeps each a 24px pointer target
            (WCAG 2.5.8) without turning the run into a stack of buttons. */}
        <nav aria-label="Site" className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px]">
          {[
            ['/pricing', 'Plans and pricing'], ['/docs', 'Documentation'], ['/validation', 'Validation'],
            ['/terms', 'Terms and Conditions'], ['/privacy', 'Privacy Policy'],
            ['/refunds', 'Refund Policy'], ['/contact', 'Contact'],
          ].map(([to, label], i) => (
            <span key={to} className="inline-flex items-center gap-3">
              {i > 0 && <span aria-hidden="true" className="text-faint">·</span>}
              <Link to={to} className="inline-flex min-h-[24px] items-center text-muted hover:text-brand">{label}</Link>
            </span>
          ))}
        </nav>

        <address className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] not-italic leading-5 text-muted">
          {SITE.legalName.trim() && <span className="font-semibold text-ink-2">{SITE.legalName}</span>}
          {addr.map((l) => <span key={l}>{l}</span>)}
          <a href={`mailto:${SITE.supportEmail}`} className="inline-flex min-h-[24px] items-center hover:text-brand">{SITE.supportEmail}</a>
        </address>

        <p className="mt-3 max-w-[92ch] text-[11.5px] leading-5 text-faint">
          © {new Date().getFullYear()} {businessName()}. All rights reserved. Prices in Philippine pesos.
          Results are computed from your inputs and must be checked by a licensed engineer before
          construction use.
        </p>

        {incomplete && (
          <p className="mt-2 inline-block rounded bg-fail-tint px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-fail">
            business details incomplete — see /contact
          </p>
        )}
      </div>
    </footer>
  )
}
