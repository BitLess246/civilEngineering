// render stills at given times: node still.mjs 1.0 4.2 6.8 ...
import { chromium } from 'playwright'
const times = process.argv.slice(2).map(Number)
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--allow-file-access-from-files'] })
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } })
p.on('pageerror', (e) => console.log('ERR', e.message))
p.on('console', (m) => { if (m.type() === 'error') console.log('CERR', m.text().slice(0, 200)) })
await p.goto('file://' + process.cwd() + '/reel.html'); await p.evaluate(() => document.fonts.ready)
await p.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))))
for (const t of times) {
  await p.evaluate((t) => render(t), t)
  await p.screenshot({ path: `frames/s_${t.toFixed(2)}.png` })
}
await b.close()
