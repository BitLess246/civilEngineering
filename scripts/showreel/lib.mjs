import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
// the brand fonts, inlined as data URIs so captured pages never reach a font CDN
const FONTS = readFileSync(new URL('./fonts/fonts.css', import.meta.url), 'utf8').replace(/url\(([0-9]+\.woff2)\)/g,
  (_, f) => `url(data:font/woff2;base64,${readFileSync(new URL('./fonts/' + f, import.meta.url)).toString('base64')})`)
export async function open({ w = 1600, h = 1000, dpr = 2 } = {}) {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] })
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr })
  await ctx.addInitScript((fonts) => {
    try {
      localStorage.setItem('civeng-theme', 'drafting')
      localStorage.setItem('civeng-tool-prefs', JSON.stringify({ chosen: null }))
      localStorage.setItem('civeng-guide-seen', JSON.stringify({ model: true, 'model-space': true, schedule: true, modelSpace: true }))
    } catch {}
    const add = () => { const s = document.createElement('style'); s.textContent = fonts; document.head.appendChild(s) }
    if (document.head) add(); else document.addEventListener('DOMContentLoaded', add)
  }, FONTS)
  const p = await ctx.newPage()
  p.on('pageerror', (e) => console.log('ERR', e.message.slice(0, 200)))
  return { b, p }
}
export async function clean(p) {
  await p.addStyleTag({ content: '*{caret-color:transparent!important} ::-webkit-scrollbar{display:none} [aria-label*="chat" i]{display:none!important}' })
  await p.evaluate(() => {
    for (const el of document.querySelectorAll('button')) { const r = el.getBoundingClientRect(); if (r.width < 80 && r.height < 80 && r.right > innerWidth - 120 && r.bottom > innerHeight - 120) el.style.display = 'none' }
  })
  await p.evaluate(() => document.fonts.ready)
}
