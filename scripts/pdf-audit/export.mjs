// Export the calculation PDF of every standalone calculator → <out>/<route>.pdf
//   node scripts/pdf-audit/export.mjs <routes.txt> <outDir>     (dev server on :5192)
// A route without an "Export PDF report" button is listed as `none` and skipped.
import { chromium } from '../showreel/node_modules/playwright/index.mjs'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
const [,, list, out] = process.argv
mkdirSync(out, { recursive: true })
const routes = readFileSync(list, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean)
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader'] })
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
await ctx.addInitScript(() => { try { localStorage.setItem('civeng-guide-seen', JSON.stringify({ model: true, 'model-space': true, schedule: true, modelSpace: true })) } catch {} })
const log = []
for (const r of routes) {
  const p = await ctx.newPage()
  const name = r.replace(/^\//, '').replace(/\//g, '_') || 'home'
  try {
    await p.goto('http://localhost:5192' + r, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await p.waitForTimeout(3500)
    const btn = p.getByRole('button', { name: /Export PDF report/ }).first()
    if (!(await btn.count())) { log.push([r, 'none']); await p.close(); continue }
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 90000 }), btn.click()])
    await dl.saveAs(`${out}/${name}.pdf`)
    log.push([r, 'ok'])
  } catch (e) { log.push([r, 'error: ' + String(e.message).split('\n')[0].slice(0, 120)]) }
  await p.close()
  console.log(log.at(-1).join('  '))
}
writeFileSync(`${out}/_log.json`, JSON.stringify(log, null, 1))
await b.close()
