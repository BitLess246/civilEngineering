// What search engines and link unfurlers are told about the site.
//
// The sitemap is DERIVED from the tool catalogue rather than kept by hand, so a
// calculator added to TOOL_CATEGORIES is listed the day it ships and one that is
// removed stops being advertised. vite.config.ts writes the two files into the
// build; sitemap.test.ts pins what they may and may not contain.
import { ALL_TOOLS } from './tools'
import { isGated } from './trialQuota'

/** The canonical origin. The apex redirects here, so links and the sitemap use it too. */
export const SITE_ORIGIN = 'https://www.zetastruct.app'

/** Pages that are not calculators but are worth finding. */
const PAGES = ['/', '/pricing', '/docs', '/validation', '/terms', '/privacy', '/refunds', '/contact']

/**
 * Every public route, once, sorted. Members-only routes are left out: a
 * crawler that follows them lands on the sign-in redirect, and a sitemap that
 * points at a login wall is a sitemap a search engine learns to distrust.
 */
export function sitemapRoutes(): string[] {
  const tools = ALL_TOOLS.map((t) => t.to).filter((r) => r.startsWith('/') && !isGated(r))
  return [...new Set([...PAGES, ...tools])].sort()
}

export function sitemapXml(origin = SITE_ORIGIN): string {
  const urls = sitemapRoutes().map((r) => `  <url><loc>${origin}${r === '/' ? '/' : r}</loc></url>`)
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`
}

export function robotsTxt(origin = SITE_ORIGIN): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`
}
