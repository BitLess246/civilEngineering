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
5. **Don't merge PRs yourself unless the user explicitly asks.** By default the user merges — open the PR and stop. Merge automatically only when the user authorizes it for that task.
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
