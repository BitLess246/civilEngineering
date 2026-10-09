// Render og.html to webapp/public/og-image.png (1200×630) — the link-preview card.
//   node render.mjs        (Playwright resolvable from here; CHROME= to point at a Chromium)
import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--allow-file-access-from-files'] })
const p = await b.newPage({ viewport: { width: 1200, height: 630 } })
await p.goto(new URL('./og.html', import.meta.url).href)
await p.evaluate(() => document.fonts.ready)
await p.screenshot({ path: new URL('../../webapp/public/og-image.png', import.meta.url).pathname })
await b.close()
