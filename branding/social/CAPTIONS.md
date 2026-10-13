# Zeta — social posts: captions and hashtags

Thirteen 1080×1350 feed posts (4:5 — Facebook, Instagram, LinkedIn) in this folder, plus the three 30 s how-to reels in `docs/media/`. Every number on them is the app's own, captured from the live calculators: no invented metrics. Regenerate with `scripts/showreel/social` (`python3 build.py && node render.mjs`).

**What is free, so captions never overstate it** (`webapp/src/lib/plans.ts`):
- Every standalone calculator is free.
- A guest gets 5 runs per calculator.
- A free account gets unlimited runs and 3 saved projects.
- Pro is US$19/mo: 3D Model Space up to 400 members, the design pipeline, the optimiser, estimating, reports and PDF drawings.
- Max is US$49/mo: everything in Pro, plus nonlinear analysis and scheduling.

Shared tag block (add to any post):
`#CivilEngineering #StructuralEngineering #NSCP2015 #EngineeringPH #CivilEngineeringPH`

---

## 01 — brand.png
**Caption:** Structural engineering made clearer. Zeta is 108 calculators across 16 disciplines, built for NSCP 2015, ACI 318-14 and AISC 360-16, and every answer shows its work. Start at zetastruct.app.
**Hashtags:** #Zeta #StructuralEngineering #CivilEngineering #NSCP2015 #EngineeringSoftware #Philippines

## 02 — free.png
**Caption:** Every Zeta calculator is free. Try any of them five times without an account. Make a free account and the counter goes away, plus you can save three projects. Worked solutions and the PDF calc sheet come on every page, at no cost.
**Hashtags:** #FreeTools #CivilEngineering #EngineeringStudents #CEBoardExam #StructuralEngineering #EngineeringPH

## 03 — beam.png
**Caption:** Rectangular RC beam, checked in one screen: flexure Mu/φMn 0.95, shear Vu/φVn 0.80, bar spacing 0.67. The section drawing updates as you type, with strain and stress. Free at zetastruct.app/beam-design.
**Hashtags:** #ReinforcedConcrete #BeamDesign #ACI318 #NSCP2015 #StructuralDesign #CivilEngineering

## 04 — footing.png
**Caption:** Isolated footing from P, Pu and qa. You get the plan size, then two-way (punching) and one-way shear, then the minimum depth under §413.3.1.2, then the mat. Plan and section are drawn to the numbers. Free at zetastruct.app/foundation.
**Hashtags:** #FoundationDesign #Footing #PunchingShear #GeotechnicalEngineering #NSCP2015 #CivilEngineering

## 05 — wall.png
**Caption:** Cantilever retaining wall. It checks overturning (FS 3.98 ≥ 2.0), sliding (FS 1.76 ≥ 1.5) and bearing (80.2 kPa against qa 200), then designs the stem, toe and heel as cantilevers. The section is drawn to scale with the thrusts. Free at zetastruct.app/retaining-wall.
**Hashtags:** #RetainingWall #GeotechnicalEngineering #EarthPressure #Rankine #NSCP2015 #CivilEngineering

## 06 — solution.png
**Caption:** Every answer shows its work. Open the Calculations tab on any calculator and the worked solution is there: each step, its equation, and the clause it comes from. Use it to check your hand calc, or to learn the method.
**Hashtags:** #WorkedSolution #EngineeringStudents #CEBoardExam #StructuralEngineering #ACI318 #LearnEngineering

## 07 — validation.png
**Caption:** Checked against the hand calculation. Each engine has a closed-form benchmark (beam Mn, tied-column φPn,max, T-beam inertia, trimmer-bar length), and every benchmark runs in CI. Agreement on these is 0 %. See them all at zetastruct.app/validation.
**Hashtags:** #EngineeringValidation #QualityAssurance #StructuralEngineering #SoftwareTesting #CivilEngineering

## 08 — steel.png
**Caption:** Bolted shear tab to AISC 360-16. It checks bolt shear and bearing, tear-out, block shear §J4.3 and the tab welds §J2.4, and draws the connection as you size it. Free at zetastruct.app/bolted-connection.
**Hashtags:** #SteelDesign #AISC360 #SteelConnections #BoltedConnection #StructuralEngineering #CivilEngineering

## 09 — slope.png
**Caption:** Slope stability by the method of slices, with Fellenius, Bishop's simplified and Janbu over one set of slices. A grid search finds the critical circle (FS 2.04, Bishop). An infinite-slope check sits alongside it. Free at zetastruct.app/slope.
**Hashtags:** #SlopeStability #GeotechnicalEngineering #BishopMethod #SoilMechanics #CivilEngineering

## 10 — water.png
**Caption:** There are 22 water tools, and each comes with a worked solution. This one is the hydraulic jump: sequent depth, jump class, and the energy it dissipates, drawn on the channel. Free at zetastruct.app/hydraulic-jump.
**Hashtags:** #Hydraulics #OpenChannelFlow #WaterResources #FluidMechanics #CEBoardExam #CivilEngineering

## 11 — model.png
**Caption:** When a single member isn't enough: 3D Model Space. Generate the grid, apply NSCP load combinations with seismic and wind, and run the full design pipeline through to schedules, plans and take-off. It's on the Pro plan (US$19/mo); the calculators stay free.
**Hashtags:** #3DModeling #StructuralAnalysis #BuildingDesign #NSCP2015 #EngineeringSoftware #StructuralEngineering

## 12 — tools.png
**Caption:** 108 tools across 16 disciplines: concrete, steel, timber, foundations and geotechnical, water, transportation, surveying, planning, estimates, mathematics and more. Find any of them with ⌘K at zetastruct.app.
**Hashtags:** #CivilEngineering #EngineeringTools #CEBoardExam #EngineeringStudents #Philippines

## 13 — plans.png
**Caption:** Start free and scale to the whole building. Free gives you every calculator, unlimited. Pro (US$19/mo) adds 3D Model Space, the design pipeline, estimating and drawings. Max (US$49/mo) adds pushover, time history and construction scheduling. Annual billing saves 10 %.
**Hashtags:** #EngineeringSoftware #StructuralEngineering #CivilEngineering #ConstructionTech #EngineeringPH

---

## The three how-to reels (vertical, 30 s)

### howto-beam.mp4
**Caption:** How to design an RC beam in 30 seconds, for free:
1. Enter the section, materials and Mu/Vu.
2. Watch the section draw itself.
3. Read the flexure, shear and spacing checks.
4. Open Calculations for every equation and its clause.
5. Export the PDF calc sheet.

No account needed for 5 runs. → zetastruct.app/beam-design
**Hashtags:** #RCBeam #BeamDesign #StructuralEngineering #CivilEngineering #NSCP2015 #EngineeringReels

### howto-footing.mp4
**Caption:** Size an isolated footing in 30 seconds:
1. Enter the loads, column, soil and materials.
2. Get the plan and section, drawn to the numbers.
3. Read punching shear, beam shear and minimum depth.
4. Open the worked solution, from bearing area to the mat.
5. Export the calc sheet.

Free. → zetastruct.app/foundation
**Hashtags:** #FoundationDesign #Footing #GeotechnicalEngineering #CivilEngineering #EngineeringReels

### howto-wall.mp4
**Caption:** Check a cantilever retaining wall in 30 seconds:
1. Enter the geometry and soil.
2. See thrusts and base pressure drawn to scale.
3. Read overturning, sliding and bearing.
4. Follow Rankine to the factor of safety, step by step.
5. Export the sheet.

Free. → zetastruct.app/retaining-wall
**Hashtags:** #RetainingWall #GeotechnicalEngineering #CivilEngineering #EarthPressure #EngineeringReels
