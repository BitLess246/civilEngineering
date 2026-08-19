# Demo script — CivEngg Toolkit

A run-sheet for demonstrating the app end to end, live. Written to be followed
literally: every control named in **bold** is a real label read out of the
source, not a paraphrase. Where a control is described rather than named, it is
because the label is composed at runtime and you should read it off the screen.

**Total running time: ~22 minutes** for the full script, or ~9 minutes for the
Model Space act alone (§2), which is the one that sells it.

---

## 0 · Before you start — the five-minute setup that prevents a dead demo

| Check | Why |
|---|---|
| **Sign in on a Pro or Max account.** | `/model` and `/truss` are gated: signed-out visitors are redirected to `/signin`, and a Free account meets the upgrade page. Discovering this on a shared screen is the worst way to learn it. |
| Max, if you want §2.7 | Pushover and Nonlinear are Max-only. On Pro those tabs show the upgrade notice. |
| **A second browser profile, signed out** | For §5 only. Keep it in another window — do not sign out mid-demo. |
| Model saved beforehand | Build the demo model once, save it under **Projects**, and open it if anything goes wrong. A rebuild live is 90 seconds you will not want. |
| Zoom the browser to ~110% | The schedule tables are dense. |

**Say this once, at the top, and never again:** *"Everything you're about to see
runs in the browser. There's no install, and nothing leaves your machine unless
you save a project."*

---

## 1 · The opening (60 seconds)

Land on `/` and go straight to `/validation`.

> "Before I show you anything it computes, here's the page that says what's been
> checked. Every engine is unit-tested against hand calculations and closed-form
> solutions — 4,535 tests, and this page is generated from them."

**Why open here:** engineers discount demos. Leading with the validation page
buys you the next twenty minutes. Do not oversell it — say *tested against hand
calculations and closed-form solutions*, not *validated against ETABS*, which is
still an open item on the validation map.

---

## 2 · 3D Model Space — the main act (~9 minutes)

Go to `/model`. Point at the **tab bar** first.

> "These eleven tabs are a sequence, not a menu. Left to right is the order you'd
> actually do the work: geometry, properties, supports, loading, analysis, then
> design. The app won't let you design something it hasn't analysed."

### 2.1 Geometry — generate the frame (45 s)

On the **Geometry** tab, set the grid: bays in X, bays in Z, number of storeys,
storey height. Use **3 × 3 bays, 3 storeys** — big enough to look like a
building, small enough to solve instantly.

Press **Regenerate grid model**.

> "That's a complete space frame — nodes, columns, beams, and floor slabs — from
> four numbers."

Orbit the model once with the mouse. Don't linger; the 3D view is the hook, not
the product.

### 2.2 Properties — sections and materials (60 s)

**Properties** tab. Change a section — set the beams to a larger size, or switch
a family from concrete to steel.

Two things to say here, because both are differentiators:

> "Section properties feed the solver through a bridge layer, so cracked-section
> stiffness modifiers — ACI 318-14 §6.6.3.1.1, 0.35Ig for beams, 0.70 for
> columns — are applied here, once, and every downstream result inherits them.
> Shear deformation too."

### 2.3 Supports — what the ground carries (30 s)

**Supports** tab. Set the base nodes to fixed, then change one to pinned and back.

> "Fixed, pinned, roller, or springs if you're modelling soil stiffness."

### 2.4 Loading — dead, live, earthquake, wind (2 min) ⭐

This is the tab that wins the demo. Take your time.

**Dead and live** — press **↻ Rebuild D + L**.

> "Slab loads get distributed to the supporting beams by tributary area, not by
> you typing line loads."

**Earthquake** — press **⚡ Generate E cases**.

> "That's NSCP 2015 §208 static seismic. It builds the load cases in both
> directions, applies the ±5% accidental torsion from §208.7.2.7 as storey
> torques, and composes the 100%+30% orthogonal combinations from §208.8.1 —
> including the vertical component. That's a dozen load cases you didn't type."

**Wind** — press **▦ Compute C&C wall pressures**.

> "NSCP wind, components and cladding pressures on the wall surfaces."

### 2.5 Analysis (45 s)

Press **▶ Analyze** in the header.

While it runs:

> "Twelve-degree-of-freedom space frame, with member releases, rigid end zones,
> diaphragm constraints and P-Δ. The stiffness matrix is factorised once and
> reused across every load combination, which is why that took under a second."

Show the deflected shape and a force diagram.

### 2.6 Modal (45 s)

**Modal** tab.

> "Periods, mode shapes, and mass participation. NSCP §208.5.5 wants 90% —
> the app tells you when you haven't got it, rather than letting you file a
> response-spectrum run that doesn't qualify."

**Click a mode to see its shape** — it does not animate until you ask.

### 2.7 Pushover / Nonlinear — 30 s, Max plan only

Open the tab, show that it exists, move on. It is a credibility beat, not a
demo. On Pro, skip both tabs entirely rather than showing an upgrade wall.

### 2.8 Design — and the failures ⭐ (90 s)

Press **Design all**.

**Find a failing member and point at it.** If everything passes, go back to
**Properties**, drop the column size, and re-run. *A demo where everything
passes is a demo nobody believes.*

> "This is the part I want you to look at. It's not a pass/fail dot — every
> check reports its utilisation and the clause it came from. That column is at
> 1.7 on AISC §H1-1 combined loading, and it's failing because the check sees
> both bending axes and a real effective length factor, not K = 1.0."

### 2.9 Optimize (45 s)

Press **Optimize design**.

> "It searches sections and re-runs the checks until everything passes, then
> shows you what it changed and why in the optimisation log."

Re-run **Design all** and show the failures cleared.

### 2.10 The schedules — open one row of each ⭐⭐ (2 min)

Under **Design**, the results have three sub-tabs: **Schedules**, **Bill of
Quantities**, **Construction Schedule**. Start on **Schedules**.

Scroll through: **Column schedule**, **Slab schedule**, **Footing schedule**,
**Steel beam schedule**, **Steel column schedule**, **Steel connection
schedule**, and the RC beam schedule.

**Now the money moment. Click a row in each of these four — beam, column, slab,
footing — and let the worked solution expand:**

> "Every row opens. That's not a summary — it's the full step-by-step derivation
> with the clause numbers, the same thing you'd hand-write and staple to a
> submission. Four schedules, every row, every element."

Take the beam row slowly and read one or two lines aloud. Then click the column,
slab and footing rows in quick succession — the *repetition* is the point.

### 2.11 Bill of Quantities (30 s)

**Bill of Quantities** sub-tab.

> "Concrete by volume, steel by mass, formwork by area — taken off the designed
> members, not re-entered. The concrete class comes from the f′c you designed
> with."

### 2.12 Construction Schedule from the model (30 s)

**Construction Schedule** sub-tab.

> "It turns the designed structure into a construction sequence — and pushes it
> straight into the scheduling module, which I'll show you next."

### 2.13 Plans (45 s)

**Plans** tab. Show the generated drawings and the take-off.

> "Framing plans and details, generated from the model."

### 2.14 Export the PDF ⭐ (45 s)

Press **⎙ Export PDF report** (top right of the results tabs).

**Open the PDF and scroll it on screen.** Do not describe it — show it.

> "Letterhead, the 3D view, every schedule, every worked solution, the quantities.
> This is the deliverable. Everything you just watched me do ends up in one file
> you can sign."

### 2.15 Save (15 s)

**Projects** tab, or **Import / Export ▾** in the header.

> "Saved to your account, and it syncs. Open it on another machine and it's there —
> and if you have it open in two tabs, it tells you rather than letting one
> silently overwrite the other."

---

## 3 · The scheduling module (~3 minutes)

Go to `/schedule`. If the model pushed a schedule across, it is already loaded —
otherwise press **Load sample**.

Walk the seven views in this order, ~25 seconds each:

| Route | Say |
|---|---|
| `/schedule` | "The activity grid. Durations, predecessors, calendars. Every row expands." |
| `/schedule/gantt` | "CPM — the critical path is computed, not coloured in by hand. Baselines overlay." |
| `/schedule/network` | "The logic diagram, if you think in networks." |
| `/schedule/dashboard` | "Percent complete, status roll-up, earned value." |
| `/schedule/resources` | "Resource loading — labour, equipment, material, per day." |
| `/schedule/reports` | "Printable, with the same letterhead." |
| `/schedule/daily` | "Daily progress capture from site." |

**Create a baseline** on the way through, then show it overlaid on the Gantt.

> "PERT and CPM, baselines, earned value. This is the part people don't expect to
> find in the same tab as a finite element solver."

---

## 4 · Quantity take-off (~90 seconds)

Go to `/estimate/slab`. Fill in a slab and show the take-off.

> "Five of these — slab, beam, column, CHB, box culvert. Materials, quantities,
> and a printable bill."

Show one more (`/estimate/chb` reads well to a Philippine audience) and move on.
Do not do all five.

---

## 5 · The shop window — a standalone calculator, signed out (~90 seconds)

**Switch to the signed-out browser window.** Go to `/beam-design`.

Fill it in and let it compute live.

> "No account. Nothing installed. It recomputes as you type, and it shows the
> steps — not just the answer."

Print the PDF.

> "Every one of the forty-odd calculators does this. Five free runs each, no card,
> no email. A free account removes the counter."

**This is your call to action.** Whoever you are demoing to will try this one
first, on their own, tonight — so make sure it lands.

---

## 6 · Geotech, if the audience is geotechnical (~2 minutes, optional)

`/bearing-capacity` → `/retaining-wall` → `/slope` → `/soil-nail`.

> "Terzaghi and Meyerhof bearing, Rankine earth pressure, slope stability, and
> the FHWA GEC-7 soil-nail and facing checks. Plus a soil investigation module
> that stores borehole logs."

---

## 7 · The close (30 seconds)

Back to `/pricing`.

> "Free account: the calculators, unlimited, and three saved projects. Pro adds
> the 3D Model Space, the design pipeline, the optimiser, the reports, estimating
> and soil investigations. Max adds the nonlinear and dynamic solvers and removes
> the model size limit.
>
> Start on the free tier. If the calculators alone save you an afternoon, the rest
> will make sense on its own."

---

## Recovery — what to do when something goes wrong on screen

| Symptom | Do this |
|---|---|
| `/model` redirects to sign-in | You are signed out or on Free. This is by design. Sign in on Pro/Max — do not debug it live. |
| Pushover/Nonlinear shows an upgrade page | Pro account. Skip to §2.8. |
| Analysis returns nothing | Check supports are set (§2.3). An unrestrained model has no solution. |
| Design produces no schedules | You skipped **▶ Analyze**. Design consumes analysis results; it cannot run first. |
| 3D view is black | A WebGL/driver issue on the demo machine, not the app. Carry on with the tabs — everything except the viewport still works. Test the machine beforehand. |
| A schedule row won't expand | Click the row itself, not the text inside a cell. |
| PDF takes a while | It says **⏳ Building PDF…**. Fill the silence with §2.15 and come back to it. |

---

## Timing sheet

| § | Section | Time |
|---|---|---|
| 1 | Validation opener | 1:00 |
| 2 | **3D Model Space** | **9:00** |
| 3 | Scheduling | 3:00 |
| 4 | Take-off | 1:30 |
| 5 | Signed-out calculator | 1:30 |
| 6 | Geotech *(optional)* | 2:00 |
| 7 | Close | 0:30 |
| | **Full** | **~18:30** + questions |
| | **Short version** (§1, 2, 5, 7) | **~12:00** |

**If you only have five minutes:** §2.4 (generate the earthquake cases), §2.8
(show a failure), §2.10 (open one schedule row), §2.14 (the PDF). That sequence
is the whole product in four clicks.
