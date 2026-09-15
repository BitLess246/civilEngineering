---
target: the UI (app chrome + representative surfaces)
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 4
target_identity: "file:/home/user/civilEngineering/webapp/src/components/AppShell.tsx"
target_fingerprint: "sha256:060e6b608e9b0390ea1e408de75064e4695817aa51d5c11a5d7bcd6f432a6e6c"
target_path: /home/user/civilEngineering/webapp/src/components/AppShell.tsx
timestamp: 2026-09-15T12-36-15Z
slug: webapp-src-components-appshell-tsx
---
Method: dual-agent (A: design review · B: detector + browser evidence, isolated and parallel)

# Design critique — CivEngg Toolkit (Operate mode)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | One hard-coded `<title>` for all 53 routes; a serviceability check that never ran is never announced. |
| 2 | Match System / Real World | 4 | Title block, sheet/rev codes, mark numbers, clause margins, NSCP strings verbatim. |
| 3 | User Control and Freedom | 2 | No focus trap in any of 7 aria-modal dialogs; focus escapes the welcome dialog at tab 15. No nav below 1024px; sidebar cannot collapse. |
| 4 | Consistency and Standards | 2 | Two live design systems. 79/152 files on cool slate against warm paper; #0056b3 259x and not a token; 61 files use emerald/red/amber over declared semantics. |
| 5 | Error Prevention | 2 | Export fires with an empty title block; `allOK` treats an unevaluated deflection check as a pass. |
| 6 | Recognition Rather Than Recall | 3 | 4 result values truncate with no title attribute; CodeHint on 1 of ~58 pages. |
| 7 | Flexibility and Efficiency | 3 | Command palette is the only keyboard shortcut in the app. |
| 8 | Aesthetic and Minimalist Design | 2 | 63 nav options beside every task; 6907px single-scroll calculator; the character layer fails contrast. |
| 9 | Error Recovery | 2 | Failure names the check but never what to change; optimizeBeamMember exists, unoffered. |
| 10 | Help and Documentation | 2 | No help entry point in the app chrome. |
| **Total** | | **25/40** | **Acceptable** |

## Design Specificity Verdict

Authored, not interchangeable — on the half of the codebase that received it. The drawing-sheet metaphor is load-bearing: CSS counters auto-number sheet sections, `:has()` merges rail cards into one panel, a real title block defaults to `S-01 · Rev A`. The worked solution is the best-designed component in the product.

Nothing enforces it. Tokens at index.css:15-30 are referenced ZERO times in TSX against 147 distinct hex literals. Profile.tsx is entirely legacy; walking from /beam-design to /profile is walking into a different product.

Deterministic scan: 2 findings across 152 files, BOTH false positives (active-rail nav indicator misread as a card accent; tab underline where rounding is top and border is bottom). Detector verified firing via a known-anti-pattern probe. The codebase is genuinely clean against the ruleset — the real defects are all runtime measurements no static rule would catch.

Visual overlays: none. The [Human] overlay path was deliberately skipped (no human watching); no live server was started.

## What's Working

1. The worked solution — numbered steps, substituted formulas, per-step clause margin, prose explaining judgment.
2. The metaphor is in the mechanics — CSS counters, :has() card merging, a real print stylesheet.
3. Guards above category norm — value-clamping over advisory min/max; collapsed groups unmounted so they leave the tab order.

## Priority Issues

### [P0] `DESIGN OK` can mean "we didn't check"
BeamDesign.tsx:217 treats a null deflection as a pass; :505 omits the card when optional fields are blank (their default). Title block exports empty at 1.78:1 placeholder contrast, no warning. No standalone calculator ships an assumptions block. A signable PDF headed DESIGN OK, silent about what it never evaluated. Professional-liability defect.
Fix: render every performable check as a row with a NOT CHECKED state; verdict reads "DESIGN OK (3 of 4 checks)"; block export on empty title block; add assumptions/scope. → $impeccable harden

### [P1] The tokens enforce nothing
Zero var(--*) uses in TSX; 147 distinct hex literals; 8 blues doing one job (522 uses). Also why a theme is currently impossible.
Fix: convert to @theme entries, migrate, ban new raw hex in TSX. → $impeccable extract

### [P1] The character layer is the contrast-failing layer
492 axe nodes, 28 distinct pairs. #a39d8d at 2.43–2.70:1, #8b8574 at 3.55–3.68:1, at 9.5–11.5px. Largest cluster is 53 nodes of the sub-caption describing each tool. #55677c on the navy rail is 2.98:1. Both assessments found this independently with matching numbers.
Fix: darken to >=4.5:1; lift 10px mono metadata to 11px. → $impeccable polish

### [P1] Focus is inherited, not designed
Zero focus:/focus-visible: utilities app-wide; visible ring is the Chromium UA default, never checked against the dark rail. calc.tsx:169 letterhead inputs have no indicator at all (measured element + 2 ancestors, changed:false) — WCAG 2.4.7 failure on the field carrying the engineer's name. qty.tsx ring composites to 1.25:1.
Fix: author a focus token and ring; give letterhead inputs a real indicator. → $impeccable audit

### [P1] Nothing below 1024px has navigation
AppShell.tsx:75 is hidden lg:flex, no hamburger or drawer. At 390px header breadcrumb and search pill overlap by 40px; Sign up is 54x48 in a 45px header. 97–98% of interactive elements under 44px on calculator pages, height the failing axis.
Fix: stack hero below sm, slide-over drawer below lg, or an explicit larger-screen state. → $impeccable adapt

## Persona Red Flags

Alex (power user): command palette is the only shortcut; sidebar cannot collapse; three tools all titled "Civil Engineering"; rho_max truncated with no tooltip (748px of text in a 128px box).

Sam (accessibility): 71 tab presses to content, no skip link, every navigation. No focus indicator on the field where they type their own name. 21 files render a nested <main>. 84 overflow-x-auto regions, zero with tabIndex. Credit: no icon-only nav, zero unnamed buttons across 379 interactive elements, aria-current on active link.

Casey (mobile): no navigation exists. Hero search placeholder wraps to four lines inside a 185px box. /model spends ~270px on a ribbon wrapped to 8 rows.

## Minor Observations

- Two cards both numbered 01: KaTeX's `body{counter-reset:katexEqnNo mmlEqnNo}` overrides the shorthand at index.css:63, so calccard never resets. One-line fix.
- AppShell.tsx:19 documents behaviour that does not exist (groups collapsing to first two entries).
- tabs.ts repeats its 20-line doc comment three times verbatim.
- /load-combinations opens on all zeros and badges 1.4D = 0.00 as MAX; /beam-design opens on a real worked example.
- Letterhead Date is hard-coded to today; a re-issued or back-dated report cannot be.
- Home.tsx:260 distinguishes a link by colour alone at rest.

## Questions to Consider

1. If the tokens bind nothing, what are they? What would change if #0056b3 became a build error?
2. What should Export do when the title block is empty?
3. DESIGN OK — out of how many checks? The engine knows which it ran.
4. CHECK FAILED stops at naming the problem, but optimizeBeamMember is already in the engine.
5. Who is on a phone, and what are they doing? A "needs a desktop" screen beats a ribbon wrapped to eight rows.
6. What is the persistent 53-item catalog for, given the palette, the home directory, and the disciplines the user already declared?
7. What would the rest of the app look like if designed to the standard of the worked solution?
