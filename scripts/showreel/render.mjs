// node render.mjs <t0> <t1> <out.mp4> [fps=60] [dpr=1] [sub=1]
// sub>1 renders sub-frames across a 180° shutter and averages them (motion blur)
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
const [,, t0s, t1s, out, fpsS = '60', dprS = '1', subS = '1'] = process.argv
const FPS = +fpsS, DPR = +dprS, SUB = +subS
const FF = process.env.FFMPEG || 'ffmpeg'
const f0 = Math.round(+t0s * FPS), f1 = Math.round(+t1s * FPS)
const vf = SUB > 1 ? ['-vf', `tmix=frames=${SUB}:weights=${'1 '.repeat(SUB).trim()},select='not(mod(n\\,${SUB}))',setpts=N/(${FPS}*TB)`] : []
const ff = spawn(FF, ['-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS * SUB), '-i', '-', ...vf, '-r', String(FPS),
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '15', '-pix_fmt', 'yuv420p', out], { stdio: ['pipe', 'inherit', 'inherit'] })
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--allow-file-access-from-files'] })
const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: DPR })
p.on('pageerror', (e) => console.log('ERR', e.message))
await p.goto('file://' + process.cwd() + '/reel.html'); await p.evaluate(() => document.fonts.ready)
await p.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))))
const T0 = Date.now()
for (let f = f0; f < f1; f++) {
  for (let k = 0; k < SUB; k++) {
    // sub-frames span half the frame interval, centred on the frame time
    const t = (f + (SUB > 1 ? (k / (SUB - 1) - 0.5) * 0.5 : 0)) / FPS
    await p.evaluate((t) => render(Math.max(0, t)), t)
    const buf = await p.screenshot({ type: 'jpeg', quality: 95 })
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r))
  }
  if ((f - f0) % 120 === 0) console.log(out, f, ((Date.now() - T0) / 1000).toFixed(0) + 's')
}
ff.stdin.end(); await new Promise((r) => ff.on('close', r)); await b.close()
console.log('done', out, ((Date.now() - T0) / 1000).toFixed(0) + 's')
