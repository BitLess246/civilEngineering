// node still.mjs <reel.html> t1 t2 …  → frames/<slug>_<t>.png
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
const [,, html, ...ts] = process.argv
mkdirSync('frames', { recursive: true })
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--allow-file-access-from-files'] })
const p = await b.newPage({ viewport: { width: 1080, height: 1920 } })
p.on('pageerror', (e) => console.log('ERR', e.message))
p.on('console', (m) => { if (m.type() === 'error') console.log('CERR', m.text().slice(0, 200)) })
await p.goto('file://' + process.cwd() + '/' + html); await p.evaluate(() => document.fonts.ready)
// touch every face once (KaTeX loads its fonts on first use), then wait for them
await p.evaluate(() => { for (const t of [3, 6, 10, 14, 17.5, 21, 25, 28.5]) render(t) }); await p.evaluate(() => document.fonts.ready)
for (const t of ts.map(Number)) { await p.evaluate((t) => render(t), t); await p.screenshot({ path: `frames/${html.replace('.html', '')}_${t.toFixed(2)}.png` }) }
await b.close()
