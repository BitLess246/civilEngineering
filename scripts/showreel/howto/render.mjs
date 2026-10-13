// node render.mjs <reel.html> <t0> <t1> <out.mp4> [fps=60] [sub=2]  — vertical 1080×1920
// sub>1 averages sub-frames across a 180° shutter (motion blur), as the 16:9 reels do.
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
const [,, html, t0s, t1s, out, fpsS = '60', subS = '2'] = process.argv
const FPS = +fpsS, SUB = +subS
const FF = process.env.FFMPEG || 'ffmpeg'
const f0 = Math.round(+t0s * FPS), f1 = Math.round(+t1s * FPS)
const vf = SUB > 1 ? ['-vf', `tmix=frames=${SUB}:weights=${'1 '.repeat(SUB).trim()},select='not(mod(n\\,${SUB}))',setpts=N/(${FPS}*TB)`] : []
const ff = spawn(FF, ['-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS * SUB), '-i', '-', ...vf, '-r', String(FPS),
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '15', '-pix_fmt', 'yuv420p', out], { stdio: ['pipe', 'inherit', 'inherit'] })
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--allow-file-access-from-files'] })
const p = await b.newPage({ viewport: { width: 1080, height: 1920 } })
p.on('pageerror', (e) => console.log('ERR', e.message))
await p.goto('file://' + process.cwd() + '/' + html); await p.evaluate(() => document.fonts.ready)
// touch every face once (KaTeX loads its fonts on first use), then wait for them
await p.evaluate(() => { for (const t of [3, 6, 10, 14, 17.5, 21, 25, 28.5]) render(t) }); await p.evaluate(() => document.fonts.ready)
const T0 = Date.now()
for (let f = f0; f < f1; f++) {
  for (let k = 0; k < SUB; k++) {
    const t = (f + (SUB > 1 ? (k / (SUB - 1) - 0.5) * 0.5 : 0)) / FPS
    await p.evaluate((t) => render(Math.max(0, t)), t)
    const buf = await p.screenshot({ type: 'jpeg', quality: 95 })
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r))
  }
  if ((f - f0) % 120 === 0) console.log(out, f, ((Date.now() - T0) / 1000).toFixed(0) + 's')
}
ff.stdin.end(); await new Promise((r) => ff.on('close', r)); await b.close()
console.log('done', out, ((Date.now() - T0) / 1000).toFixed(0) + 's')
