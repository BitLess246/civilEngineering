// PNG exports of the brand art (run brand.py first):
//   node scripts/brand/render.mjs     (Playwright resolvable; CHROME= to point at a Chromium)
// Transparent PNGs for the logo files; app icons on the ink tile, because iOS
// and Android fill transparency with black or white of their own choosing.
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
const root = new URL('../../', import.meta.url).pathname
const svg = (f) => readFileSync(root + f, 'utf8')
const INK = '#0f1b2a', PAPER = '#f4f3ef'
mkdirSync(root + 'branding/png', { recursive: true })

// [out, svgFile, width, height, background | null, inset (fraction of the short side)]
const jobs = [
  ['branding/png/zeta-mark-1024.png', 'branding/zeta-mark.svg', 1024, 1024, null, 0],
  ['branding/png/zeta-logo-ink-2400.png', 'branding/zeta-logo-ink.svg', 2400, 0, null, 0],
  ['branding/png/zeta-logo-paper-2400.png', 'branding/zeta-logo-paper.svg', 2400, 0, null, 0],
  ['branding/png/zeta-lockup-ink-2400.png', 'branding/zeta-lockup-ink.svg', 2400, 0, null, 0],
  ['branding/png/zeta-lockup-paper-2400.png', 'branding/zeta-lockup-paper.svg', 2400, 0, null, 0],
  ['branding/png/zeta-avatar-ink-1080.png', 'branding/zeta-mark.svg', 1080, 1080, INK, 0.2],
  ['branding/png/zeta-avatar-paper-1080.png', 'branding/zeta-mark.svg', 1080, 1080, PAPER, 0.2],
  ['webapp/public/apple-touch-icon.png', 'branding/zeta-mark.svg', 180, 180, INK, 0.16],
  ['webapp/public/icon-192.png', 'branding/zeta-mark.svg', 192, 192, INK, 0.14],
  ['webapp/public/icon-512.png', 'branding/zeta-mark.svg', 512, 512, INK, 0.14],
  ['webapp/public/icon-maskable-512.png', 'branding/zeta-mark.svg', 512, 512, INK, 0.24],
  ['webapp/public/favicon-48.png', 'branding/zeta-mark.svg', 48, 48, null, 0],
]
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined })
for (const [out, file, w, h0, bg, inset] of jobs) {
  const src = svg(file)
  const [, vw, vh] = src.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)
  const h = h0 || Math.round((w * +vh) / +vw)
  const pad = Math.round(Math.min(w, h) * inset)
  const p = await b.newPage({ viewport: { width: w, height: h } })
  await p.setContent(`<html><body style="margin:0;background:${bg ?? 'transparent'}">
    <div style="width:${w}px;height:${h}px;display:flex;align-items:center;justify-content:center">
    ${src.replace(/width="[\d.]+" height="[\d.]+"/, `width="${w - 2 * pad}" height="${h - 2 * pad}"`)}</div></body></html>`)
  await p.screenshot({ path: root + out, omitBackground: !bg })
  await p.close()
  console.log('wrote', out, `${w}×${h}`)
}
await b.close()
