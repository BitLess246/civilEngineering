// node still.mjs t1 t2 …  → frames/tour_<t>.png
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
mkdirSync('frames', { recursive: true })
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--allow-file-access-from-files'] })
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } })
p.on('pageerror', (e) => console.log('ERR', e.message))
await p.goto('file://' + process.cwd() + '/' + (process.env.HTML || 'tour.html')); await p.evaluate(() => document.fonts.ready)
await p.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))))
for (const t of process.argv.slice(2).map(Number)) { await p.evaluate((t) => render(t), t); await p.screenshot({ path: `frames/tour_${t.toFixed(2)}.png` }) }
await b.close()
