# Zeta — social set 2: Facebook cover and posts

A new Facebook cover, `00-cover.png` (1640×924), plus eight 1080×1350 feed posts (4:5, for Facebook, Instagram and LinkedIn). `07-quiz` and `08-answer` are a two-slide carousel.

Everything on the cover and posts is real app output:
- **From one Model Space session** (3×2 bays, 8 storeys, `scripts/showreel/capx.mjs`): the 3D viewport, the STAAD `.std` deck and the Excel workbook.
- **From the calculators:** the PDF pages are their own exports, rasterised; the drawing, equations and check cards are the calculator captures.

Regenerate with this sequence (needs the dev server on :5192 for the capture):
```bash
cd scripts/showreel
node capx.mjs                                   # Model Space → cap/x (viewport, .std, .xlsx)
cd social
python3 prep2.py && python3 build2.py && node render2.mjs
```

The PDF pages go in `cap/x/pdf/`, exported from `/beam-design`, `/foundation` and `/retaining-wall` and rasterised at 144 dpi.

**What is free, so captions never overstate it** (`webapp/src/lib/plans.ts`):
- Every standalone calculator is free.
- A guest gets 5 runs per calculator.
- A free account gets unlimited runs.
- 3D Model Space, the design pipeline, the Excel and STAAD exchange, and estimating are on **Pro**.

Shared tag block (add to any post):
`#CivilEngineering #StructuralEngineering #NSCP2015 #EngineeringPH #CivilEngineeringPH`

---

## 00 — cover.png (Facebook cover, 1640×924 — 16:9)
**Why 16:9:**
- The Facebook mobile app shows the cover whole at about 16:9.
- On mobile, the page's profile picture is a large circle over the lower-left third, roughly r ≈ 370 px centred at (404, 742) in cover pixels. That was measured off a screenshot of the actual page.
- Desktop shows only the middle band, y ≈ 158–766.

**Layout:**
- Everything sits inside that desktop band.
- The lockup and the one-line headline sit above the circle.
- The feature list and the URL sit to the right of the circle.
- The artifacts are on the right.

Upload it as-is: no dragging needed. The 1640×624 version from the first pass is replaced.

**Cover description** (the text under the cover when it's clicked): Model it. Check it. Sign it. Zeta takes a structure from a 3D model to a drawing to a calc sheet you can sign, with every step shown and every clause cited. NSCP 2015 · ACI 318-14 · AISC 360-16. The calculators are free → zetastruct.app

## 01 — report.png
**Caption:** The calc sheet writes itself. 📄 Hit Export PDF report on any calculator and you get one file you can sign. It has:
- a design summary with the verdict
- the full worked solution, each step tied to its NSCP / ACI clause
- the drawing to scale
- the design diagrams
- a signature block

It comes out the same in every browser.

This is the isolated-footing sheet, 7 pages, straight from the app. Free at zetastruct.app/foundation
**Hashtags:** #CalcSheet #StructuralEngineering #FoundationDesign #NSCP2015 #EngineeringPH #CivilEngineering

## 02 — drawing.png
**Caption:** Drawn to the numbers, down to the bar. The footing plan draws the bottom mat the schedule quotes, 16⌀16 @ 150 each way. The d/2 punching perimeter is hatched, so you can see where two-way shear is checked. The section shows the 425 mm depth and the cover. Change an input and the drawing redraws as you type.
**Hashtags:** #RebarDetailing #FoundationDesign #PunchingShear #ReinforcedConcrete #ACI318 #CivilEngineering

## 03 — pipeline.png
**Caption:** One model, every deliverable. Build the frame in 3D Model Space (this one is 8 storeys, 108 nodes, 232 members), then:
- run the FEM and NSCP §208 seismic
- design the beams, columns, slabs and footings
- get framing plans, schedules, Excel tables and a STAAD.Pro deck

All from the same model. The solver runs in your browser, so there's nothing to install. Pro plan.
**Hashtags:** #StructuralAnalysis #FEM #SeismicDesign #BuildingDesign #NSCP2015 #EngineeringSoftware

## 04 — excel.png
**Caption:** Every table, one workbook. 📊 One click exports a Model Space run to Excel, 21 sheets: nodes, members, loads, combinations, displacements, support reactions, member end forces, envelopes, storey drift, seismic forces and the full RC schedules. Numbers come through as numbers, ready for your own checks.
**Hashtags:** #Excel #StructuralEngineering #EngineeringTools #DataExport #CivilEngineering #EngineeringPH

## 05 — staad.png
**Caption:** Zeta speaks STAAD.Pro. Export the model as a `.std` deck with joints, members, sections, supports, load cases and combinations, then open it in STAAD. Or import a STAAD deck into Zeta and keep working. This is the real file: 670 lines from an 8-storey frame.
**Hashtags:** #STAADPro #StructuralAnalysis #BIM #Interoperability #StructuralEngineering #CivilEngineering

## 06 — solution.png
**Caption:** No black boxes. This is the two-way (punching) shear step for the footing, as it appears in the app and the PDF:
- the perimeter b₀ = 4(c + d)
- Vu net of the soil reaction inside it
- φVc as the least of ACI's three expressions

It cites ACI 318-14 §22.6.5.2. Use it to check your hand calc, or to learn the method.
**Hashtags:** #WorkedSolution #PunchingShear #CEBoardExam #EngineeringStudents #ACI318 #LearnEngineering

## 07 + 08 — quiz.png → answer.png (carousel)
**Caption:** Quick check 🧮 The givens:
- P = 1000 kN, Pu = 1400 kN
- 400 mm square column, interior
- qa = 200 kPa
- f′c 28 MPa, fy 415 MPa
- ⌀16 bars, 75 mm cover

How thick does the footing need to be? Drop your answer in the comments, then swipe for the solution 👉

Run it yourself (free, no account needed) at zetastruct.app/foundation
**Hashtags:** #CEBoardExam #EngineeringStudents #FoundationDesign #PunchingShear #NSCP2015 #CivilEngineeringPH

**Pinned first comment** (post after a day of guesses): Answer: 425 mm. The depth is Dc = max(d for punching 333, d for beam shear 264, 150 minimum) + 75 cover + 16 bar = 424, rounded up to 425 mm. So two-way (punching) shear governs. Full worked solution, step 7: zetastruct.app/foundation
