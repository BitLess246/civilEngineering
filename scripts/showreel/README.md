# Zeta showreel — 60 s, 1920×1080, 60 fps

The rendered cut lives at [`docs/media/zeta-showreel.mp4`](../../docs/media/zeta-showreel.mp4)
(the web encode, ~27 MB). This folder is the pipeline that makes it: every
frame is rendered deterministically from a single HTML timeline driven by
`render(t)`, and every visual in it is captured from the running app — the
3D viewport, the schedules, the worked-solution equations, the plan sheets,
the connection details and the FE plate contours — then animated as
separate components rather than shown as screenshots.

## Structure

| Bars | Time | Section | What moves |
|---|---|---|---|
| 1–2 | 0–4 s | Open | crosshair, grid, the logo drawn stroke by stroke |
| 3–4 | 4–8 s | Title | impact on the amber node, wordmark, the tagline a beat a line |
| 5–7 | 8–14 s | 01 Geometry | live isometric frame build → the real ribbon + grid panel, cursor press → keyed 3D orbit |
| 8–9 | 14–18 s | 02 Loading | D/L/E/W stamps, lateral-force diagram, E cases, the response spectrum drawn on |
| 10–12 | 18–24 s | 03 Analysis | damped sway (duotone), stress contour with snap zooms, triptych |
| 13–17 | 24–34 s | 04 Design | 54 failed → the optimizer → all passed; equation cascade; "every number, defensible"; frame elevation drawn on |
| 18–20 | 34–40 s | 05 Detailing | MF1 detail, tab + gusset FE contours band by band |
| 21–24 | 40–48 s | 06 Drawings & report | framing plan, the sheet wall, 97 sheets → signed PDF, the workflow strip |
| 25–27 | 48–54 s | 07 108 tools | the tool wall, 108 / 16 / 3, validation rows |
| 28–30 | 54–60 s | Lift + end | flash montage → amber point → lockup, zetastruct.app |

The score (`music.py`) is synthesized in numpy at 120 BPM — 30 bars, exactly
60 s — and writes `audio/beatmap.json`; cuts sit on bar downbeats and the three
impacts (4 s, 26 s, 56 s) carry flashes and camera shake. Colour is the
drafting theme (ink navy, paper, drafting blue); the logo's amber node is the
only glow. Displacement contours are recoloured to a brand duotone
(`duotone.py`); the FEA jet ramp is kept only for stress.

## Rebuild

Requirements: Python 3 with numpy + Pillow, Node 20+, Playwright resolvable from
this folder (`npm i playwright` here, or symlink a `node_modules` that has it),
a Chromium (`CHROME=/path/to/chrome`, defaults to the cloud image's), and ffmpeg
(`FFMPEG=/path/to/ffmpeg`).

```bash
# 1. serve the app with no auth gate (from webapp/)
VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npx vite --port 5192   # or APP=<url>

# 2. capture (from this folder) — RC model, design + optimizer, plans, steel, home/validation
node cap1.mjs && node cap2.mjs && node cap3.mjs && node cap4.mjs

# 3. assets
python3 key.py          # key the viewport background out of the 3D frames
python3 prep_assets.py  # fonts, tool catalogue, downscale, equation boxes, SVGs, grain
python3 duotone.py      # displacement frames → brand duotone
python3 music.py        # the score + beat map

# 4. timeline, stills, render
python3 build.py                                  # → reel.html
node still.mjs 4.05 26.6 57.9                     # spot-check frames → frames/
for i in 0 1 2 3; do node render.mjs $((i*15)) $((i*15+15)) out/final_$i.mp4 60 1 2 & done; wait
#   (60 fps, DPR 1, 2 sub-frames over a 180° shutter = motion blur)
printf "file 'final_0.mp4'\nfile 'final_1.mp4'\nfile 'final_2.mp4'\nfile 'final_3.mp4'\n" > out/list.txt
ffmpeg -f concat -safe 0 -i out/list.txt -i audio/score.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -shortest out/zeta-showreel.mp4
```

A full render is ~15–17 min across four workers on a 4-core box. The master
(CRF 15) is ~76 MB; the committed copy is a two-pass 3.4 Mb/s encode.

Everything generated (`cap/ svg/ key/ assets/ audio/ frames/ out/ reel.html`)
is gitignored; only the sources and the fonts (Archivo and IBM Plex Mono, both
OFL) are committed.
