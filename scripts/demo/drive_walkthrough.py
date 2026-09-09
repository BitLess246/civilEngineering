#!/usr/bin/env python3
"""Full Model Space walkthrough: loads -> analysis -> design -> failure ->
optimise -> dynamics -> plans -> rebar cages -> BOQ/schedule -> PDF.

Elements are located over CDP (exact DOM rects) and then clicked with a real
xdotool pointer, so the recording shows genuine cursor motion and the emitted
telemetry matches it. Cursor telemetry uses Recordly's CursorTelemetryPoint
shape: { timeMs, cx, cy, interactionType, cursorType }, cx/cy normalised 0..1.
"""
import json
import os
import subprocess
import time

HERE = os.path.dirname(os.path.abspath(__file__))
CDP = os.path.join(HERE, "cdp.mjs")
OUT_DIR = os.environ.get("DEMO_OUT_DIR", HERE)
# X display to record. Only meaningful on Linux/X11; see the note at the bottom
# of docs/demo-recording.md for driving this on Windows or macOS.
DISPLAY = os.environ.get("DISPLAY", ":0")
W, H = 1920, 1080
PREROLL = 2.0  # ffmpeg warm-up, trimmed off the front afterwards
OUT = os.path.join(OUT_DIR, "raw.mp4")
# Recordly reads auto-zoom/cursor telemetry from "<video path>.cursor.json".
TELEMETRY = OUT + ".cursor.json"

samples, t0, cur = [], None, (960, 540)


def xdo(*a):
    subprocess.run(["xdotool", *[str(x) for x in a]],
                   env={"DISPLAY": DISPLAY, "PATH": "/usr/bin:/bin"}, check=False)


def cdp(expr, attempts=3):
    """Evaluate in the page. Retries: while the app renders something heavy
    (the Gantt, a solver result) an evaluate can time out, and a single failure
    used to cascade into a run of missed clicks."""
    for i in range(attempts):
        try:
            r = subprocess.run(["node", CDP, expr],
                               capture_output=True, text=True, timeout=45)
            if r.returncode == 0:
                try:
                    return json.loads(r.stdout.strip())
                except Exception:
                    return None
        except subprocess.TimeoutExpired:
            pass
        if i < attempts - 1:
            time.sleep(1.5)
    return None


def log(interaction="move", cursor_type="arrow"):
    if t0 is None:
        return
    x, y = cur
    samples.append({"timeMs": round((time.monotonic() - t0) * 1000.0),
                    "cx": max(0.0, min(1.0, x / W)), "cy": max(0.0, min(1.0, y / H)),
                    "interactionType": interaction, "cursorType": cursor_type})


def ease(t):
    return 4 * t * t * t if t < 0.5 else 1 - pow(-2 * t + 2, 3) / 2


def move(x, y, dur=1.0, ct="arrow"):
    global cur
    sx, sy = cur
    steps = max(2, int(dur * 30))
    for i in range(1, steps + 1):
        f = ease(i / steps)
        nx, ny = round(sx + (x - sx) * f), round(sy + (y - sy) * f)
        cur = (nx, ny)
        xdo("mousemove", nx, ny)
        log(cursor_type=ct)
        time.sleep(dur / steps)
    cur = (x, y)


def hold(dur, ct="arrow"):
    end = time.monotonic() + dur
    while time.monotonic() < end:
        log(cursor_type=ct)
        time.sleep(0.1)


# --- element finders (JS expressions evaluating to an Element) ---
def TAB(name):
    return f"[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==={json.dumps(name)})"


def BTN(text):
    return f"[...document.querySelectorAll('button')].find(b=>b.textContent.includes({json.dumps(text)}))"


def BTN_NOT(text, excl):
    return (f"[...document.querySelectorAll('button')].find(b=>b.textContent.includes({json.dumps(text)})"
            f"&&!b.textContent.includes({json.dumps(excl)}))")


def LABEL_INPUT(text):
    return (f"(()=>{{const l=[...document.querySelectorAll('label')].find(x=>x.textContent.includes({json.dumps(text)}));"
            f"return l?(l.querySelector('input')||l.parentElement.querySelector('input')):null;}})()")


def TEXT_EL(text):
    return (f"[...document.querySelectorAll('h1,h2,h3,div,span,p,tr')].find(e=>e.textContent.includes({json.dumps(text)})"
            f"&&e.textContent.trim().length<160)")


def read_rect(finder):
    expr = (f"(()=>{{const el={finder}; if(!el) return null; const r=el.getBoundingClientRect();"
            f"return JSON.stringify({{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),"
            f"top:Math.round(r.top),h:Math.round(r.height)}});}})()")
    v = cdp(expr)
    return json.loads(v) if v else None


def rect(finder, smooth=False):
    """Scroll into view, then measure. The app scrolls an inner container, so
    scrollIntoView is the only thing that moves it -- window.scrollBy is inert.
    Instant scrolling keeps the measured rect valid while the pointer travels."""
    behavior = "smooth" if smooth else "auto"
    cdp(f"(()=>{{const el={finder}; if(!el) return null;"
        f"el.scrollIntoView({{block:'center',behavior:'{behavior}'}}); return null;}})()")
    time.sleep(1.4 if smooth else 0.9)
    return read_rect(finder)


def click(finder, label="", move_dur=1.1, settle=0.7, ct="pointer"):
    r = rect(finder)
    if not r:
        print(f"  MISS {label}")
        return False
    move(r["x"], max(12, min(H - 12, r["y"])), move_dur, ct=ct)
    # Re-measure: any late layout shift while the pointer travelled would
    # otherwise land the click on whatever moved into that spot.
    r2 = read_rect(finder)
    if r2 and (abs(r2["x"] - r["x"]) > 5 or abs(r2["y"] - r["y"]) > 5):
        move(r2["x"], max(12, min(H - 12, r2["y"])), 0.3, ct=ct)
    log("click", ct)
    xdo("click", "1")
    time.sleep(0.12)
    log("mouseup", ct)
    hold(settle, ct)
    print(f"  clicked {label}")
    return True


def set_checkbox(finder, desired, label=""):
    """Click only if the checkbox isn't already in the wanted state."""
    state = cdp(f"(()=>{{const el={finder}; return el? !!el.checked : null;}})()")
    if state is None:
        print(f"  MISS checkbox {label}")
        return
    if state == desired:
        print(f"  {label} already {desired}")
        hold(1.0)
        return
    click(finder, f"{label} -> {desired}", settle=1.8)


def type_into(finder, text, label=""):
    r = rect(finder)
    if not r:
        print(f"  MISS input {label}")
        return
    move(r["x"], r["y"], 1.1, ct="text")
    log("click", "text")
    xdo("click", "--repeat", "3", "--delay", "80", "1")
    time.sleep(0.35)
    log("mouseup", "text")
    for ch in text:
        xdo("type", "--delay", "0", ch)
        log(cursor_type="text")
        time.sleep(0.075)
    hold(0.5, "text")
    print(f"  typed {label}={text}")


def wait_until(pred_js, timeout=180, ct="arrow"):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if cdp(f"(()=>{{try{{return !!({pred_js});}}catch(e){{return false;}}}})()") is True:
            hold(0.8, ct)
            return True
        hold(1.0, ct)
    print("  TIMEOUT waiting")
    return False


def reveal(finder, dur=1.6):
    """Smooth-scroll something into view and dwell on it."""
    cdp(f"(()=>{{const el={finder}; if(el) el.scrollIntoView({{block:'center',behavior:'smooth'}}); return null;}})()")
    hold(dur)


ff = subprocess.Popen(
    ["ffmpeg", "-loglevel", "error", "-y", "-f", "x11grab", "-framerate", "30",
     "-video_size", f"{W}x{H}", "-i", DISPLAY, "-c:v", "libx264", "-preset",
     "ultrafast", "-crf", "18", "-pix_fmt", "yuv420p", OUT], stdin=subprocess.PIPE)
time.sleep(PREROLL)
t0 = time.monotonic()
xdo("mousemove", *cur)
hold(1.0)

print("1. geometry / grid")
click(TAB("Geometry"), "Geometry tab", settle=1.0)
type_into(LABEL_INPUT("Bays X"), "6, 6, 6", "baysX")
type_into(LABEL_INPUT("Bays Z"), "5, 5", "baysZ")
click(BTN("Regenerate grid model"), "regenerate", settle=0.5)
hold(4.5)

print("2. orbit")
move(350, 950, 1.2)
log("click", "closed-hand"); xdo("mousedown", "1")
for p in [(760, 720), (430, 880), (620, 800)]:
    move(*p, 2.4, ct="closed-hand")
xdo("mouseup", "1"); log("mouseup", "closed-hand")
hold(1.5)

print("3. seismic + wind loads")
click(TAB("Loading"), "Loading tab", settle=1.2)
reveal(BTN("Seismic"), 2.5)
click(BTN_NOT("Generate E cases", "RSA"), "generate E", settle=1.0)
hold(4.0)
reveal(BTN("Wind — NSCP 207B"), 2.0)
click(BTN("Generate W cases"), "generate W", settle=1.0)
hold(4.0)

print("4. analyse")
click(TAB("Analysis"), "Analysis tab", settle=2.0)
click(BTN("Analyze"), "analyze", settle=0.5)
wait_until(f"!{TAB('Design')}.disabled", 200)
hold(2.0)

print("5. design")
click(TAB("Design"), "Design tab", settle=1.2)
click(BTN("Design structure"), "design", settle=0.5)
wait_until("document.body.innerText.includes('beam & girder schedule')", 240)
hold(2.5)

print("6. schedules")
for name in ["beam & girder schedule", "Column schedule", "Slab schedule", "Footing schedule"]:
    reveal(TEXT_EL(name), 3.2)

print("7. open a failing slab row")
click("[...document.querySelectorAll('tr.sched-row')].find(r=>r.textContent.includes('s0.0.1'))",
      "failing slab row", settle=1.0)
hold(6.0)

print("8. optimise")
click(TAB("Design"), "Design tab", settle=1.0)
click(BTN("Optimize design"), "optimize", settle=0.5)
hold(30.0)

print("9. re-run analysis + dynamics")
click(TAB("Analysis"), "Analysis tab", settle=1.5)
click(BTN("Analyze"), "re-analyze", settle=0.5)
wait_until(f"!{TAB('Design')}.disabled", 200)
hold(2.0)

click(TAB("Nonlinear"), "Nonlinear tab", settle=1.5)
click(BTN("Run nonlinear time-history"), "nonlinear TH", settle=0.5)
hold(35.0)

click(TAB("Modal"), "Modal tab", settle=1.5)
click(BTN("Run modal analysis"), "modal", settle=0.5)
hold(25.0)

click(TAB("Pushover"), "Pushover tab", settle=1.5)
click(BTN("Run pushover"), "pushover", settle=0.5)
hold(30.0)
click(BTN("Run biaxial pushover"), "biaxial pushover", settle=0.5)
hold(35.0)

print("10. plans")
click(TAB("Plans"), "Plans tab", settle=1.5)
hold(8.0)

print("11. display: cages on, loads off")
click(TAB("Display"), "Display tab", settle=1.5)
# These are persistent view settings, so clicking blindly toggles whatever the
# previous run left behind. Only click when the state actually needs changing.
set_checkbox(LABEL_INPUT("Show load diagrams"), False, "load diagrams")
set_checkbox(LABEL_INPUT("Show reinforcement cages"), True, "reinforcement cages")
hold(3.0)

print("12. zoom into rebar")
move(900, 560, 1.4)
for _ in range(9):
    xdo("click", "4")
    log()
    time.sleep(0.34)
hold(4.0)
move(350, 950, 1.2)
log("click", "closed-hand"); xdo("mousedown", "1")
for p in [(640, 820), (500, 900)]:
    move(*p, 2.2, ct="closed-hand")
xdo("mouseup", "1"); log("mouseup", "closed-hand")
hold(4.0)

print("13. BOQ + construction schedule")
click(TAB("Bill of Quantities"), "BOQ tab", settle=2.0)
hold(2.5)
reveal(TEXT_EL("Material take-off"), 3.0)
reveal(TEXT_EL("Bill of Materials"), 3.5)
reveal(TEXT_EL("Grand total"), 3.5)
click(TAB("Construction Schedule"), "construction schedule tab", settle=2.0)
hold(2.5)
reveal(TEXT_EL("PROJECT DURATION"), 3.5)
reveal(TEXT_EL("Critical-path diagram"), 4.0)

print("14. export pdf")
click(BTN("Export PDF report"), "export pdf", settle=1.0)
hold(6.0)  # dwell on the report configurator (sections + analysis appendix)
# Combined PDF only: one file, so Chromium's "download multiple files"
# permission prompt (which blocks the download and covers the page) never fires.
set_checkbox(LABEL_INPUT("Structure Design Report"), False, "structure report pdf")
set_checkbox(LABEL_INPUT("Analysis Appendix"), False, "analysis appendix pdf")
set_checkbox(LABEL_INPUT("Combined PDF"), True, "combined pdf")
click(TAB("Generate"), "generate report", settle=1.0)
hold(45.0)  # jsPDF builds ~24 MB of report client-side

ff.communicate(input=b"q", timeout=30)
with open(TELEMETRY, "w") as fh:
    json.dump(samples, fh)
print(f"DONE samples={len(samples)} duration={samples[-1]['timeMs']/1000.0:.1f}s")
