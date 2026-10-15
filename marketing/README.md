# Zeta marketing kit

Phase 1 of the marketing brief (*Zeta — Full Web App Audit, Feature Marketing
Strategy & AI Content Generation Plan*): an evidence library, the claims Zeta
may make, reusable AI prompts, the first 30-day campaign, and the first five
vertical posts — all built from the running app, not mocked up.

| Folder | What it holds |
|---|---|
| [`evidence/`](evidence) | Captures of the current app (2026-10-15, `main` at `317d778`): Model Space, concrete, steel, geotechnical, Code Library, reports, plus element-level crops |
| [`verification/verified-examples.md`](verification/verified-examples.md) | Every number marketing may show — inputs, Zeta's output, an independent check, the date |
| [`verification/approved-marketing-claims.md`](verification/approved-marketing-claims.md) | Approved / verify-first / do-not-publish claims, and where the brief disagrees with the code |
| [`brand/brand-guidelines.md`](brand/brand-guidelines.md) | Logo, colour, type and the 9:16 layout rules |
| [`prompts/master-prompt.md`](prompts/master-prompt.md) | The master prompt and prompts A–D, filled in with Zeta's real facts |
| [`campaign/posts.mjs`](campaign/posts.mjs) → [`campaign/30-day-plan.md`](campaign/30-day-plan.md) | 16 posts: hook, format, evidence, status, and three counted captions each |
| [`assets/`](assets) | The first five posts, 1080 × 1920 PNG |
| [`tools/`](tools) | `captions.mjs` (counts and validates captions, writes the plan), `posters.html` + `render-posters.mjs` (renders `assets/`) |

## The five posts (brief §14, Phase 2)

| # | File | Story | Verified by |
|---|---|---|---|
| 1 | `assets/01-introducing-zeta.png` | Model → Design → Detail → Deliver, one frame | V6 |
| 2 | `assets/02-model-space.png` | From a column grid to a designed frame — 0 fail · 8 near · 28 pass | V6 |
| 3 | `assets/03-concrete-beam.png` | Why a beam needs bars *and* stirrups — 0.95 / 0.80 | V1 |
| 4 | `assets/04-steel-beam.png` | Can this steel beam pass? — no, 147 % (LTB) | V2 |
| 5 | `assets/05-model-to-deliverable.png` | Cages, framing plan, quantities from the same session | V6 |

## Rebuild

```bash
# captions: count, validate (< 400, hashtags, URL, evidence exists), write the plan
node marketing/tools/captions.mjs

# posters: needs Playwright resolvable from marketing/ (npm i playwright) and Chromium
node marketing/tools/render-posters.mjs            # all five, or name ids: intro model concrete steel deliver
```

New evidence: run the app (`cd webapp && VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npx vite`),
capture with Playwright at device scale 2–3, save under `evidence/<area>/`, and
add the numbers to `verified-examples.md` **before** they appear in a post.

## The weekly loop (brief §12)

Pick a feature → verify it in the app and record it in `verified-examples.md`
→ add or edit its post in `campaign/posts.mjs` → `node tools/captions.mjs` →
produce the visual from the evidence with a prompt from `prompts/` → technical
review against `approved-marketing-claims.md` → publish → record reach, watch
time, saves, link clicks and sign-ups → choose next week's follow-up.
