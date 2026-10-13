"""Zeta brand art — one geometry, every output.

    python3 scripts/brand/brand.py FONTS_DIR

FONTS_DIR holds two OFL faces from Google Fonts (not committed):
    archivo-x600.ttf   Archivo, wdth 125 (Expanded), wght 600
    plexmono500.ttf    IBM Plex Mono, wght 500
(css2?family=Archivo:wdth,wght@125,600 and family=IBM+Plex+Mono:wght@500 —
the stylesheet links the .ttf.)

Writes branding/*.svg, webapp/public/favicon.svg and
webapp/src/lib/brandArt.ts. Text is converted to outlines, so no output
depends on a font being installed. PNG exports: scripts/brand/render.mjs.

THE MARK. A folded strip on a 64 grid, every edge on 0° or 45° so it stays
crisp at 16 px. The diagonal passes OVER the top bar's end and UNDER the
bottom bar's, which is what makes three flat bars read as one folded band;
depth comes from the two contact shadows and a light-from-above gradient on
each face, not from a glow. Blue only — it sits on both the paper and the ink
grounds without a variant.
"""
import os, sys, json
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
INK, PAPER, MUTED_INK, MUTED_PAPER = '#0f1b2a', '#f4f3ef', '#4a5a6e', '#a9b7c6'

# ── the mark ────────────────────────────────────────────────────────────────
OX = 2  # centres the 60-wide figure on the 64 grid
FACES = {
    'top':  [(14, 10), (60, 10), (50, 20), (4, 20)],
    'diag': [(60, 10), (46, 10), (2, 54), (16, 54)],     # x+y = 70 and x+y = 56
    'bot':  [(12, 44), (60, 44), (50, 54), (2, 54)],
    'shTop': [(46, 10), (39, 10), (29, 20), (36, 20)],   # diagonal's shadow on the top bar
    'shBot': [(17, 39), (31, 39), (26, 44), (12, 44)],   # bottom bar's shadow on the diagonal
}
GRAD = {
    't':  ('0 0 0 1', [('0', '#9cc6f2', 1), ('1', '#6aa6e6', 1)]),
    'd':  ('0 0 1 1', [('0', '#2f7fd6', 1), ('1', '#174f98', 1)]),
    'b':  ('0 0 0 1', [('0', '#4a92e0', 1), ('1', '#2c6fc2', 1)]),
}
SHADOW = {
    's1': ((46 + OX, 15, 36 + OX, 15), '#0b2b57', .45),
    's2': ((0, 44, 0, 39), '#061d3d', .55),
}

def pts(name):
    return ' '.join(f'{x + OX:g},{y:g}' for x, y in FACES[name])

def mark_defs(p):
    out = []
    for k, (v, stops) in GRAD.items():
        x1, y1, x2, y2 = v.split()
        s = ''.join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c, _ in stops)
        out.append(f'<linearGradient id="{p}{k}" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}">{s}</linearGradient>')
    for k, ((x1, y1, x2, y2), c, a) in SHADOW.items():
        out.append(f'<linearGradient id="{p}{k}" gradientUnits="userSpaceOnUse" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}">'
                   f'<stop offset="0" stop-color="{c}" stop-opacity="{a}"/><stop offset="1" stop-color="{c}" stop-opacity="0"/></linearGradient>')
    return '<defs>' + ''.join(out) + '</defs>'

def mark_body(p):
    return (f'<polygon points="{pts("top")}" fill="url(#{p}t)"/>'
            f'<polygon points="{pts("shTop")}" fill="url(#{p}s1)"/>'
            f'<polygon points="{pts("diag")}" fill="url(#{p}d)"/>'
            f'<polygon points="{pts("shBot")}" fill="url(#{p}s2)"/>'
            f'<polygon points="{pts("bot")}" fill="url(#{p}b)"/>')

# ── type to outlines ────────────────────────────────────────────────────────
def outline(font, text, size, x, base, track_em=0.0):
    f = TTFont(font); gs = f.getGlyphSet(); cmap = f.getBestCmap(); s = size / f['head'].unitsPerEm
    d, cx = [], x
    for ch in text:
        g = cmap[ord(ch)]
        pen = SVGPathPen(gs, lambda v: f'{v:.2f}'.rstrip('0').rstrip('.'))
        gs[g].draw(TransformPen(pen, (s, 0, 0, -s, cx, base)))
        d.append(pen.getCommands())
        cx += gs[g].width * s + track_em * size
    return ' '.join(d), cx - track_em * size - x

def cap(font):
    f = TTFont(font); return f['OS/2'].sCapHeight / f['head'].unitsPerEm

def main(fonts):
    AX, PM = os.path.join(fonts, 'archivo-x600.ttf'), os.path.join(fonts, 'plexmono500.ttf')
    CAP = 34.0                       # the word's cap height, centred on the mark's 44-unit band
    size = CAP / cap(AX); base = 32 + CAP / 2; gap = 12; x0 = 66 + gap
    word, ww = outline(AX, 'ZETA', size, x0, base, 0.04)
    TAG = 'STRUCTURAL ENGINEERING MADE CLEARER'; tsize = 5.6
    _, nat = outline(PM, TAG, tsize, 0, 0)
    tag, _ = outline(PM, TAG, tsize, x0 + 1, base + 12.5, (ww - 1 - nat) / (len(TAG) - 1) / tsize)

    def svg(W, H, body, label, scale=4):
        return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W:.2f} {H}" width="{W * scale:.0f}" height="{H * scale}" '
                f'role="img" aria-label="{label}"><title>{label}</title>{body}</svg>\n')
    mark = mark_defs('z') + mark_body('z')
    W = x0 + ww + 2
    files = {
        'branding/zeta-mark.svg': svg(64, 64, mark, 'Zeta'),
        'webapp/public/favicon.svg': svg(64, 64, mark, 'Zeta', 1),
    }
    for name, fill, mfill in (('ink', INK, MUTED_INK), ('paper', PAPER, MUTED_PAPER)):
        files[f'branding/zeta-logo-{name}.svg'] = svg(W, 64, mark + f'<path d="{word}" fill="{fill}"/>', 'Zeta')
        files[f'branding/zeta-lockup-{name}.svg'] = svg(W, 72, mark + f'<path d="{word}" fill="{fill}"/><path d="{tag}" fill="{mfill}"/>',
                                                        'Zeta — structural engineering made clearer')
    # the app's copy: mark geometry + the wordmark normalised to x = 0, cap top at y = 0
    word0, _ = outline(AX, 'ZETA', size, 0, CAP, 0.04)
    ts = ('// GENERATED by scripts/brand/brand.py — edit the generator, not this file.\n'
          '// The Zeta mark (64-unit grid) and the ZETA wordmark as outlines, so the\n'
          '// header renders the exact brand art in currentColor with no font dependency.\n\n'
          f'export const MARK_FACES = {json.dumps({k: pts(k) for k in FACES})} as const\n\n'
          f'export const MARK_GRADIENTS = {json.dumps({k: {"v": v, "stops": [[o, c] for o, c, _ in st]} for k, (v, st) in GRAD.items()})} as const\n\n'
          f'export const MARK_SHADOWS = {json.dumps({k: {"x": list(xy), "color": c, "alpha": a} for k, (xy, c, a) in SHADOW.items()})} as const\n\n'
          f'/** viewBox `0 0 {ww:.2f} {CAP:g}`: the cap height is the box height. */\n'
          f'export const WORDMARK = {{ d: {json.dumps(word0)}, w: {ww:.2f}, h: {CAP:g} }} as const\n')
    files['webapp/src/lib/brandArt.ts'] = ts
    # the reels' copy: per-letter outlines so each letter can rise on its own beat
    f = TTFont(AX); gs = f.getGlyphSet(); cmap = f.getBestCmap(); sc = size / f['head'].unitsPerEm
    letters, cx = [], 0.0
    for ch in 'ZETA':
        g = cmap[ord(ch)]; pen = SVGPathPen(gs, lambda v: f'{v:.2f}'.rstrip('0').rstrip('.'))
        gs[g].draw(TransformPen(pen, (sc, 0, 0, -sc, 0, CAP)))
        letters.append({'d': pen.getCommands(), 'x': round(cx, 2)})
        cx += gs[g].width * sc + 0.04 * size
    js = ('// GENERATED by scripts/brand/brand.py — the Zeta mark and wordmark for the reels.\n'
          f'const BRAND = {json.dumps({"faces": {k: pts(k) for k in FACES}, "grad": {k: {"v": v, "stops": [[o, c] for o, c, _ in st]} for k, (v, st) in GRAD.items()}, "shadow": {k: {"x": list(xy), "color": c, "alpha": a} for k, (xy, c, a) in SHADOW.items()}, "word": {"letters": letters, "w": round(ww, 2), "h": CAP, "em": round(size, 3)}})}\n')
    files['scripts/showreel/brandArt.js'] = js
    for rel, body in files.items():
        with open(os.path.join(ROOT, rel), 'w') as fh: fh.write(body)
        print('wrote', rel)

if __name__ == '__main__':
    main(sys.argv[1])
