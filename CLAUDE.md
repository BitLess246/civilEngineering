# CLAUDE.md — working rules for this repo

Read this first. These are the standing rules and approaches to follow for
**every** task in `BitLess246/civilEngineering`. (See `HANDOFF.md` for project
status and how to continue from web/phone.)

## Golden git/PR rules (do this every time)
1. **Check the current branch before doing anything**: `git branch --show-current` + `git status`.
2. **Verify the previous PR is merged before starting the next**: `gh pr view <n> --json state,mergedAt`. Assume the user has merged prior work unless you can see otherwise.
3. **Always branch off fresh `main`. Never stack branches.** Start every task with:
   ```bash
   git checkout main && git fetch origin main && git merge --ff-only origin/main && git checkout -b <type>/<short-name>
   ```
4. **One new PR per push** — never push more work onto an already-opened/merged branch.
5. **Do not merge PRs yourself** — the user merges. After opening a PR, stop.
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
- Windows. Use the **Bash tool** with this PATH prefix on every command:
  ```bash
  export PATH="/usr/bin:/c/Program Files/nodejs:/c/Program Files/GitHub CLI:$PATH"
  ```
- Repo root: `C:\Users\raymv\Downloads\civilEngineering`. App lives in **`webapp/`**.
- Use the **`gh` CLI** for all PR/issue operations.

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
