# CLAUDE.md — working rules for this repo

Read this first. These are the standing rules and approaches to follow for
**every** task in `BitLess246/civilEngineering`. (See `HANDOFF.md` for project
status and how to continue from web/phone.)

## Golden git/PR rules (do this every time)
1. **Check the current branch before doing anything**: `git branch --show-current` + `git status`.
2. **Verify the previous PR is merged before starting the next** (`gh pr view <n> --json state,mergedAt` locally, or the GitHub MCP tools in a cloud session). Assume the user has merged prior work unless you can see otherwise.
3. **Always branch off fresh `main`. Never stack branches.** Start every task with:
   ```bash
   git checkout main && git fetch origin main && git merge --ff-only origin/main && git checkout -b <type>/<short-name>
   ```
4. **One new PR per push** — never push more work onto an already-opened/merged branch.
5. **Auto-merge enabled (standing authorization).** The user has authorized auto-merging for Tier 4 work: after CI passes on a PR, merge it yourself (`mcp__github__merge_pull_request`), then continue to the next phase. Still open one PR per phase. If the user revokes this, revert to "open the PR and stop."
6. If you must create a branch but uncommitted changes are on the wrong branch, `git stash`, switch/branch off main, `git stash pop`.

Branch names: `feature/*`, `fix/*`, `docs/*`.
Commit message footer (every commit):
```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```
PR body footer (every PR):
```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

## Environment / shell
This repo is worked on in two contexts — detect which you're in and adapt. The
app lives in **`webapp/`** in both.

- **Local (Windows terminal).** Repo root `C:\Users\raymv\Downloads\civilEngineering`.
  Prefix every Bash command with:
  ```bash
  export PATH="/usr/bin:/c/Program Files/nodejs:/c/Program Files/GitHub CLI:$PATH"
  ```
  Use the **`gh` CLI** for all PR/issue operations.
- **Cloud (claude.ai/code, Linux container).** Repo root `/home/user/civilEngineering`;
  use POSIX paths and no PATH prefix. There is **no `gh` CLI** — use the **GitHub MCP
  tools** (`mcp__github__*`) for every PR / issue / CI operation. The repo is cloned
  fresh and the container is ephemeral, so commit and push anything worth keeping.

## Always verify before committing
- `cd webapp && npm test` (vitest) **and** `npx tsc -b` must both pass.
- For anything **observable in the browser**, verify with the preview tools
  (`preview_start` → navigate → `preview_eval`/`preview_screenshot` →
  `preview_console_logs`). **Never ask the user to check manually** — verify and
  show proof.
- **WebGL caveat**: the screenshot tool sometimes reads the 3D canvas as black.
  When that happens, verify 3D logic via **pure unit-tested modules** and DOM /
  scene introspection instead of pixels.
- Report outcomes honestly: if something is approximate, partial, or skipped,
  say so in the PR body and to the user.

## Engineering & code approach
- **Pure, typed engine modules** in `webapp/src/engine/` (calculation only), each
  with a matching `*.test.ts`. UI in `webapp/src/pages/` and
  `webapp/src/components/`. Keep calculation out of components.
- Follow **NSCP 2015 / ACI 318-14 / AISC 360**; cite clause numbers in comments.
- **Add/extend tests** for new engine logic; keep the whole suite green.
- **Match the surrounding code style** — terse, strongly typed, similar comment
  density and naming. Prefer extending existing solvers/components over
  duplicating. No `any` unless unavoidable.
- Units: document them (geometry m, sections mm/mm², forces kN, stress MPa).

## Big features → ship in phases
Break large requests into phases, **one PR per phase**, in a sensible order
(foundation/data first, then UI, then reports/take-off). State the remaining
phases in the PR and pick them up after each merge.

## After the work
- Reference PRs/files as markdown links in the reply.
- Scan what you touched for out-of-scope issues; flag them rather than bloating
  the PR.
- Keep `HANDOFF.md` current when the project state changes meaningfully.

## Quick reference
```bash
cd webapp
npm run dev      # local dev server
npm test         # vitest run
npx tsc -b       # typecheck
npm run build    # typecheck + production build
```

---

# Engine architecture map — which layer does this task belong to?

The calculation core lives in `webapp/src/engine/`. Before any engine task,
identify the layer. Fix the weak layer, never patch symptoms downstream.

| # | Layer | Key files | Role |
|---|-------|-----------|------|
| 1 | **Model schema** | `model.ts`, `meshValidation.ts` | Pure typed data: Node/Member/Plate/Load/SectionLib/Storey. JSON-serialisable. |
| 2 | **Bridge** | `modelBridge.ts`, `rigidEndZones.ts`, `diaphragm.ts` | StructuralModel → solver input: section props, rigid zones/offsets, diaphragm groups, wall struts, shell meshing. |
| 3 | **FEM solver** | `frame3d.ts`, `frame2d.ts`, `fem.ts`, `shell.ts`, `solverWorker.ts`, `framePool.ts` | 12-DOF space frame (releases, springs, offsets, P-Δ), CST+DKT shells, LU shared across combos, web-worker execution. |
| 4 | **Loads & combos** | `loads.ts`, `deadLoads.ts`, `liveLoads.ts`, `wind.ts`, `loadCombinations.ts`, `tributary.ts`, `thermalLoad` | Categorised loads → equivalent nodal forces; NSCP combos are data applied over one factorization. |
| 5 | **Dynamics & seismic** | `modal.ts`, `responseSpectrum.ts`, `timeHistory.ts`, `accelSpectrum.ts`, `accelerogram.ts`, `nscpSeismic.ts`, `seismic.ts`, `buckling.ts`, `pushover.ts`, `floorVibration.ts` | Jacobi modes, SRSS/CQC + §208.6.4.2 scaling, Newmark SDOF/modal TH, §208 static, drift ΔM=0.7RΔs, linearized buckling, event-to-event pushover. |
| 6 | **Design pipeline** | `pipeline.ts`, `beamSections.ts`, `beamDesign.ts`, `columnDesign.ts`, `pmInteraction.ts`, `steelDesign.ts`, `baseplate.ts`, `scwb.ts`, `effectiveLength.ts` | Governing combo → slabs → beams → columns → footings; steel §F2/§G2.1/§E3/§H1-1; optimizer. Strictly downstream of layer 3. |
| 7 | **Standalone design engines** | footings (`isolatedFooting`, `combinedFooting`, `flexibleCombinedFooting`, `eccentricFooting`, `pileCap`, `punchingShear`), `retainingWall`, `stair`, `waterTank`, `slabDDM`, `torsionDesign`, `devLength`, connections (`boltedConnection`, `weldedConnection`, `steelConnections`), `shearWallDesign`, `woodArmer` | One code-checked calculator each, paired with a page. |
| 8 | **Geotech** | `geotech.ts`, `soilNail.ts`, `micropile.ts`, `shotcreteFacing.ts`, `rockAnchor.ts`, `bearing.ts` | Rankine, Terzaghi/Meyerhof, infinite slope, FHWA GEC-7 soil nail + facing, micropile. |
| 9 | **Quantities & validation** | `quantities.ts`, `takeoff.ts`, `trussTakeoff.ts`, `validation.ts` | BOM/costing; engine-vs-closed-form benchmarks surfaced at `/validation` and enforced in CI. |

## Claude task guidelines per layer

**Every engine task:** state the layer in the PR body; new logic ships with a
`*.test.ts` case verified against a hand calc or closed form; cite NSCP/ACI/AISC
clause numbers in comments; keep units per the convention (geometry m, sections
mm, forces kN, stress MPa) and state them at module boundaries.

- **L1 Model:** new member/plate/load fields must stay JSON-serialisable and get
  a `meshValidation` rule in the same PR. UI never constructs solver input
  directly — everything goes through the bridge.
- **L2 Bridge:** any new modelling feature (offsets, zones, constraints) is
  folded into the element transform or DOF map here, so stiffness, loads, force
  recovery, P-Δ and buckling all inherit it for free. Never special-case a
  feature inside the solver instead.
- **L3 Solver:** treat as frozen infrastructure; changes need a stated
  justification. After any change, re-run the statics self-checks (cantilever
  δ=PL³/3EI, fixed-end moments, Σreactions=Σloads) and confirm the shared-LU
  path still matches a per-combo solve. Never post-process bad results — trace
  upstream.
- **L4 Loads:** a new load kind = fixed-end derivation in the docstring + hand-calc
  test + combo-envelope test, all in one PR. Combos stay data (multiply-and-sum),
  never a mutated re-solve.
- **L5 Dynamics/seismic:** verify frequencies against a closed form before
  trusting modes; report mass participation and warn <90% (§208.5.5); iterative
  routines (P-Δ, pushover, buckling) return {converged, iterations, residual} —
  the UI decides presentation.
- **L6 Pipeline:** strictly consumes analysis results; never reaches back into
  the solver. Every check returns pass/fail + utilization + clause reference.
- **L7 Standalone engines:** follow the worked-solution pattern (`lib/solution.ts`)
  so the page can print the step-by-step; validate against a textbook example
  kept in the test file.
- **L8 Geotech:** cite FHWA/NSCP source and check N-factors/tables against
  published values in tests.
- **L9 Validation:** when a new engine ships, add its benchmark row to
  `validation.ts` *and* tick/extend `docs/ValidationMap.md` in the same PR —
  the map must never lag the code again.

---

# Known engine gaps — priority backlog (audit, July 2026)

Ordered: correctness first, then code completeness, then new capability.

## P1 — results correctness
1. **Cracked-section stiffness modifiers** (ACI 318-14 §6.6.3.1.1: 0.35Ig
   beams, 0.70Ig columns, 0.25Ig walls/flat plates). The frame runs on gross
   EI → drifts and P-Δ are unconservative. Implement as per-role factors in
   `modelBridge` section props (opt-out toggle), not inside `frame3d`.
2. ~~**Accidental torsion, 5% eccentricity** (NSCP §208.7.2.7)~~ — ✔ shipped:
   `accidentalTorsionLoads` applies ±0.05·L⊥ storey torques as mass-weighted
   node-force couples (works with and without the diaphragm).
3. ~~**Orthogonal effects 100%+30%** (§208.8.1) and **vertical component
   Ev = 0.5·Ca·I·D**~~ — ✔ shipped: `buildECases` (case composition) +
   `withEv` (E-combo D-factor shift) in `pipeline.ts`/`seismic.ts`.

## P2 — the v1.0 gate
4. **Fill `docs/ValidationMap.md`** — every row is ⬜ while 863 tests already
   cover most cases. Transcribe existing test evidence into the map, then add
   the genuinely missing ETABS/STAAD cross-checks and NSCP worked examples.
   Fix stale checkboxes in `docs/Roadmap.md` (rock anchors are shipped).

## P3 — analysis completeness
5. ~~**Timoshenko shear deformation** in frame elements~~ — ✔ shipped:
   Φ-modified `kLocal` + per-family shear areas in the bridge (opt-in
   `shearDeformation`, UI default on). FEMs stay Euler; modal/pushover/
   buckling still run the Euler element (follow-up if needed).
6. **Direct-integration time-history** on the full MDOF system with Rayleigh
   damping (currently modal superposition only) — prerequisite for nonlinear TH.
7. Tension-only / compression-only members (braces, uplift springs);
   consistent-mass option beside lumped.
8. Irregularity auto-flags (torsional, soft-storey, mass — NSCP Table 208-9/10).

## P4 — design & geotech capability
9. Steel **moment connections, shear tabs, block shear, prying** (HANDOFF
   already flags connections + Lb bracing inputs).
10. Thread cracked deflection (`beamDeflection`/`slabDeflection`) into
    model-space serviceability results.
11. **Slope stability by method of slices** (Bishop simplified / Janbu) —
    infinite slope alone can't cover global stability of protected slopes.
12. Settlement (immediate + consolidation), laterally loaded piles
    (Broms / p-y), pressure grouting (Roadmap Phase 3 leftovers).
13. **Offset framing / beam-on-girder-flange bearing** — `designBeamBeamJoints`
    assumes every supported beam meets the girder WEB (coplanar nodes). A beam
    bearing on a girder TOP FLANGE (seat/bearing detail, stiffener check per
    AISC §J10) can't arise until the model supports vertically offset framing;
    add the pairing + detail when it does.
