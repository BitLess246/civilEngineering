import { Link } from 'react-router-dom'
import { SITE, businessName, addressLines, missingSiteFields } from '../lib/siteConfig'

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
    <footer className="no-print mt-12 border-t border-[#e3e1da] bg-white">
      <div className="mx-auto grid max-w-[1200px] gap-6 px-6 py-8 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-[13px] font-extrabold tracking-[.14em] text-[#0f1b2a]">CIVENG</span>
            <span className="text-[8.5px] font-semibold uppercase tracking-[.22em] text-[#7a7568]">Toolkit</span>
          </div>
          <p className="mt-2 text-[12px] leading-5 text-slate-500">
            Structural and geotechnical calculation software to NSCP 2015, ACI 318-14 and AISC 360-16.
          </p>
        </div>

        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Product</p>
          <ul className="mt-2 space-y-1 text-[12.5px]">
            <li><Link to="/pricing" className="text-slate-600 hover:text-[#0056b3]">Plans and pricing</Link></li>
            <li><Link to="/docs" className="text-slate-600 hover:text-[#0056b3]">Documentation</Link></li>
            <li><Link to="/validation" className="text-slate-600 hover:text-[#0056b3]">Validation</Link></li>
          </ul>
        </div>

        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Legal</p>
          <ul className="mt-2 space-y-1 text-[12.5px]">
            <li><Link to="/terms" className="text-slate-600 hover:text-[#0056b3]">Terms and Conditions</Link></li>
            <li><Link to="/privacy" className="text-slate-600 hover:text-[#0056b3]">Privacy Policy</Link></li>
            <li><Link to="/refunds" className="text-slate-600 hover:text-[#0056b3]">Refund Policy</Link></li>
            <li><Link to="/contact" className="text-slate-600 hover:text-[#0056b3]">Contact</Link></li>
          </ul>
        </div>

        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Contact</p>
          <address className="mt-2 space-y-0.5 text-[12.5px] not-italic leading-5 text-slate-600">
            {SITE.legalName.trim() && <div className="font-semibold text-slate-700">{SITE.legalName}</div>}
            {addr.map((l) => <div key={l}>{l}</div>)}
            <div>
              <a href={`mailto:${SITE.supportEmail}`} className="hover:text-[#0056b3]">{SITE.supportEmail}</a>
            </div>
            {SITE.supportPhone.trim() && <div>{SITE.supportPhone}</div>}
          </address>
        </div>
      </div>

      <div className="border-t border-[#eeece5]">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-4 gap-y-1 px-6 py-3 text-[11.5px] text-slate-500">
          <span>© {new Date().getFullYear()} {businessName()}. All rights reserved.</span>
          <span className="hidden sm:inline">·</span>
          <span>Prices in Philippine pesos.</span>
          <span className="hidden sm:inline">·</span>
          <span>
            Results are computed from your inputs and must be checked by a licensed engineer before
            construction use.
          </span>
          {incomplete && (
            <span className="rounded bg-red-50 px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-red-700">
              business details incomplete — see /contact
            </span>
          )}
        </div>
      </div>
    </footer>
  )
}
