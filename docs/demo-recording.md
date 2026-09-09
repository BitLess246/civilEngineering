# Recording the Model Space demo video

How the CIVENGG demo walkthrough is produced: a scripted, deterministic
walkthrough of `/model` driven by synthetic input, recorded to video, and
polished in [Recordly](https://github.com/webadderallorg/Recordly).

The driver is `scripts/demo/drive_walkthrough.py`. It locates every control
through the Chrome DevTools Protocol (real DOM rects) and then clicks it with a
real pointer, so the recording shows genuine cursor motion rather than
teleporting clicks — and the cursor path it emits doubles as Recordly's
auto-zoom input.

## Why CDP instead of fixed coordinates

The first attempts hard-coded screen coordinates and drifted badly:

- The right-hand rail keeps its **scroll position across tab switches**, so a
  button measured once is somewhere else next time.
- Dragging on the 3-D model **selects** a member; the resulting properties panel
  pushes everything below it down, and every later click lands on the wrong
  control. Orbit from empty viewport space instead.
- `window.scrollBy` / `scrollTo` are **inert** — the app scrolls an inner
  container, not the window. Only `scrollIntoView` moves it.
- Smooth `scrollIntoView` invalidates a rect measured before the pointer
  finishes travelling; the driver scrolls instantly and re-measures immediately
  before clicking.
- View toggles (`Show load diagrams`, `Show reinforcement cages`) **persist**
  between runs, so they must be set from their current state, never toggled
  blindly.

## Prerequisites

Serve a build with Supabase **unconfigured** so `RequireAuth`
(`webapp/src/components/RequireAuth.tsx`) bypasses and `/model` opens with no
login and no trial gate:

```bash
cd webapp
env -u VITE_SUPABASE_URL -u VITE_SUPABASE_ANON_KEY npx vite build
npx vite preview --port 8080 --host 127.0.0.1 --strictPort
```

Launch Chrome with remote debugging pointed at it:

```bash
chrome --remote-debugging-port=9222 --start-fullscreen \
       --user-data-dir=/tmp/demo-profile "http://127.0.0.1:8080/model"
```

Then `python3 scripts/demo/drive_walkthrough.py`. It writes `raw.mp4` plus
`raw.cursor.json`.

### Known build snag

`@tailwindcss/node` **4.3.0 crashes with SIGBUS** in some sandboxed/container
environments, taking `vite` down with it before it reads the config (its deps
`oxide`, `jiti`, `enhanced-resolve` and `tailwindcss` each import fine alone).
Pinning `tailwindcss` and `@tailwindcss/vite` to **4.1.14** resolves it.

## What the walkthrough covers

Grid `6,6,6 × 5,5` → orbit → **seismic (NSCP 208) and wind (NSCP 207B) case
generation** → 3-D FEM → design → beam/column/slab/footing schedules → open a
failing slab row → optimize (failing → all pass) → re-analysis, nonlinear
time-history, modal, pushover, biaxial pushover → plans → reinforcement cages on
/ load diagrams off → rebar zoom → Bill of Quantities → CPM/PERT construction
schedule → combined PDF report.

Generating the E and W cases matters: with them the governing combination moves
from `1.2D + 1.6L` to a seismic one (`1.42D + 1.0E + 0.5L + 0.25`), which is
what the schedules are then designed against.

## Polishing in Recordly

Recordly's editor does not need its own recorder — feed it any file:

1. `window.electronAPI.setCurrentVideoPath(path)` then `switchToEditor()`, or
   just use the app's **Import** action. Neither restricts the directory.
2. Auto-zoom and cursor polish read a sidecar at `<video>.cursor.json`
   (`CursorTelemetryPoint[]`: `{timeMs, cx, cy, interactionType, cursorType}`,
   `cx`/`cy` normalised 0–1). The driver writes exactly this, so
   **Suggest Zooms from Cursor** works on an externally recorded file.
3. Export from the editor.

### Run this on Windows or macOS, not in a headless container

Recordly's cursor-monitor helper ships prebuilt for `win32-x64`,
`darwin-arm64` and `darwin-x64` only — **there is no Linux binary**, so on Linux
it can never record cursor telemetry itself (hence the synthesized sidecar).

More importantly, export is GPU-bound. Under software rendering (SwiftShader) it
manages roughly **0.5 fps**, which is hours for a few minutes of footage; on real
hardware it is a short wait. Record wherever you like, but polish and export on a
machine with a working GPU.
