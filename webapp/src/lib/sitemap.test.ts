import { describe, expect, it } from 'vitest'
import { ALL_TOOLS } from './tools'
import { isGated } from './trialQuota'
import { robotsTxt, sitemapRoutes, sitemapXml, SITE_ORIGIN } from './sitemap'

describe('sitemap', () => {
  const routes = sitemapRoutes()

  it('lists every public calculator in the catalogue — derived, so it cannot lag', () => {
    for (const t of ALL_TOOLS) if (!isGated(t.to)) expect(routes).toContain(t.to)
  })

  it('never points a crawler at a sign-in wall', () => {
    for (const r of routes) expect(isGated(r)).toBe(false)
    expect(routes).not.toContain('/model')
  })

  it('carries the landing, pricing and legal pages, each once', () => {
    for (const r of ['/', '/pricing', '/terms', '/privacy', '/refunds', '/contact']) expect(routes).toContain(r)
    expect(new Set(routes).size).toBe(routes.length)
  })

  it('is well-formed XML on the canonical origin', () => {
    const xml = sitemapXml()
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(xml.match(/<url>/g)?.length).toBe(routes.length)
    expect(xml).toContain(`<loc>${SITE_ORIGIN}/</loc>`)
    expect(xml).toContain(`<loc>${SITE_ORIGIN}/slope</loc>`)
    // every <loc> is a plain path on the origin — nothing that would need escaping
    const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1])
    expect(locs.length).toBe(routes.length)
    for (const l of locs) expect(l).toMatch(/^https:\/\/www\.zetastruct\.app\/[a-z0-9/-]*$/)
  })

  it('robots.txt allows crawling and names the sitemap', () => {
    expect(robotsTxt()).toBe(`User-agent: *\nAllow: /\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`)
  })
})
