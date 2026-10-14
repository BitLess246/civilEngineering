// node render.mjs <t0> <t1> <out.mp4> [fps=30]  — 1920×1080 frames of tour.html
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
const [,, t0s, t1s, out, fpsS = '30'] = process.argv
const FPS = +fpsS, FF = process.env.FFMPEG || 'ffmpeg'
const f0 = Math.round(+t0s * FPS), f1 = Math.round(+t1s * FPS)
const ff = spawn(FF, ['-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', out], { stdio: ['pipe', 'inherit', 'inherit'] })
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--allow-file-access-from-files'] })
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } })
p.on('pageerror', (e) => console.log('ERR', e.message))
await p.goto('file://' + process.cwd() + '/' + (process.env.HTML || 'tour.html')); await p.evaluate(() => document.fonts.ready)
await p.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))))
for (let f = f0; f < f1; f++) {
  await p.evaluate((t) => render(t), f / FPS)
  const buf = await p.screenshot({ type: 'jpeg', quality: 93 })
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r))
}
ff.stdin.end(); await new Promise((r) => ff.on('close', r)); await b.close(); console.log('done', out)
