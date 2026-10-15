# Approved marketing claims

What Zeta may say about itself, checked against the code on **2026-10-15**
(`main` at `317d778`). Three tiers, following the brief's §4F:

- **Approved** — true now, with the evidence named. Use as written.
- **Verify first** — the feature exists, but capture and check the specific
  example (into `verified-examples.md`) before a post shows it.
- **Do not publish** — false, unsupported, or a claim the app itself disclaims.

## Corrections to the audit document

The brief (`Zeta_Full_Audit_Marketing_Strategy_AI_Prompts.md`) was written
from documentation without running the app. Where the code says otherwise:

| The brief says | The code says | Source |
|---|---|---|
| "38 standalone calculators" | **108 tools** in the catalogue, plus 4 reference pages (Code Library, Docs, Pricing, Validation) — 112 entries | `webapp/src/lib/tools.ts` (`TOOL_COUNT`, pinned by `toolCount.test.ts`) |
| Brand line "Structural Engineering, Connected." | The logo lockups carry **"Structural engineering made clearer"** (`branding/`). The campaign uses the new line as a *campaign* line; the lockup is unchanged until the owner decides | `branding/README.md` |
| Geotechnical tools listed without count | **12** geotechnical tools | `tools.ts`, group Geotechnical |
| Scheduling "documented" | Shipped: CPM/PERT schedule, Gantt, network diagram, EVM dashboard, resource loading, and a construction schedule generated from the Model Space design | `tools.ts` (`/schedule…`), Model Space results tab |
| Code compliance "documented references" | Also shipped since the brief: the **Code Library** (`/codes`) — NSCP provisions explained with live diagrams, "Explain this check" from calculators, and a compliance inspector in Model Space. Every page is marked *engine-matched*, **not reviewed against an authorized copy of the code** | #986–#992 |

## Approved

| Claim | Evidence |
|---|---|
| 108 engineering tools in the browser | `tools.ts` |
| One workbench: 3D model → analysis → design → detailing → drawings → quantities → report | `evidence/model-space/*`, `evidence/reports/*` (V6) |
| 3D frame analysis with plate/shell slabs, P-Δ, modal, response spectrum, time history, buckling and pushover are **available** (say "available", show none without a verified example) | Model Space ribbon: Analysis · Modal · Pushover · Nonlinear |
| RC beam design worked example: 0.95 flexure, 0.80 shear | V1 |
| Steel beam W310×38.7 fails LTB at 147 % (φbMn 178.0 vs Mu 261) | V2 |
| Zeta's steel beam strength is within 2 % of the AISC Manual's beam tables, on the conservative side, for the shapes checked (W12×26, W18×50) | V2, V4 |
| NSCP 2015 load combinations: 13 strength combinations, governing case highlighted | V5 |
| The default 2×1-bay, 2-storey frame designs with no failures | V6 |
| Reinforcement cages drawn in 3D from the designed bars; framing plans and schedules; bill of quantities priced with your own unit costs | V6 |
| One frame modelled in Zeta and in STAAD.Pro with every input matched: total reaction agreed to 0.001 % | V7 |
| The design calculators (concrete, steel, foundations, geotechnical) show a step-by-step worked solution with clauses and export a PDF report | `evidence/concrete-design/*`, `evidence/steel-design/*` |
| Validation evidence is published, including the checks still open | `/validation`, `docs/ValidationMap.md` |
| Code Library: NSCP provisions explained with live diagrams and the engine's own numbers | `/codes` |
| AI assistant that explains concepts and the page you are on (free models) | the chat button on every page |

## Verify first

| Claim | What to check |
|---|---|
| Footing / pile cap / combined footing sizing story | Capture a default, hand-check bearing pressure and punching shear |
| Retaining wall, slope stability, bearing capacity | Hand-check one default each (sliding/overturning FS; Bishop FS; Terzaghi/Meyerhof qult) |
| Excel export; STAAD.Pro (.std) and ETABS (.e2k) export | Export the default frame, open the files, confirm the tables and the model |
| Deformed shape, modal periods, drift | Capture; compare the first period with a hand estimate |
| PDF report contents match the screen | The brief's §4D test on one beam, one column, one footing and the 3D frame |
| Section optimiser | State what it optimises (member sizes until nothing fails, then trims) and which checks it runs |
| Construction schedule from the model | Capture and check the activities follow the frame |
| "Every one of the 108 tools has a worked solution and a PDF export" | Not established: workspaces (Model Space, schedules, estimates) are not calculators, and ~24 pages have no PDF export of their own — audit before claiming "every" |

## Do not publish

| Claim | Why |
|---|---|
| "Fully compliant with NSCP / ACI / AISC" | Only the implemented checks are covered; Code Library pages are not reviewed against the authorized code |
| "Replaces STAAD / ETABS" or "matches commercial software" | One cross-check (V7) on one model; X001 (ETABS) and X003 (spColumn) are open |
| AISC Direct Analysis Method | Not implemented; the steel stability workflow uses K-factors, and the report says so (solver audit CODE-01) |
| Second-order effects in shell slabs | Shells carry no geometric stiffness in P-Δ (`pDelta.shellsFirstOrder`, reported in the app) |
| "Instant", "unlimited model size", "zero errors" | No measured basis; the mesh is capped at 10 000 DOF and P-Δ at 5 000 |
| "Submission-ready" / "approved" reports, or that Zeta replaces the engineer of record | Outputs are for review by a licensed engineer |
| The Code Library or the AI assistant "verifies" or "approves" a design | Both explain; neither certifies |
| Any number not in `verified-examples.md` | — |
