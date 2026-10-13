# Zeta Product Improvement Roadmap

> Status: Proposal / planning document. These are recommendations, not claims that the features are already implemented.

## Executive recommendation

Zeta already has a broad set of structural and geotechnical calculations, 3D model workflows, analysis/design engines, reports, detailing, take-off, and scheduling. The biggest opportunity is connecting them into a reliable workflow:

**Model → model QA → analysis → code-checked design → drawings → quantities/cost → review → revisions → deliverables.**

Recommended first priorities:
1. Structural Model Health Check.
2. Unified Design Review Dashboard.
3. Design Revision Comparison.
4. Complete drawing and PDF package.
5. Make the existing AI assistant context-aware, grounded in actual project data, and able to explain findings without inventing engineering results.

# Part I — Product features

## 1. Structural Model Health Check
**Priority:** P1 | **Impact:** Very high | **Effort:** Medium

### Proposed functionality
- Detect disconnected nodes/members, duplicate members, duplicate or nearly coincident nodes, invalid geometry, and unsupported element configurations.
- Check missing/questionable supports, releases, constraints, diaphragms, and connectivity.
- Check self-weight, applied loads, load cases, load combinations, and analysis settings.
- Flag missing material/section properties, unsupported checks, and not-assessed checks.
- Identify stale analysis/design results after model inputs change.
- Highlight affected objects in Model Space from a finding.
- Categorize findings as Blocking, Warning, or Information.
- Provide a reason, location, suggested remedy, and link to the relevant editor.

Example: “Blocking — Beam B14 is not connected to column C5 within the model tolerance.” Explain the tolerance and do not automatically join members without approval.

### Acceptance criteria
- One action runs all supported pre-analysis checks.
- Findings focus the affected object and explain their basis.
- Blocking issues prevent a misleading “ready” status.
- Missing or unsupported checks never count as passing.

## 2. Design Revision Comparison
**Priority:** P1 | **Impact:** Very high | **Effort:** Medium

### Proposed functionality
- Save named, immutable revisions.
- Compare geometry, sections, materials, supports, loads, combinations, analysis results, design checks, reinforcement, quantities, and cost where available.
- Highlight changed objects in 3D.
- Identify checks that changed from pass to fail, fail to pass, or became unassessed.
- Show before/after values and percentage changes where comparable.
- Generate a revision report and warn when a drawing/report is from an older revision.

Zeta has a design snapshot/fingerprint concept that may help detect changes. Build comparison on verified snapshot semantics; a fingerprint alone is not enough to reproduce a comparison.

### Acceptance criteria
- Revisions cannot be silently overwritten.
- Comparisons identify exact revisions and calculation states.
- Missing and incomparable values are labelled.
- Previous revisions can be inspected without mutating the current model.

## 3. Complete Structural Drawing Package
**Priority:** P1 | **Impact:** Very high | **Effort:** Medium–high

### Proposed functionality
- Slab reinforcement plans with bar direction, diameter, spacing, top/bottom mats, additional reinforcement zones, and supported opening/edge conditions.
- Beam schedules/details with longitudinal bars, stirrups, anchorage, and applicable confinement zones.
- Column schedules/details with longitudinal bars, ties, splice zones, and confinement where supported.
- Foundation plans and schedules with dimensions, reinforcement, and design status.
- Consistent title blocks, drawing numbers, scales, dimensions, revision IDs, and sheet indexes.
- Multi-sheet, print-ready PDF export with legible page setup and line weights.
- Quantity schedules derived from the same model/design data.
- Drawing-to-model consistency checks and stale-drawing warnings.
- Clear preliminary/for-review status versus approved-for-issue status.

Reuse existing plan renderers, reinforcement detailing, structured report payloads, and PDF infrastructure. Do not detail reinforcement the design engine has not selected or checked. Disclose code editions, assumptions, and unresolved items.

### Acceptance criteria
- Sheets identify model revision and design-code settings.
- Schedules agree with design data.
- Unsupported detailing is clearly labelled.
- Stale results produce a warning.

## 4. BIM and Structural Model Interoperability
**Priority:** P2 strategic | **Impact:** Very high | **Effort:** High

Recommended sequence:
1. CSV/Excel import/export for documented node, member, section, material, load, and result tables.
2. DXF export for supported plans, sheets, and model-derived geometry.
3. IFC structural-model import/export with explicit element/property mapping.
4. Validated adapters for specific analysis model formats where demand justifies them.
5. Import validation and reconciliation reports.

Requirements:
- Preserve source element IDs and mapping.
- Report omitted, approximated, or transformed properties.
- Validate units, coordinates, local axes, section designations, releases, supports, loads, and combinations.
- Never silently discard analysis-critical properties.
- Provide a review screen before committing imported data.
- Allow cancellation without partial model mutation.

Acceptance: every import summarizes imported, transformed, skipped, and invalid data; unsupported data is not silently converted into a plausible but incorrect model.

## 5. Unified Design Review Dashboard
**Priority:** P1 | **Impact:** Very high | **Effort:** Medium

Consolidate:
- Member strength and serviceability checks.
- Governing load combination, demand, available strength, utilization, units, and code clause.
- Drift, stability, and applicable irregularity checks.
- Reinforcement/detailing constraints and foundation checks.
- Missing inputs, failed/unsupported/not-assessed checks, and stale results.
- Governing issues with links to 3D objects, calculations, and report pages.
- Exportable project-level review summary.

Use explicit statuses:
- PASS — the check ran and satisfied its criterion.
- FAIL — the check ran and did not satisfy its criterion.
- NOT ASSESSED — a required result could not be evaluated.
- UNSUPPORTED — outside implemented scope.
- INVALID INPUT — inputs failed validation.
- STALE — result no longer matches current inputs.

Do not call a project “code compliant” just because currently implemented checks passed. Disclose check coverage and limitations.

## 6. Shared Projects and Engineering Review Workflow
**Priority:** P2 | **Impact:** High | **Effort:** Medium–high

- Share read-only projects or invite collaborators with explicit roles.
- Attach comments to members, nodes, plates, checks, drawings, or report findings.
- Assign review comments and track open/resolved status.
- Maintain revision history and activity logs.
- Add conflict-safe synchronization for concurrent edits.
- Allow reviewer access without unintended model changes.
- Export unresolved review comments with deliverables.

Enforce authorization server-side, provide revocation/expiry for shared links, and avoid logging secrets or unnecessary sensitive data.

## 7. Multi-option Design and Cost Comparison
**Priority:** P2 | **Impact:** High | **Effort:** Medium–high

Compare evaluated options by section size, material, reinforcement, governing utilization, limit state, serviceability, concrete volume, steel tonnage, estimated cost, and constructability constraints.

Engineering rules:
- Evaluate all required checks before ranking.
- Missing checks must not become zero utilization.
- Distinguish calculated quantities from approximate costs.
- Record cost location, currency, date, and adjustments.
- Reanalyze when changed sizes affect stiffness, self-weight, or force distribution.
- Require confirmation before applying an option.

## 8. Validated Steel-Family Design and Optimization
**Priority:** P2 | **Impact:** High for steel users | **Effort:** High

Extend validated support across W, HSS, PIPE, C, L, and WT where appropriate.

- Implement family-specific properties and applicable AISC 360-16 checks.
- Address local slenderness, stability, torsion, shear-center effects, and unsymmetrical bending where relevant.
- Make the optimizer call the same validated design engine as manual design.
- Exclude failed, unsupported, invalid, or not-assessed candidates from feasible ranking.
- Preserve candidate rejection reasons.
- Add independent benchmarks and regression tests.
- Keep 3D rendering and solver local axes consistent.
- Disclose section substitutions and preserve the requested designation.

Catalogue presence or successful rendering does not imply design support. See the separate steel-family support roadmap for detailed architecture and tests.

## 9. Philippine Construction Cost and BOQ Intelligence
**Priority:** P2 | **Impact:** High locally | **Effort:** Medium

- Editable regional material, labor, and equipment rate libraries.
- Supplier quotations and price-list versions.
- Wastage factors, productivity rates, and equipment utilization.
- BOQ by trade, floor, zone, and structural element.
- Cost comparisons between revisions and alternatives.
- Planned-versus-actual quantity tracking where data exists.
- Spreadsheet export.

Every cost figure should carry source, location, currency, effective date, and whether it is quoted, user-entered, or a reference rate. Allow rate editing and trace BOQ lines back to model quantities and the rate version.

## 10. Construction Progress and Delay Evidence
**Priority:** P3 | **Impact:** High for project management | **Effort:** Medium–high

- Progress photos attached to activities, locations, and dates.
- Delay classification and cause/impact notes.
- Planned versus actual dates and quantities.
- Activity-specific calendars and constraints.
- Resource leveling and crew/equipment assignments.
- Progress and delay reports.
- BOQ-linked quantities and earned-work summaries where supported.
- Revisioned progress records.

Keep planned and actual dates distinct, identify evidence/author where available, and show assumptions used for forecasts.

# Part II — Improve the existing AI assistance chatbot

## 11. Product direction: from chatbot to Engineering Copilot

Zeta already has an AI assistance chatbot. Upgrade its context, tool access, accuracy, and workflow integration instead of adding another chat panel.

Examples:
- “Why did column C12 fail?”
- “Which members govern under seismic combinations?”
- “What changed between the last two revisions?”
- “Which required checks have not been evaluated?”
- “Compare these beam sizes and explain the trade-off.”
- “Explain this calculation step by step.”
- “Summarize unresolved engineering review issues.”
- “Explain this STAAD output and identify what needs verification.”

The assistant should distinguish actual project facts, calculated values, code references, and general explanation.

## 12. Highest-value chatbot improvements

### 12.1 Ground answers in the active project — P1

Provide permission-checked access to relevant data where available:
- Active model ID and immutable revision ID.
- Units, materials, sections, member/node IDs, geometry, supports, releases, and load cases.
- Analysis settings, combinations, solver warnings, and design outcomes.
- Calculation steps, assumptions, code clauses, and scope limitations.
- Quantities, drawings, reports, and revision comparisons.

Retrieve only relevant context for each question. Enforce project access on the server and include stable IDs/source references. Do not indiscriminately send the entire project into every prompt.

Example: “Column C12 fails the interaction check for combination ULS-07. The utilization comes from design result revision R12.” Only say this if the retrieved data contains those exact facts.

### 12.2 Use tools for calculations, not AI-invented numbers — P1

Create controlled tools to retrieve results, run the authoritative calculator with validated inputs, query model warnings, compare revisions, retrieve approved code references, and draft reports from structured data.

The AI may choose a supported tool and explain the result. The deterministic calculation engine remains responsible for numerical results. Validate inputs, permissions, units, and revision context on every call.

### 12.3 “Explain this result” throughout the app — P1

Place an **Ask AI about this result** action beside failed checks, formulas, graphs, warnings, tables, and solver messages.

The answer should explain:
1. What the result means.
2. Which inputs and assumptions control it.
3. The governing limit state or criterion.
4. Why it passed, failed, or could not be assessed.
5. Which inputs may be worth reviewing.
6. What must be recalculated after a change.

Pass the selected result/object directly to the assistant rather than making users copy large calculations into chat.

### 12.4 Engineering-aware modes — P1–P2

Provide modes with different retrieval and tool permissions:
- **Explain:** concepts, formulas, and calculation steps.
- **Diagnose:** investigate a selected failure/warning.
- **Review:** find missing inputs, unsupported checks, and inconsistencies.
- **Compare:** compare saved revisions or evaluated options.
- **Document:** draft calculation narratives and review summaries from verified results.
- **Learn:** educational guidance separated from formal project results.

Modes must not bypass validation.

### 12.5 Proposed changes with preview and confirmation — P1–P2

The assistant may suggest changing a section or parameter, but must not silently mutate the model.

Workflow:
1. Propose a specific change and reason.
2. Show before/after preview and affected elements.
3. User confirms or cancels.
4. Apply as a new revision or reversible operation.
5. Rerun required analysis and checks.
6. Summarize actual new results and remaining issues.

Never claim a proposed design is safe before the authoritative engine evaluates it.

### 12.6 Code and source citations — P1

For engineering claims, show code title/edition/clause, approved source link, project inputs/results used, and calculation/tool result IDs where available. Do not fabricate clauses or quote unverified text. Respect code licensing. If a source cannot be verified, say so.

### 12.7 Evidence and coverage transparency — P1

Avoid a vague single confidence percentage. Label evidence as:
- Verified from current project data.
- Calculated by Zeta engine.
- Supported by cited reference.
- General explanation.
- Missing information.
- Unsupported / not assessed.

Say when needed data cannot be inspected or a check is outside implemented scope.

### 12.8 Project-scoped memory — P2

Allow users to store project preferences/decisions such as units, code edition, naming conventions, and review comments. Separate project memory from personal chat history. Bind remembered decisions to a project/revision, show last-confirmed dates, ask before applying material design assumptions, and provide deletion/reset controls. Old answers must never be treated as current calculation results.

### 12.9 Engineering document uploads — P2

Where supported, accept calculation PDFs, specifications, geotechnical reports, spreadsheets, and solver outputs. Extract with page/sheet references, flag unreadable scans and unit conflicts, distinguish document values from active model values, and ask which source controls when documents conflict. Never silently overwrite project inputs from extracted text.

### 12.10 Structured engineering answers — P2

**Failure diagnosis:** finding/status, governing combination, demand/capacity/utilization/units, limit state, assumptions, source, next review steps, required rechecks.

**Calculation explanation:** given data, formula/variables, substitution/units, engine result, applicability, limitations.

**Design review:** passed, failed, unassessed, unsupported, warnings, open comments, revision/report IDs.

These templates do not imply every workflow supplies every field. Label missing values rather than inventing them.

## 13. Recommended AI architecture

Use the existing server-side AI API route/provider integration where practical. Keep provider credentials out of the browser.

Conceptual architecture:

```text
Chat UI
  -> Authenticated AI API
  -> Permission checks, rate limits, request validation
  -> Intent routing and relevant context retrieval
       - Active model/revision
       - Analysis/design results
       - Calculation engine tools
       - Approved code/reference library
       - Reports/revision history
       - User-provided documents
  -> AI explanation grounded in tool results
  -> Structured answer with sources, statuses, and limitations
```

Requirements:
- Keep API keys server-side.
- Enforce authorization on every project/tool request.
- Apply server-side rate limits and usage controls.
- Validate tool arguments against schemas and allowlist tools.
- Treat uploaded/retrieved text as untrusted content, not instructions.
- Prevent prompt injection from overriding rules, permissions, or validation.
- Keep audit records of meaningful tool calls without logging secrets.
- Add timeout, cancellation, and graceful failure handling.
- Use typed tool outputs, not arbitrary UI text.
- Keep deterministic engineering calculations separate from language generation.
- Version prompts, tool schemas, provider configuration, and evaluation cases.

## 14. AI quality and safety gates

### Correctness tests
- Reports exact values returned by the engine.
- Does not invent IDs, combinations, clauses, units, or results.
- Identifies stale results and their revision.
- Reports unsupported/not-assessed checks honestly.
- Requests missing inputs instead of assuming them.
- Identifies conflicting project data.

### Security tests
- Users cannot retrieve another user's project through chat tools.
- Read-only reviewers cannot mutate models.
- Tool arguments cannot bypass validation.
- Prompt injection in documents cannot grant access or trigger unauthorized actions.
- Secrets never appear in browser responses or logs.
- Guest and authenticated rate limits work as intended.

### Change-management tests
- No model edit without user confirmation.
- Preview accurately lists intended changes.
- Applied changes create traceable revisions/reversible operations.
- Required analysis/design checks rerun.
- Assistant reports actual post-change results, not predictions.

### UX tests
- Answers link to relevant calculations, objects, and results.
- Users can inspect evidence and correct context.
- Educational explanation is distinguishable from verified project results.

## 15. Chatbot success metrics

Track:
- Share of project-specific factual claims traceable to tool results.
- Accuracy against reviewed engineering Q&A cases.
- Rate of invented/unsupported claims.
- Correct identification of stale/missing data.
- Tool success/error rates.
- User-rated usefulness.
- Time to resolve a warning or understand a failed check.
- Share of suggested changes previewed, applied, and successfully re-evaluated.
- Latency and cost per resolved engineering task.
- Authorization and prompt-injection evaluation results.

Do not optimize for confidently answering everything. Correctly stating what cannot be verified is valuable in engineering software.

# Part III — Implementation roadmap

## Phase 1: Trust and clarity
1. Structural Model Health Check.
2. Unified Design Review Dashboard.
3. Consistent PASS / FAIL / NOT ASSESSED / UNSUPPORTED / INVALID INPUT / STALE statuses.
4. AI access to selected current results through read-only tools.
5. “Explain this result” actions.
6. Source/revision references in AI answers.
7. Close existing report/drawing gaps already identified in the repository.

## Phase 2: Engineering workflow
1. Design Revision Comparison.
2. AI-assisted failure diagnosis and review summaries.
3. Complete multi-sheet drawing/PDF package.
4. Multi-option design comparison using the authoritative engine.
5. AI-proposed changes with preview, confirmation, and mandatory reanalysis.
6. Version-aware save/restore and stale-result handling.

## Phase 3: Collaboration and exchange
1. Reviewer comments and shared project permissions.
2. CSV/Excel and DXF workflows with validation reports.
3. BOQ pricing and revision tracking.
4. Document-grounded AI.
5. First validated IFC exchange workflow.

## Phase 4: Broader capability
1. Complete and validate additional steel-family checks.
2. Expand engineering workflows based on user demand.
3. Construction progress/delay evidence and resource planning.
4. Additional analysis-model adapters with explicit mapping/verification.
5. Project-aware AI across more validated workflows.

Adjust sequence based on user feedback, usage data, risk, and implementation dependencies.

# Part IV — Recommended first implementation

If only one initiative can start, build a **Project-Aware Engineering Copilot**, initially read-only and connected to the current model, solver diagnostics, and design-check results.

Minimum viable release:
1. Add a server-side tool to retrieve the active revision and selected member/check.
2. Add a tool to retrieve actual calculation details and solver warnings.
3. Add “Explain this result” to a failed check and solver warning.
4. Require answers to identify the source revision and separate verified facts from general explanations.
5. Add reviewed test cases for common questions, missing data, unsupported checks, and stale results.
6. Test authorization and server-side rate limits.
7. Do not allow model mutation in the first release.

## Repository references

These are starting points, not a claim that every proposed feature already exists:
- `webapp/src/pages/ModelSpace.tsx` — 3D model workflow.
- `webapp/src/engine/pipeline.ts` — analysis/design orchestration.
- `webapp/src/engine/steelDesign.ts` — current steel design scope.
- `webapp/src/engine/trussOptimize.ts` — truss optimization.
- `webapp/src/engine/designSnapshot.ts` — snapshot/fingerprint concepts.
- `webapp/src/lib/calcPdf.ts` — structured calculation PDF export.
- `webapp/src/components/WorkspacePage.tsx` — workspace calculator/report workflow.
- `HANDOFF.md` — documented follow-ups.
- `docs/scheduling.md` — scheduling follow-ups.

Before implementation, locate the current chatbot UI, API route, provider adapter, and project data-access layer in the latest branch. Reuse the existing assistant where possible and verify its current capabilities instead of assuming they are absent.

## Final product principle

Zeta's advantage should be that its AI and engineering tools work around the same traceable model, calculation results, assumptions, code scope, and revisions. The AI explains and helps navigate decisions; validated deterministic engines produce design numbers; engineers retain control over changes and professional approval.
