// node tools/render-posters.mjs [id …]  → assets/<nn>-<name>.png at 1080×1920 (9:16).
// Needs Playwright resolvable from here (npm i playwright) and a Chromium
// (CHROME=…; defaults to the cloud image's). Posters read only marketing/evidence.
import { chromium } from 'playwright'
const here = new URL('..', import.meta.url).pathname
const POSTERS = [['intro', '01-introducing-zeta'], ['model', '02-model-space'], ['concrete', '03-concrete-beam'], ['steel', '04-steel-beam'], ['deliver', '05-model-to-deliverable']]
const want = process.argv.slice(2)
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--allow-file-access-from-files'] })
const p = await b.newPage({ viewport: { width: 1080, height: 1920 } })
p.on('pageerror', (e) => console.log('ERR', e.message))
for (const [id, name] of POSTERS) {
  if (want.length && !want.includes(id)) continue
  await p.goto(`file://${here}tools/posters.html?p=${id}`)
  await p.evaluate(() => document.fonts.ready)
  await p.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))))
  await p.waitForTimeout(300)
  // nothing may spill out of the safe zone or off the canvas
  const spill = await p.evaluate((id) => {
    const root = document.getElementById(id), safe = root.querySelector('.safe').getBoundingClientRect()
    return [...root.querySelectorAll('.safe > *')].filter((el) => el.getBoundingClientRect().bottom > safe.bottom + 1).map((el) => el.className || el.tagName)
  }, id)
  if (spill.length) console.log(`  ${id}: overflows the safe zone →`, spill)
  await p.screenshot({ path: `${here}assets/${name}.png` })
  console.log('wrote', name)
}
await b.close()
