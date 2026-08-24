# Optimizer & Nonlinear Analysis — Performance Implementation Guide

## Context

Our structural engineering app (`ModelSpace.tsx`, ~6000 lines) runs FEM analysis in a Web Worker via `useSolver()` hook (`lib/useSolver`). Two features scale poorly with member count:

- **Optimizer** (`run('optimize', ...)` in `engine/pipeline`): iterative solve → design → resize loop, `maxIter: 30`
- **Nonlinear analysis** (pushover, time-history, hinge model): incremental load-stepping / Newmark-β integration with per-member plasticity tracking

The UI stays responsive (worker is off-thread), but compute time grows fast. This doc describes the concrete changes to make.

---

## 1. Optimizer: Solve Only Governing Combo After First Iteration

**Where:** `engine/pipeline.ts` (or wherever the optimizer loop lives inside the worker)

**Current behavior (assumed):** Every optimizer iteration re-solves ALL load combinations (15+ combos including D, L, D+L, 1.2D+1.6L, seismic combos, wind combos, etc.). Most of these are wasted — the governing combo per member rarely changes between iterations.

**Change:**

```ts
// Pseudocode for the optimizer loop
for (let iter = 0; iter < maxIter; iter++) {
  if (iter === 0) {
    // Iteration 0: solve ALL combos, find governing combo per member
    allResults = solveAllCombos(model, combos)
    governingComboPerMember = new Map<MemberId, ComboId>()
    for (const m of model.members) {
      governingComboPerMember.set(m.id, findGoverningCombo(m, allResults))
    }
  } else {
    // Iterations 1+: solve ONLY the governing combo for each member.
    // Group members by their governing combo to batch solves.
    const comboGroups = groupBy(governingComboPerMember.entries(), ([, comboId]) => comboId)
    const neededCombos = new Set(comboGroups.keys())
    const partialResults = solveCombos(model, neededCombos)

    // Design with partial results
    for (const m of model.members) {
      const comboId = governingComboPerMember.get(m.id)!
      const result = partialResults.get(comboId)!
      const newSection = designMember(m, result)
      if (newSection !== m.section) {
        memberChanged = true
        updateSection(m, newSection)
      }
    }
  }

  // After resize, check if any member's governing combo flipped
  if (iter > 0 && memberChanged) {
    // Spot-check: re-solve all combos ONLY for members that changed section
    // If any member's governing combo changed, fall back to full solve next iter
    const changedMembers = model.members.filter(m => m._changed)
    const spotResults = solveAllCombos(model, combos)  // or just for changed members
    for (const m of changedMembers) {
      const newGov = findGoverningCombo(m, spotResults)
      if (newGov !== governingComboPerMember.get(m.id)) {
        // Governing combo changed — do a full solve next iteration
        needFullSolve = true
        break
      }
    }
  }

  // Early termination: if no sections changed, we've converged
  if (!memberChanged) break
}
```

**Expected impact:** 5–10× fewer solves per iteration for iteration 1+. A model with 15 combos goes from 15 solves/iter to 3–5 unique governing combos.

---

## 2. Optimizer: Early Termination

**Where:** Same optimizer loop in `engine/pipeline.ts`

**Current behavior:** Runs up to `maxIter: 30` regardless of convergence.

**Change:**

```ts
const SIZE_STEP = 25  // mm, minimum section size change we care about
let converged = false
let noChangeCount = 0

for (let iter = 0; iter < maxIter; iter++) {
  // ... solve and design ...

  let anySectionChanged = false
  for (const m of model.members) {
    const prev = prevSections.get(m.id)
    const curr = sectionFor(m.id)
    if (Math.abs(curr.b - prev.b) >= SIZE_STEP || Math.abs(curr.h - prev.h) >= SIZE_STEP) {
      anySectionChanged = true
    }
  }

  if (!anySectionChanged) {
    noChangeCount++
    if (noChangeCount >= 2) {
      // Two consecutive iterations with no meaningful section change
      converged = true
      break
    }
  } else {
    noChangeCount = 0
  }
}

// Report convergence status back to the UI
postMessage({ kind: 'optimize', result: { ...result, converged, iterations: iter + 1 } })
```

**Expected impact:** 2–3× fewer iterations on average (typical convergence in 5–10 vs. always running 30).

---

## 3. Optimizer: Only Resize Near-Capacity Members

**Where:** Same optimizer loop

**Current behavior:** Every member gets re-designed and potentially re-sized every iteration, even if it's at 30% utilization.

**Change:**

```ts
const UTILIZATION_THRESHOLD = 0.85  // only resize members above this
const UTILIZATION_FLOOR = 0.5       // don't downsize below this (safety margin)

for (const m of model.members) {
  const govResult = getResult(m, governingComboPerMember.get(m.id)!)
  const util = computeUtilization(m, govResult)  // M/Mcap or V/Vcap or combined

  if (util > UTILIZATION_THRESHOLD) {
    // Over-stressed or very close — try next size up
    const newSection = tryNextLargerSection(m, govResult)
    if (newSection) updateSection(m, newSection)
  } else if (util < UTILIZATION_FLOOR && iter > 0) {
    // Very under-stressed after first iteration — try downsizing
    const newSection = tryNextSmallerSection(m, govResult)
    if (newSection && computeUtilization(m, govResult, newSection) < UTILIZATION_THRESHOLD) {
      updateSection(m, newSection)
    }
  }
  // else: member is in the sweet spot [0.5, 0.85] — leave it alone
}
```

**Expected impact:** 60–80% of members are left untouched per iteration (the majority are gravity beams at low utilization). Design pass becomes much cheaper.

---

## 4. Optimizer: Binary Search for Section Sizing

**Where:** The section selection logic (likely in `engine/pipeline.ts` or `engine/design*.ts`)

**Current behavior (assumed):** Steps through the size ladder one rung at a time (e.g., 200×300 → 200×350 → 200×400 → ...).

**Change:**

```ts
// Size ladder for a given role (pre-sorted by area)
const SIZE_LADDER = [
  { b: 200, h: 200 }, { b: 200, h: 250 }, { b: 200, h: 300 },
  { b: 200, h: 350 }, { b: 200, h: 400 }, { b: 250, h: 400 },
  { b: 250, h: 450 }, { b: 250, h: 500 }, { b: 300, h: 500 },
  { b: 300, h: 550 }, { b: 300, h: 600 }, { b: 350, h: 600 },
]

function findLightestPassingSection(
  member: Member,
  demand: { Mu: number; Vu: number; Nu: number },
  ladder: typeof SIZE_LADDER,
): { b: number; h: number } | null {
  let lo = 0, hi = ladder.length - 1

  // Find the first passing section via binary search
  // (works if the ladder is sorted by capacity, which it is if sorted by area)
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    const sec = ladder[mid]
    const checks = designChecks(member, sec, demand)
    if (checks.allPass) {
      hi = mid  // try smaller
    } else {
      lo = mid + 1  // need bigger
    }
  }

  const sec = ladder[lo]
  const checks = designChecks(member, sec, demand)
  return checks.allPass ? sec : null
}
```

**Expected impact:** Reduces per-member design evaluations from O(k) to O(log k) where k = ladder length (typically 15–20). Minor win per member but adds up across 30 iterations × 100+ members.

---

## 5. Optimizer: Separate Gravity vs. Lateral

**Where:** The optimizer entry point in `engine/pipeline.ts`

**Current behavior:** All members are in one pool, resized together.

**Change:**

```ts
async function optimizeModel(model, opts) {
  const gravityMembers = model.members.filter(m =>
    m.role === 'beam' || m.role === 'girder'
  )
  const lateralMembers = model.members.filter(m =>
    m.role === 'column' || m.role === 'brace'
  )

  // Phase 1: Optimize gravity members under gravity combos only
  const gravityCombos = combos.filter(c => !c.hasLateral)
  const gravModel = solveAndOptimizeMembers(model, gravityMembers, gravityCombos)

  // Phase 2: Lock gravity sections, optimize lateral members under ALL combos
  const lateralCombos = combos  // all combos, since columns feel gravity + lateral
  const finalModel = solveAndOptimizeMembers(gravModel, lateralMembers, lateralCombos)

  // Phase 3: One final full check — re-verify gravity members haven't been
  // pushed over capacity by the lateral optimization changing column sizes
  // (column size changes affect beam effective lengths)
  const check = designCheckAll(finalModel, combos)
  return { model: finalModel, design: check }
}
```

**Expected impact:** Each phase has fewer members to resize, so converges faster. Gravity members typically converge in 2–3 iterations.

---

## 6. Nonlinear Pushover: Adaptive (Event-Driven) Stepping

**Where:** `engine/pushoverModel.ts` (or wherever pushover load stepping lives)

**Current behavior:** Fixed step count (`bxSteps: 40`) with uniform displacement increments.

**Change:**

```ts
interface PushoverStep {
  displacement: number
  baseShear: number
  hingesFormed: number
  yieldedMembers: Set<string>
}

function runAdaptivePushover(model, opts): PushoverResult {
  const maxSteps = 200  // safety cap
  const targetDrift = opts.targetDispRatio * model.height
  const steps: PushoverStep[] = []
  let currentDisp = 0
  let stepSize = targetDrift / 20  // start with ~20 coarse steps

  for (let i = 0; i < maxSteps && currentDisp < targetDrift; i++) {
    const nextDisp = Math.min(currentDisp + stepSize, targetDrift)
    const result = solvePushStep(model, nextDisp)

    const newHinges = countNewHinges(result, steps[steps.length - 1])
    steps.push(result)

    if (newHinges > 0) {
      // A hinge just formed — refine: back up and re-solve with half steps
      // to capture the exact formation point
      stepSize = stepSize / 3
    } else if (newHinges === 0 && i > 5) {
      // Nothing happening — coarsen to get through the elastic range faster
      stepSize = Math.min(stepSize * 1.5, targetDrift / 5)
    }

    currentDisp = nextDisp

    // Early stop if collapse mechanism formed
    if (result.baseShear < 0.6 * maxBaseShear(steps) && i > 10) break
  }

  return { steps, converged: currentDisp >= targetDrift }
}
```

**Expected impact:** 15–25 adaptive steps capture the same or better accuracy than 40 fixed steps. ~2× speedup.

---

## 7. Nonlinear Time-History: Conditional Mode Count

**Where:** The modal/time-history analysis setup, and the UI in `ModelSpace.tsx` where `nModes` is set.

**Current behavior:** Fixed `nModes: 12` regardless of model size. For small models (2–3 storeys), 3–5 modes capture 90%+ mass participation. For large models (10+ storeys), 12 may not be enough.

**Changes:**

### 7a. Auto-suggest mode count from mass participation

```ts
// In the modal result handler (already in ModelSpace.tsx around line 1298)
const runModal = () => {
  // ...
  run('modal', { model, nModes }).then((r) => {
    const m = (r as { modal: ModalResult | null }).modal
    setModal(m)
    if (m && m.modes.length > 0) {
      // Auto-suggest: how many modes for 90% mass participation?
      let cumMass = 0
      let modesFor90 = 0
      for (let i = 0; i < m.modes.length; i++) {
        cumMass += m.modes[i].massParticipation
        if (cumMass >= 0.9) { modesFor90 = i + 1; break }
      }
      setSuggestedModes(modesFor90)  // show to user: "5 modes = 92% mass"
      // ...
    }
  })
}
```

### 7b. In the time-history solver, skip modes with negligible contribution

```ts
// In the time-history solver (engine/timeHistoryModel.ts or similar)
function runTimeHistory(model, opts) {
  const modalResult = solveModal(model, opts.nModes)

  // Drop modes that contribute < 1% mass participation
  const significantModes = modalResult.modes.filter(m => m.massParticipation > 0.01)

  // Use significantModes for Newmark-β superposition
  // For a 12-mode request, this often drops to 5–8 active modes
  return newmarkBetaIntegration(significantModes, opts)
}
```

**Expected impact:** For small models, reduces mode-superposition work by 50–70%. For large models, ensures adequacy (12 modes may not be enough).

---

## 8. Nonlinear Hinge Model: Lazy Fiber Tracking

**Where:** `engine/nonlinearFrameModel.ts` (the `hinges` path of `nonlinearTH`)

**Current behavior (assumed):** Every member end is tracked with full fiber/plastic-hinge integration at every time step, even if the member is far from yield.

**Change:**

```ts
interface MemberHingeState {
  nearYield: boolean      // flag: is this member close to yielding?
  trackingLevel: 'none' | 'elastic' | 'full'
}

// Initialize: all members start as 'elastic' (cheap moment-curvature check)
const hingeStates = new Map<MemberId, MemberHingeState>()
for (const m of model.members) {
  hingeStates.set(m.id, { nearYield: false, trackingLevel: 'elastic' })
}

// At each time step:
for (const m of model.members) {
  const state = hingeStates.get(m.id)!
  const demand = getMemberEndDemand(m, stepResult)
  const yieldMoment = computeYieldMoment(m)
  const demandRatio = Math.abs(demand.M) / yieldMoment

  if (demandRatio > 0.7 && !state.nearYield) {
    // Crossed 70% threshold — upgrade to full tracking
    state.nearYield = true
    state.trackingLevel = 'full'
  }

  if (state.trackingLevel === 'full') {
    // Full fiber integration (expensive)
    updateHingeWithFullTracking(m, demand, state)
  } else {
    // Cheap elastic check: just compare M to My
    state.elastic = demand.M < yieldMoment
  }
}
```

**Expected impact:** For a typical frame under moderate seismic demand, only 20–30% of member ends ever approach yield. Full tracking cost drops proportionally.

---

## 9. Sparse LU Factorization (Foundation for All Optimizations)

**Where:** The core stiffness solver (likely `engine/frame3d.ts`)

**Current behavior (assumed):** Dense matrix operations or a naive banded solver.

**Change:** Use a sparse direct solver. Options in order of implementation effort:

### Option A: Use `sparse-matrix` npm package (quickest)

```ts
import { SparseMatrix } from 'sparse-matrix'

function solveStiffness(K: number[][], F: number[]): number[] {
  const sparse = SparseMatrix.fromDense(K)
  // LU factorization (only done once per K assembly)
  const lu = sparse.lu()
  // Back-substitution for each load case (cheap)
  return lu.solve(F)
}
```

### Option B: WASM sparse solver (best performance)

Compile [SuiteSparse](https://github.com/DrTimothyAldenDavis/SuiteSparse) or a custom sparse LU to WASM via `wasm-pack` (Rust) or `emscripten` (C). This gives native-speed sparse factorization.

### Option C: Banded solver with skyline storage

If the model is always a planar frame (no arbitrary 3D topology), the stiffness matrix has a predictable bandwidth. A skyline/banded solver with column height tracking avoids storing/factoring zeros.

**Expected impact:** For a 100-member model (600 DOFs), sparse LU is ~10–50× faster than dense LU. For a 500-member model, the gap widens to 100–500×.

---

## 10. Stiffness Reuse for Optimizer (Sherman-Morrison)

**Where:** The optimizer loop, after sparse LU is in place (#9)

**Current behavior:** Each optimizer iteration assembles K from scratch and factorizes.

**Change:** When only a few member sections change between iterations, update K using rank-1 modifications:

```ts
// Initial factorization
let lu = sparseLU(K_global)

for (let iter = 1; iter < maxIter; iter++) {
  // Collect member stiffness changes
  const changes: { member: Member; oldK: Matrix; newK: Matrix }[] = []
  for (const m of changedMembers) {
    changes.push({
      member: m,
      oldK: memberStiffness(m, oldSection),
      newK: memberStiffness(m, newSection),
    })
  }

  // Each member change is a low-rank update to K:
  // K_new = K_old + (newK_member - oldK_member) scattered into global
  // This is a sum of rank-6 updates (6 DOFs per member end × 2 ends)
  // Apply via Sherman-Morrison-Woodbury:
  // (K + U·V')^-1 = K^-1 - K^-1 · U · (I + V'·K^-1·U)^-1 · V' · K^-1

  const U = assembleU(changes, model)  // n × 6r matrix
  const V = assembleV(changes, model)  // n × 6r matrix
  const KinvU = lu.solve(U)            // n × 6r
  const inner = identity(6*r).add(V.transpose().mmul(KinvU))  // 6r × 6r
  const innerInv = inner.lu().solve(identity(6*r))              // 6r × 6r (tiny!)
  // Updated inverse: Kinv_new = Kinv - KinvU · innerInv · (KinvU)'

  // For subsequent RHS solves, use the updated inverse directly
  // No O(n³) refactorization needed
}
```

**Expected impact:** If < 20% of members change per iteration (typical after iter 1), the Sherman-Morrison update inverts a 6r × 6r matrix (r = changed members) instead of an n × n matrix. For 100 DOFs with 5 changed members: invert 30×30 vs 100×100 — ~100× cheaper.

---

## Implementation Priority

Do these in order. Each builds on the previous:

| # | Task | Effort | Impact | Depends on |
|---|------|--------|--------|------------|
| 1 | Early termination (#2) | 1 hr | 2–3× | Nothing |
| 2 | Governing-combo-only (#1) | 2–3 hrs | 5–10× | Nothing |
| 3 | Only resize near-capacity (#3) | 1 hr | 2× | Nothing |
| 4 | Adaptive pushover stepping (#6) | 3–4 hrs | 2× | Nothing |
| 5 | Conditional mode count (#7) | 1 hr | 1.5× | Nothing |
| 6 | Binary search sections (#4) | 2 hrs | 1.3× | Nothing |
| 7 | Separate gravity/lateral (#5) | 3–4 hrs | 1.5× | #1, #2, #3 |
| 8 | Lazy hinge tracking (#8) | 2–3 hrs | 1.5– | Nothing |
| 9 | Sparse LU (#9) | 1–2 weeks | 10–100× | Nothing |
| 10 | Sherman-Morrison K updates (#10) | 1 week | 10–100× (optimizer) | #9 |

**Items 1–6 are independent and can be done in parallel.** Together they should give a **5–15× overall speedup** for typical models (50–200 members) without any architectural changes.

Items 9–10 are the "proper" fix but require more engineering. Do them if users are regularly hitting 500+ member models.

---

## Notes for Claude Code

- All solver code lives in `engine/` and runs inside a Web Worker (`lib/useSolver.ts` dispatches to it).
- The optimizer is triggered from `ModelSpace.tsx` line ~1582: `run('optimize', { model, soil, plan, opts, tryBars, maxIter: 30 })`.
- The worker receives messages via `postMessage` and returns results the same way. Check `lib/useSolver.ts` for the message protocol.
- `engine/frame3d.ts` likely contains the core stiffness assembly and solve. Look there for the LU/solve implementation.
- `engine/pipeline.ts` likely contains the optimizer loop (it exports `OptimizeResult`).
- `engine/pushoverModel.ts`, `engine/nonlinearFrameModel.ts`, `engine/timeHistoryModel.ts` are the nonlinear solvers.
- Progress reporting already exists (`SolveProgress` type in `engine/progress.ts`) — hook into it to report iteration count and convergence status.
- The `STRUCT_TYPE` field in the worker message may control solve behavior. Read the worker entry point to understand the dispatch.
- Don't touch `ModelSpace.tsx` for items 1–8. All changes are in `engine/` and `lib/`. The UI changes for #7a are minor (add a `suggestedModes` state and display it).
