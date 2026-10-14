import { open, clean } from '../lib.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'
const OUT = 'cap/tour/probe'; mkdirSync(OUT, { recursive: true })
const { b, p } = await open({ dpr: 1, w: 1600, h: 900 })
const tab = (n) => p.getByRole('button', { name: n, exact: true }).first()
const click = async (re, wait = 800) => { await p.getByRole('button', { name: re }).first().click(); await p.waitForTimeout(wait) }
const idle = async (t = 600000) => { await p.waitForTimeout(800); await p.waitForFunction(() => !/⏳/.test(document.body.innerText), null, { timeout: t, polling: 1000 }); await p.waitForTimeout(1500) }
const setField = async (re, v) => { const el = p.getByLabel(re).first(); await el.fill(v); await el.press('Tab') }
const shot = async (n) => { await clean(p); await p.screenshot({ path: `${OUT}/${n}.png` }); console.log('shot', n) }
await p.goto('http://localhost:5192/model', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(7000)
await shot('00_open')
await tab('Geometry').click(); await p.waitForTimeout(600)
await setField(/Bays X/i, '6, 6, 6'); await setField(/Bays Z/i, '6, 6'); await setField(/Storey heights/i, '3.5, 3, 3, 3, 3, 3')
await shot('01_geom')
await click(/Regenerate grid model/, 5000); await shot('02_model')
await tab('Loading').click(); await p.waitForTimeout(900); await click(/Generate E cases$/, 4000); await shot('03_loading')
await tab('Analysis').click(); await p.waitForTimeout(700); await click(/Analyze \(3D FEM\)/, 1500); await idle(); await shot('04_analysis')
await tab('Display').click(); await p.waitForTimeout(900); await shot('05_display')
writeFileSync(`${OUT}/display_labels.json`, JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('label')].map((l) => l.innerText.trim()).filter(Boolean)), null, 1))
await tab('Modal').click(); await p.waitForTimeout(700); await click(/Run modal analysis/, 1500); await idle(); await shot('06_modal')
await tab('Design').click(); await p.waitForTimeout(700); await click(/Design structure/, 1500); await idle(); await shot('07_design')
await p.screenshot({ path: `${OUT}/07_design_full.png`, fullPage: true })
await tab('Plans').click(); await p.waitForTimeout(5000); await shot('08_plans')
await click(/^Exchange$/, 600); await shot('09_exchange'); await p.keyboard.press('Escape')
const pdf = p.getByRole('button', { name: /^PDF/ }).first()
console.log('pdf disabled', await pdf.isDisabled())
await b.close()
