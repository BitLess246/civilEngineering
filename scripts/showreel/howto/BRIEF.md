# Zeta how-to reels — brief

Three vertical reels, **30 s each, 1080×1920 at 60 fps**, for Reels, TikTok and Shorts. Each one teaches one standalone calculator, step by step, and says plainly what it costs.

| Reel | Calculator | Route | Plan |
|---|---|---|---|
| `howto-beam` | Rectangular RC Beam | `/beam-design` | **Free** |
| `howto-footing` | Isolated Footing | `/foundation` | **Free** |
| `howto-wall` | Cantilever Retaining Wall | `/retaining-wall` | **Free** |

**What "free" means, checked against `webapp/src/lib/plans.ts`.** Every standalone calculator is free.
- A guest (no account) gets 5 runs of each calculator.
- A free account gets unlimited runs and saves up to 3 projects.
- Worked solutions and the PDF calc sheet are included on every page.
- The one paid touchpoint on these pages is *From your saved project*, which loads members designed in 3D Model Space; Model Space is **Pro**.

The reels say "Free" and show the guest banner. They mention Pro only where that feature appears, and never imply the calculator itself needs a plan.

---

## The rules (as given, for every frame)

> Make a dynamic 15–30 second motion graphics video. Use real screenshots of the product, broken into components — fields, cards, drawings, equations — and animate those, not a screen recording. Brand palette and fonts only.
>
> **Not slop.** No neon cyberpunk, glowing brains, Matrix rain, lens flares, particle nebulae, or stock AI imagery.
>
> **Impressive, not cute.** Precise hairlines, high-contrast type, restrained colour, depth through lighting. Bloom only on the signal colour.
>
> **Dynamic.** Cut on downbeats, hit on kicks and snares, use strong eases (outExpo, inOutCubic, springs), hold then snap, and add sub-cuts inside plates.

How this pipeline meets them:
- **Real product.** Every field, check card, drawing and equation is rebuilt from `calculators/cap/calc/*.json`. That is a capture of the live app: field values, card values and utilisations, drawing SVGs with computed styles inlined, and the KaTeX of each worked-solution step. No mock UI and no invented numbers.
- **Palette.**
  - Ink `#0f1b2a`, paper `#f4f3ef`, brand `#0f4c92`, accent `#6ba4dc`.
  - Amber `#f2b53a` is the only colour that glows. It marks the step number and the signal point.
  - PASS green appears only on chips the app itself shows as green.
- **Type.** Archivo (display and UI), IBM Plex Mono (labels, values), and the outlined ZETA wordmark (`brandArt.js`).
- **Motion.**
  - 120 BPM, so 2 s bars. A step lands on each bar's downbeat, fields type on kicks, and PASS chips stamp on snares.
  - Plates spring in (`spring(2.2, .5)`), then *hold*, then *snap* out on `inExpo`.
  - Inside a plate, sub-cuts move the camera between the field, the drawing and the card on beats 2 and 4.

---

## Structure (all three reels; 15 bars at 120 BPM = 30 s)

| Bars | Time | Beat | What the viewer learns |
|---|---|---|---|
| 1 | 0–2 s | Hook | A one-line question in big type, e.g. "Design an RC beam in 30 seconds?" The FREE chip stamps on beat 3. |
| 2 | 2–4 s | Where | The calculator's title card and route (zetastruct.app/beam-design), plus the guest banner "5 free runs · no account needed". |
| 3–4 | 4–8 s | **Step 1 — Enter the inputs** | The real input fields type in on kicks. Section headings slide in first. |
| 5–6 | 8–12 s | **Step 2 — The drawing follows you** | The live drawing strokes on from the capture (section with strain and stress, plan and section, or wall with thrusts). A sub-cut lands on the dimensioned detail. |
| 7–8 | 12–16 s | **Step 3 — Read the checks** | Check cards rise; values count up; bars fill; PASS chips stamp on the snares. The governing ratio is called out. |
| 9–10 | 16–20 s | **Step 4 — Open Calculations** | The tab switches; worked-solution steps assemble atom by atom, each with its clause reference. |
| 11–12 | 20–24 s | **Step 5 — Export the calc sheet** | The Export PDF report button presses and a sheet stack fans out (title block, input summary, drawing). |
| 13 | 24–26 s | Also in this calculator | Feature chips on the beat: Auto-select bars · Multiple sections · §424.2 deflection · References tab · Load from a Model Space project (Pro). |
| 14–15 | 26–30 s | Plan + end | "FREE — 5 runs as a guest · unlimited with a free account", then the logo lockup unfolds from the amber point, then the URL. |

Feature chips per reel (bar 13):
- **Beam:** auto-selected bar ⌀ (optimiser) · single or multiple sections · §424.2 deflection when span and loads are given · strain and stress diagram · References tab · load from a saved Model Space project (Pro).
- **Footing:** square, rectangular or eccentric footings · design or analysis mode · two-way and one-way shear · §413.3.1.2 minimum depth · plan and section drawing · load from a saved Model Space project (Pro).
- **Wall:** overturning, sliding and bearing · stem, toe and heel designed as cantilevers · surcharge and base friction · section drawn to scale with thrusts · References tab.

## Captions (on screen, one line per bar, ≤ 6 words)

On-screen text is the step label (mono, amber number) plus one plain sentence (Archivo 800). The numbers on screen are the app's own: no invented metrics, no "10× faster".

## Sound

`music.py` synthesises a 30 s score in numpy. It shares the calculators reel's instruments, with a different key per reel (F♯m, Am, Em).
- Kicks run four to the floor from bar 3.
- The claps on 2 and 4 carry the PASS stamps.
- A riser feeds bar 14, and an impact plus sub drop land on the end card.
- `audio/<slug>.json` is the beat map the picture cuts to.

## Build

The reels reuse the calculators reel's captures (`../calculators/cap/calc/*.json`, turned into `../calculators/assets/` by its `prep.py`) and its component builders (`../calculators/src/comp.js`), so run that reel's capture and prep first if `assets/` is missing.

```bash
cd scripts/showreel/howto
ln -s ../node_modules node_modules                 # Playwright, as for the other reels
for r in beam footing wall; do python3 music.py $r; done   # audio/<slug>.wav + beat map
python3 build.py                                   # reel_<slug>.html, one per entry in reels.json
node still.mjs reel_beam.html 3.4 10.5 14.9 19.5   # spot-check frames → frames/
# render: 4 workers × 7.5 s, 60 fps, 2 sub-frames (180° shutter blur), then mux the score
for i in 0 1 2 3; do node render.mjs reel_beam.html $(echo "$i*7.5" | bc) $(echo "($i+1)*7.5" | bc) out/beam_$i.mp4 60 2 & done; wait
printf "file 'beam_0.mp4'\nfile 'beam_1.mp4'\nfile 'beam_2.mp4'\nfile 'beam_3.mp4'\n" > out/list.txt
ffmpeg -f concat -safe 0 -i out/list.txt -i audio/beam.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -shortest out/howto-beam-master.mp4
```

To add a calculator, add an entry to `reels.json`: its capture key, route, the hook lines, which fields, cards and worked-solution steps to show, and the feature chips. The timeline is generic. Every number on screen comes from the capture.
