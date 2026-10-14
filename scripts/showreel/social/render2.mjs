// node render2.mjs [name …]  → ../../../branding/social/v2/<nn>-<name>.png (cover 1640×624, posts 1080×1350)
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
const out = new URL('../../../branding/social/v2/', import.meta.url).pathname
mkdirSync(out, { recursive: true })
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--allow-file-access-from-files'] })
const p = await b.newPage({ viewport: { width: 1080, height: 1350 } })
p.on('pageerror', (e) => console.log('ERR', e.message))
await p.goto('file://' + process.cwd() + '/posts2.html'); await p.evaluate(() => document.fonts.ready)
const { names, sizes } = await p.evaluate(() => ({ names: window.NAMES, sizes: window.SIZES }))
const want = process.argv.slice(2)
for (const [i, n] of names.entries()) {
  if (want.length && !want.includes(n)) continue
  const [w, h] = sizes[n] ?? [1080, 1350]
  await p.setViewportSize({ width: w, height: h })
  // twice: KaTeX's fonts load on first use, so the first pass measures fallback glyphs
  await p.evaluate((n) => window.show(n), n); await p.evaluate(() => document.fonts.ready)
  await p.evaluate((n) => window.show(n), n)
  await p.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))))
  await p.waitForTimeout(200)
  await p.screenshot({ path: `${out}${String(i).padStart(2, '0')}-${n}.png` })
  console.log('wrote', n)
}
await b.close()
