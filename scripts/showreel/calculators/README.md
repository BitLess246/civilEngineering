# Zeta calculators reel — 60 s, 1920×1080, 60 fps

The rendered cut lives at [`docs/media/zeta-calculators-reel.mp4`](../../../docs/media/zeta-calculators-reel.mp4)
(the web encode, ~27 MB). The companion to the model-space reel one folder up:
this one is about the standalone calculators. Every component on screen —
input fields, result cards, drawing sheets, the worked solution's equations —
is captured from the running app as data and rebuilt so it can move on its
own: fields type in, cards count up and stamp, drawings stroke on, KaTeX
assembles atom by atom.

## Structure

| Bars | Time | Section | What moves |
|---|---|---|---|
| 1–2 | 0–4 s | Open | one field typed; the kick throws the camera back onto 99 real inputs; they fall into the amber point |
| 3–4 | 4–8 s | Title | the logo from the point; 108 rolls; "Every answer shows its work." |
| 5–7 | 8–14 s | 01 Concrete | beam → column → footing workspaces, whip-panned; a snap onto the strain/stress diagram; triptych |
| 8–9 | 14–18 s | 02 Steel | bolted, weld, W460 sheets in depth; the weld fails at 6 mm, is re-typed to 12, passes |
| 10–12 | 18–24 s | 03 Geotechnical | ten trial circles on the ticks, 3 476 counted, the critical circle on the downbeat; wall, pile, four sheets |
| 13 | 24–26 s | Break | "Every number has a clause." — a board of the solutions' clauses spins and lands |
| 14–16 | 26–32 s | 04 Water | "Water." on the impact; the jump fills left to right; tank, pipe, GVF; eight sheets on the 16ths |
| 17–19 | 32–38 s | 05 Roads · survey · economy | a plate a beat-half: traverse, curves, signal timing, cash flow, break-even (the crossing is amber), projectile |
| 20–22 | 38–44 s | 06 The work, shown | half time: the retaining-wall solution step by step, a lean onto FS = 3.98 ≥ 2.0, Export report, the pages fan |
| 23–25 | 44–50 s | 07 Every check | a tilted field of real result cards; snap flat onto one; "Pass or fail. Utilization. Clause." |
| 26–27 | 50–54 s | 08 108 tools | the catalogue as moving type; "slope" typed into the search; 108 |
| 28–30 | 54–60 s | Lift + end | 22 drawings on 16ths then 32nds; the lockup on the 56 s impact, zetastruct.app |

The score (`music.py`) is synthesized in numpy: 120 BPM, 30 bars, F♯ minor
(F♯m | D | A | E), a 3-against-4 arpeggio, half time under the worked
solution. Impacts sit at 4, 26 and 56 s as in the first reel. Colour is the
drafting theme; the logo's amber node and the break-even crossing are the only
glow.

Two calculators fail at their defaults (the steel beam's W310x38.7 and the
weld's 6 mm leg), so `cap.mjs` also captures them at inputs that pass
(W460x74, 12 mm) — both states are real app output, and the weld shows the
change on screen.

## Rebuild

Same requirements as the reel one folder up (Python 3 with numpy + Pillow,
Node 20+ with Playwright resolvable from `scripts/showreel/`, Chromium via
`CHROME`, ffmpeg via `FFMPEG`), plus `webapp/node_modules` installed — the
equations use the app's own KaTeX stylesheet and fonts.

```bash
# 1. serve the app with no auth gate (from webapp/)
VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npx vite --port 5192   # or APP=<url>

# 2. from this folder
node cap.mjs            # 44 calculator captures + the sidebar → cap/
python3 prep.py         # → assets/: calc.json, drawings.html, katex.css, tools.json, grain
python3 music.py        # → audio/score.wav + beatmap.json
python3 build.py        # → reel.html
node ../still.mjs 9.6 20.7 46.5     # spot-check frames → frames/
python3 sheet.py frames/sheet.png 9.6 20.7 46.5
mkdir -p out && for i in 0 1 2 3; do node ../render.mjs $((i*15)) $((i*15+15)) out/final_$i.mp4 60 1 2 & done; wait
printf "file 'final_0.mp4'\nfile 'final_1.mp4'\nfile 'final_2.mp4'\nfile 'final_3.mp4'\n" > out/list.txt
ffmpeg -f concat -safe 0 -i out/list.txt -i audio/score.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -shortest out/zeta-calculators-reel.mp4
```

A full render is ~14–15 min across four workers on a 4-core box. The master
(CRF 15) is ~80 MB and lives on the `media/calculators-reel-master` branch;
the committed copy is a two-pass 3.4 Mb/s encode.

Generated folders (`cap/ assets/ audio/ frames/ out/ reel.html`) are covered
by the parent `.gitignore`.
