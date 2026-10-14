// Model Space → real exports for the social set: analyse + design the default
// grid model, then save the STAAD .std and the Excel workbook it produces, and
// shoot the viewport with the stress contour. → cap/x/
import { open, clean } from './lib.mjs'
import { writeFileSync } from 'node:fs'
const OUT = 'cap/x'
const { b, p } = await open({ dpr: 2 })
const tab = (n) => p.getByRole('button', { name: n, exact: true }).first()
const click = async (re, wait = 800) => { await p.getByRole('button', { name: re }).first().click(); await p.waitForTimeout(wait) }
const idle = async (t = 600000) => { await p.waitForTimeout(800); await p.waitForFunction(() => !/⏳/.test(document.body.innerText), null, { timeout: t, polling: 1000 }); await p.waitForTimeout(1500) }
const setField = async (re, v) => { const el = p.getByLabel(re).first(); await el.fill(v); await el.press('Tab') }
const exch = async (label, file) => {
  await click(/^Exchange$/, 500)
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.getByRole('menuitem', { name: label }).click()])
  await dl.saveAs(`${OUT}/${file}`); console.log('saved', file)
}
await p.goto((process.env.APP || 'http://localhost:5192') + '/model', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(7000); await clean(p)
await tab('Geometry').click(); await p.waitForTimeout(600)
await setField(/Bays X/i, '6, 6, 6'); await setField(/Bays Z/i, '6, 6'); await setField(/Storey heights/i, '3.5, 3, 3, 3, 3, 3, 3, 3')
await click(/Regenerate grid model/, 5000)
await tab('Loading').click(); await p.waitForTimeout(900); await click(/Generate E cases$/, 4000)
await tab('Design').click(); await p.waitForTimeout(700); await click(/Design structure/, 1500); await idle()
await clean(p)
await p.screenshot({ path: `${OUT}/full_design.png` })
await exch(/Export to STAAD/, 'model.std')
await exch(/Export tables to Excel/, 'model.xlsx')
const canvas = await p.evaluate(() => { const c = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0]; const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } })
await p.screenshot({ path: `${OUT}/canvas_design.png`, clip: canvas })
writeFileSync(`${OUT}/canvas.json`, JSON.stringify(canvas))
await b.close()
