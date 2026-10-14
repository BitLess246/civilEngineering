// Find a demo frame the design passes outright: geometry from argv, read every schedule's
// failure chip and the analysis-status rows (drift etc.) after Design and after Optimise.
import { open, clean } from '../lib.mjs'
const [,, bx = '6, 6, 6', bz = '6, 6', st = '3.5, 3, 3, 3', rounds = '2'] = process.argv
const { b, p } = await open({ dpr: 1, w: 1600, h: 900 })
p.setDefaultTimeout(180000)
const tab = (n) => p.getByRole('button', { name: n, exact: true }).first()
const click = async (re, wait = 800) => { await p.getByRole('button', { name: re }).first().click(); await p.waitForTimeout(wait) }
const idle = async () => { await p.waitForTimeout(800); await p.waitForFunction(() => !/⏳/.test(document.body.innerText), null, { timeout: 900000, polling: 1000 }); await p.waitForTimeout(1500) }
const setField = async (re, v) => { const el = p.getByLabel(re).first(); await el.fill(v); await el.press('Tab') }
const report = async (tag) => {
  const r = await p.evaluate(() => {
    const t = document.body.innerText
    const chips = [...document.querySelectorAll('h2,h3')].map((h) => { const m = h.parentElement?.innerText.match(/^(.{0,60}?schedule)[\s\S]{0,40}?(\d+) failed/i); return m ? `${m[1].trim()}: ${m[2]} failed` : null }).filter(Boolean)
    const drift = t.match(/drift[^\n]{0,120}/i)?.[0]
    const status = t.match(/(NOT ACCEPTABLE|ACCEPTABLE|ALL CHECKS PASS|design ok)[^\n]{0,80}/i)?.[0]
    const failedAll = [...t.matchAll(/(\d+) failed/g)].map((m) => m[0])
    const fails = [...document.querySelectorAll('tr')].filter((r) => /text-(red|fail)|bg-(red|fail)/.test(r.className) || getComputedStyle(r).color === 'rgb(194, 64, 42)').slice(0, 6).map((r) => r.innerText.replace(/\s+/g, ' ').slice(0, 220))
    const notes = (t.match(/[^\n]*(fails?|exceeds|not satisfied|inadequate)[^\n]*/gi) || []).slice(0, 8).map((x) => x.slice(0, 200))
    return { chips, drift, status, failedAll: [...new Set(failedAll)], fails, notes }
  })
  console.log(tag, JSON.stringify(r))
}
await p.goto('http://localhost:5192/model', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(7000); await clean(p)
await tab('Geometry').click(); await p.waitForTimeout(600)
await setField(/Bays X/i, bx); await setField(/Bays Z/i, bz); await setField(/Storey heights/i, st)
await click(/Regenerate grid model/, 4000)
await tab('Loading').click(); await p.waitForTimeout(900); await click(/Generate E cases$/, 3000)
await tab('Design').click(); await p.waitForTimeout(700); await click(/Design structure/, 1500); await idle()
await report('design')
for (let k = 0; k < +rounds; k++) { await p.evaluate(() => scrollTo(0, 0)); await click(/Optimi[sz]e design/, 1500); await idle(); await report('optimise' + (k + 1)) }
await b.close()
