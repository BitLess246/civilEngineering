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

### Running it on Windows (the better way)

The driver is cross-platform. It picks its backend from the platform: on
Linux/X11 it drives `xdotool` and records with ffmpeg; anywhere else it drives
`pyautogui` (`pip install pyautogui`) and **lets Recordly do the recording**, so
the ffmpeg capture and the synthesized sidecar are skipped entirely — Recordly
captures its own cursor telemetry natively there.

```powershell
cd webapp
npx vite build ; npx vite preview --port 8080 --host 127.0.0.1 --strictPort
# separate terminal — any Chromium-based browser, Edge included
chrome --remote-debugging-port=9222 --start-fullscreen `
       --user-data-dir=$env:TEMP\demo-profile "http://127.0.0.1:8080/model"
```

Start Recordly recording the screen, run
`python scripts/demo/drive_walkthrough.py`, and stop the recording when it
prints `DONE`. The footage lands in Recordly's editor with real cursor data
already attached; from there it is **Suggest Zooms from Cursor** → **Export**.

Note the `VITE_SUPABASE_*` variables must be unset for this build too, or
`/model` sits behind the login. In PowerShell that is
`Remove-Item Env:VITE_SUPABASE_URL, Env:VITE_SUPABASE_ANON_KEY` (ignore errors
if they were never set) before `npx vite build`.

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

### Doing it on Windows

No source build is needed — Recordly publishes a prebuilt NSIS installer,
`Recordly-windows-x64.exe`, at
<https://github.com/webadderallorg/Recordly/releases>, and is on WinGet as
`Webadderall.Recordly`. (Its README lists Visual Studio + CMake, but those are
only for rebuilding the native helpers; the `win32-x64` binaries are committed.)

Put the video and its sidecar in one folder, then either:

- launch bar → **⋮** (More) → **"Open video file"**, which drops you straight
  into the editor; or
- in the editor, **Projects** → **Import**.

Then **"Suggest Zooms from Cursor"** in the timeline, and **Export** → MP4 (the
save dialog defaults to Downloads). Export uses the GPU ladder there — NVIDIA
CUDA, else Direct3D 11, else ffmpeg.

**The sidecar name is matched literally**, by appending `.cursor.json` to the
video's path *including its extension*: `demo.mp4.cursor.json`, never
`demo.cursor.json`. A missing sidecar is not an error — `get-cursor-telemetry`
returns zero samples — so the only symptom of getting this wrong is that no zoom
suggestions ever appear. Rename the video and you must rename the sidecar with it.

Recording natively on Windows needs none of this: it captures its own cursor
telemetry, uses Windows Graphics Capture and native WASAPI audio, and wants
Windows 10 build 19041 or newer.
