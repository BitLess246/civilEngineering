import { SaveFile } from './script.js';

// Render KaTeX math in an element after the JS has appended its content.
// KaTeX is synchronous (unlike MathJax) so this just works without promises.
// Falls back gracefully if KaTeX auto-render hasn't finished loading.
function renderMath(element) {
    if (!element) return;
    if (typeof renderMathInElement === 'undefined') {
        setTimeout(() => renderMath(element), 80);
        return;
    }
    try {
        renderMathInElement(element, {
            delimiters: [
                { left: '$$', right: '$$', display: true },
                { left: '\\[', right: '\\]', display: true },
                { left: '\\(', right: '\\)', display: false }
            ],
            throwOnError: false,
            errorColor: '#cc0000',
            strict: false,
            trust: true,
            macros: {
                "\\kN":  "\\,\\text{kN}",
                "\\kNm": "\\,\\text{kN}\\cdot\\text{m}",
                "\\mm":  "\\,\\text{mm}",
                "\\MPa": "\\,\\text{MPa}",
                "\\kPa": "\\,\\text{kPa}"
            }
        });
    } catch (e) {
        console.error('KaTeX render failed:', e);
    }
}

// Render math in every output panel after the calculation has appended content.
function renderAllMath() {
    ['result', 'Summary', 'Summary1', 'GivenParameters1'].forEach(id => {
        renderMath(document.getElementById(id));
    });
}

// ════════════════════════════════════════════════════════════════════════
//  SVG V / M DIAGRAMS — ported from beamDesign.html drawDiagram() so the
//  combined-footing solution shows shear/moment diagrams in the same style.
//  Pure functions: feed regularly(-ish) sampled xs + ys arrays and an
//  options bag, get back an inline-SVG string injected into `container`.
// ════════════════════════════════════════════════════════════════════════
function cfEscapeXml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
// Linear interpolation onto a sampled (xs, arr) curve — used to place the
// open-circle markers exactly on the polyline at curvature-break positions.
function cfInterpAt(x, xs, arr) {
    if (x <= xs[0]) return arr[0];
    if (x >= xs[xs.length - 1]) return arr[arr.length - 1];
    let lo = 0, hi = xs.length - 1;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (xs[mid] <= x) lo = mid; else hi = mid;
    }
    const t = (x - xs[lo]) / (xs[hi] - xs[lo] || 1);
    return arr[lo] + t * (arr[hi] - arr[lo]);
}
function cfDrawDiagram(container, xs, ys, opts = {}) {
    const { color = '#0056b3', fillColor = 'rgba(0,86,179,0.15)',
            yLabel = '', unit = '', title = '', curvXs = [] } = opts;
    const W = 900, H = 260;
    const padL = 70, padR = 24, padT = 28, padB = 40;
    const iW = W - padL - padR, iH = H - padT - padB;
    const xMin = 0, xMax = Math.max(...xs);
    let yMin = Math.min(...ys, 0), yMax = Math.max(...ys, 0);
    if (yMin === yMax) { yMin -= 1; yMax += 1; }
    const yr = yMax - yMin; yMin -= yr * 0.14; yMax += yr * 0.14;
    const sx = x => padL + (x - xMin) / (xMax - xMin) * iW;
    const sy = y => padT + (yMax - y) / (yMax - yMin) * iH;
    const yZero = sy(0);
    const path = xs.map((x, i) => `${sx(x)},${sy(ys[i])}`).join(' ');
    const fill = `${sx(xs[0])},${yZero} ${path} ${sx(xs[xs.length - 1])},${yZero}`;

    let xt = '', yt = '';
    for (let i = 0; i <= 6; i++) {
        const v = xMin + (xMax - xMin) * i / 6, px = sx(v);
        xt += `<line x1="${px}" y1="${padT + iH}" x2="${px}" y2="${padT + iH + 4}" stroke="#5c6773"/>
               <text x="${px}" y="${padT + iH + 16}" font-size="10" fill="#5c6773" text-anchor="middle">${v.toFixed(2)}</text>`;
    }
    for (let i = 0; i <= 4; i++) {
        const v = yMin + (yMax - yMin) * i / 4, py = sy(v);
        yt += `<line x1="${padL - 4}" y1="${py}" x2="${padL}" y2="${py}" stroke="#5c6773"/>
               <text x="${padL - 7}" y="${py + 3}" font-size="10" fill="#5c6773" text-anchor="end">${v.toFixed(2)}</text>`;
    }

    let iMax = 0, iMin = 0;
    for (let i = 1; i < ys.length; i++) {
        if (ys[i] > ys[iMax]) iMax = i;
        if (ys[i] < ys[iMin]) iMin = i;
    }
    const peak = Math.max(Math.abs(ys[iMax]), Math.abs(ys[iMin]), 1e-9);
    const eps  = peak * 0.005 + 1e-6;
    const seen = new Set();
    const points = [];
    if (ys[iMax] >  eps) {
        points.push({ x: xs[iMax], y: ys[iMax], label: `max = ${ys[iMax].toFixed(3)} ${unit}  @  x = ${xs[iMax].toFixed(3)} m`, above: true });
        seen.add(iMax);
    }
    if (ys[iMin] < -eps) {
        points.push({ x: xs[iMin], y: ys[iMin], label: `min = ${ys[iMin].toFixed(3)} ${unit}  @  x = ${xs[iMin].toFixed(3)} m`, above: false });
        seen.add(iMin);
    }
    [0, ys.length - 1].forEach(ie => {
        if (!seen.has(ie)) {
            points.push({ x: xs[ie], y: ys[ie], label: `${ys[ie].toFixed(3)} ${unit}`, above: ys[ie] >= 0 });
            seen.add(ie);
        }
    });

    let diamonds = '', labels = '';
    for (const p of points) {
        const cx = sx(p.x), cy = sy(p.y), r = 6;
        diamonds += `<polygon points="${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}" fill="#fff" stroke="${color}" stroke-width="2"/>`;
        const labelY = p.above ? cy - 14 : cy + 22;
        labels += `<text x="${cx}" y="${labelY}" font-size="10" font-weight="600" fill="${color}" text-anchor="middle" paint-order="stroke" stroke="rgba(255,255,255,0.85)" stroke-width="3">${cfEscapeXml(p.label)}</text>`;
    }

    let curvDots = '';
    if (Array.isArray(curvXs)) {
        for (const cx_val of curvXs) {
            if (cx_val < xMin - 1e-6 || cx_val > xMax + 1e-6) continue;
            const cy_val = cfInterpAt(cx_val, xs, ys);
            curvDots += `<circle cx="${sx(cx_val)}" cy="${sy(cy_val)}" r="3.5" fill="#fff" stroke="${color}" stroke-width="1.5"/>`;
        }
    }

    container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
        ${title ? `<text x="${W / 2}" y="16" font-size="13" font-weight="600" fill="#1f2933" text-anchor="middle">${cfEscapeXml(title)}</text>` : ''}
        <rect x="${padL}" y="${padT}" width="${iW}" height="${iH}" fill="#fafbfc" stroke="#e1e4e8"/>
        <line x1="${padL}" y1="${yZero}" x2="${padL + iW}" y2="${yZero}" stroke="#adb5bd" stroke-dasharray="3,3"/>
        <polygon points="${fill}" fill="${fillColor}"/>
        <polyline points="${path}" stroke="${color}" stroke-width="2" fill="none"/>
        ${xt}${yt}
        ${curvDots}
        ${diamonds}
        ${labels}
        <text x="${padL + iW / 2}" y="${H - 6}" font-size="10" fill="#5c6773" text-anchor="middle">x (m)</text>
        <text x="14" y="${padT + iH / 2}" font-size="10" fill="#5c6773" text-anchor="middle" transform="rotate(-90 14 ${padT + iH / 2})">${cfEscapeXml(yLabel)}${unit ? ` (${cfEscapeXml(unit)})` : ''}</text>
    </svg>`;
}

document.addEventListener("DOMContentLoaded", () => {
    // exportFoundationPdf — snapshot the chosen result block with
    // html2canvas, embed in a jsPDF document, save as a real .pdf
    // file. The output is a duplicate of the on-screen Solution
    // (Parameters chips, step banners, KaTeX-rendered formulas,
    // schedule table, …) rendered as a pixel-accurate PDF instead
    // of relying on the browser print path.
    //
    // Why this replaced the print-via-window.print() approach:
    // the print code path had to fight two CSS rules that only
    // surface on paper — `.latex-container { display: inline-block;
    // width: min-content }` and `.latex-container p { margin-right:
    // 100% }`. Even with @media print hides + body-class shielding,
    // headless print engines (Brave / Chrome Save as PDF) kept
    // collapsing equation paragraphs into a one-word-per-line stack.
    // html2canvas captures the LIVE DOM with the screen-media CSS
    // applied, so the embedded image is exactly what the user sees.
    //
    // Respects window._foundationPrintTargetId so the Excel-batch
    // renderer can point us at #batchOutput (every footing + the
    // consolidated table in one PDF) instead of #Solution.
    // ── Helper: render ONE element to a canvas and append its
    //    page-sliced image(s) to an existing jsPDF document. Returns
    //    the next page number. `startFresh` forces a page break before
    //    this block (so each batch card starts on its own page).
    //
    //    Why per-element: html2canvas allocates a single backing
    //    canvas sized scale × element-height. Browsers cap canvas
    //    dimensions (~16384 px in Chrome/Brave); a tall element (the
    //    13-page batch view) overflows that cap and html2canvas
    //    returns an all-WHITE bitmap — which is exactly why the batch
    //    PDF was blank while the shorter single-foundation PDF worked.
    //    Capturing each block separately keeps every canvas small.
    async function _addElementToPdf(pdf, el, pageState) {
        if (!el) return;
        const canvas = await html2canvas(el, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
            windowWidth: el.scrollWidth,
            logging: false
        });
        if (!canvas.width || !canvas.height) return;

        // ── Ink-aware page-break detection ────────────────────────────
        //
        // Earlier versions averaged each row across the full width and
        // called it "blank" if the average was near-white. That fails
        // for tall multi-line equations: a row carrying only sparse
        // thin strokes (a fraction bar, an `=`, a paren) averages to
        // near-white over 1900+ px, so the scanner thought it was blank
        // and sliced THROUGH the equation between its stacked lines.
        //
        // Instead, scan for the DARKEST pixel in each row (any actual
        // text ink). A row is an "ink" row if any sampled pixel is
        // clearly dark (min channel < INK_DARK). Borders / coloured
        // backgrounds (≥ ~210) are NOT ink, so we may break across them
        // — fine. Then a break is only valid in a RUN of consecutive
        // ink-free rows that is tall enough to be a genuine inter-chip
        // margin (≥ MIN_GAP_PX), never the thin line-spacing inside an
        // equation. Read in horizontal strips with column sub-sampling
        // to bound memory.
        const INK_DARK   = 150;   // min(r,g,b) below this ⇒ real text
        const COL_STEP   = 3;     // sample every 3rd column (fast enough)
        const STRIP_H    = 1500;  // rows per getImageData call
        const SCALE      = 2;     // matches html2canvas scale above
        const MIN_GAP_PX = 9 * SCALE;   // ≈ 9 CSS px — bigger than any
                                        // intra-equation line gap, smaller
                                        // than a real chip margin

        const tmp    = document.createElement('canvas');
        const tmpCtx = tmp.getContext('2d', { willReadFrequently: true });
        const rowHasInk = new Uint8Array(canvas.height);   // 1 = ink row
        for (let stripY = 0; stripY < canvas.height; stripY += STRIP_H) {
            const h = Math.min(STRIP_H, canvas.height - stripY);
            tmp.width  = canvas.width;
            tmp.height = h;
            tmpCtx.clearRect(0, 0, canvas.width, h);
            tmpCtx.drawImage(canvas, 0, stripY, canvas.width, h,
                                     0, 0,      canvas.width, h);
            const data = tmpCtx.getImageData(0, 0, canvas.width, h).data;
            for (let row = 0; row < h; row++) {
                let ink = 0;
                const base = row * canvas.width * 4;
                for (let x = 0; x < canvas.width; x += COL_STEP) {
                    const i = base + x * 4;
                    const m = Math.min(data[i], data[i+1], data[i+2]);
                    if (m < INK_DARK) { ink = 1; break; }
                }
                rowHasInk[stripY + row] = ink;
            }
        }

        // Build break candidates from ink-free runs ≥ MIN_GAP_PX.
        const breaks = [0];
        let runStart = -1;
        for (let y = 0; y <= canvas.height; y++) {
            const blank = (y < canvas.height) && rowHasInk[y] === 0;
            if (blank) {
                if (runStart < 0) runStart = y;
            } else if (runStart >= 0) {
                const runEnd = y - 1;
                if (runEnd - runStart + 1 >= MIN_GAP_PX) {
                    breaks.push(Math.floor((runStart + runEnd) / 2));
                }
                runStart = -1;
            }
        }
        if (breaks[breaks.length-1] !== canvas.height) breaks.push(canvas.height);

        const pageW       = pdf.internal.pageSize.getWidth();
        const pageH       = pdf.internal.pageSize.getHeight();
        const marginTop   = 8;
        const marginBot   = 5;    // reduced bottom margin — more rows/page
        const marginSide  = 10;
        const contentW = pageW - 2 * marginSide;
        const contentH = pageH - marginTop - marginBot;
        const ratio    = contentW / canvas.width;
        const sliceHpx = Math.floor(contentH / ratio);

        const slice    = document.createElement('canvas');
        const sliceCtx = slice.getContext('2d');
        slice.width    = canvas.width;

        let yPx = 0;
        while (yPx < canvas.height) {
            const remainingPx = canvas.height - yPx;
            let nextY;
            if (remainingPx <= sliceHpx) {
                nextY = canvas.height;
            } else {
                // Snap the page bottom to the LARGEST whitespace gap
                // that still fits on this page. No lower floor: a
                // slightly short page is always better than slicing a
                // chip / multi-line equation in half. Only when NO gap
                // fits (a single element taller than a whole page) do
                // we hard-cut at the page limit.
                const hardMax = yPx + sliceHpx;
                const fit = breaks.filter(b => b > yPx && b <= hardMax);
                nextY = fit.length ? Math.max(...fit) : hardMax;
            }
            const thisSliceH = nextY - yPx;
            if (thisSliceH <= 0) break;
            slice.height = thisSliceH;
            sliceCtx.fillStyle = '#ffffff';
            sliceCtx.fillRect(0, 0, slice.width, slice.height);
            sliceCtx.drawImage(canvas, 0, yPx, canvas.width, thisSliceH,
                                       0, 0,   canvas.width, thisSliceH);
            const sliceImg = slice.toDataURL('image/jpeg', 0.92);
            if (!pageState.first) pdf.addPage();
            pageState.first = false;
            pdf.addImage(sliceImg, 'JPEG', marginSide, marginTop, contentW, thisSliceH * ratio);
            yPx = nextY;
        }
    }

    async function exportFoundationPdf(defaultId) {
        const targetId = window._foundationPrintTargetId || defaultId;
        const target   = document.getElementById(targetId);
        if (!target) {
            alert("Nothing to export yet — click Calculate (or upload an Excel) first.");
            return;
        }
        if (typeof html2canvas === 'undefined') {
            alert("PDF library is still loading — give it a few seconds and try again.");
            return;
        }
        if (!window.jspdf || !window.jspdf.jsPDF) {
            alert("PDF library failed to load — refresh the page and try again.");
            return;
        }

        const btn = document.getElementById('saveButton');
        const originalLabel = btn ? btn.innerHTML : '';
        if (btn) {
            btn.innerHTML = '⏳ Generating PDF…';
            btn.disabled = true;
        }

        const isBatch = (targetId === 'batchOutput');

        // In batch mode each <details> card is REPLACED by a <div> in
        // the LIVE DOM before capture. html2canvas v1.4.x measures the
        // live DOM during layout, so an unconverted <details> renders
        // only its <summary>. We restore the originals in finally{}.
        const restoreOps = [];
        if (isBatch) {
            const detailsList = Array.from(target.querySelectorAll('details'));
            for (const det of detailsList) {
                const parent      = det.parentNode;
                const nextSibling = det.nextSibling;
                const summary     = det.querySelector(':scope > summary');
                const otherChildren = [];
                for (const ch of Array.from(det.childNodes)) {
                    if (ch !== summary) otherChildren.push(ch);
                }
                const div = document.createElement('div');
                for (const attr of det.attributes) {
                    if (attr.name === 'open') continue;
                    div.setAttribute(attr.name, attr.value);
                }
                if (summary) {
                    const sumDiv = document.createElement('div');
                    for (const attr of summary.attributes) sumDiv.setAttribute(attr.name, attr.value);
                    sumDiv.innerHTML = summary.innerHTML;
                    sumDiv.style.cssText =
                        'padding:12px 18px;background:#eef3f8;color:#0056b3;' +
                        'font-weight:600;border-bottom:1px solid #e1e4e8;' +
                        'display:flex;align-items:center;flex-wrap:wrap;gap:12px;';
                    div.appendChild(sumDiv);
                }
                for (const c of otherChildren) div.appendChild(c);
                parent.replaceChild(div, det);
                restoreOps.push(() => {
                    while (det.firstChild) det.removeChild(det.firstChild);
                    if (summary) det.appendChild(summary);
                    for (const c of otherChildren) det.appendChild(c);
                    if (div.parentNode) div.parentNode.replaceChild(det, div);
                    else parent.insertBefore(det, nextSibling);
                });
            }

            // Move the "Batch Foundation Design — N footings" title bar
            // INTO the first foundation card so it rides on that card's
            // opening page, instead of getting a near-empty page of its
            // own (per-block capture would otherwise give the title its
            // own page). Restored in finally{}.
            const titleEl   = target.querySelector(':scope > .fd-batch-title');
            const firstCard = target.querySelector(':scope > .fd-batch-card');
            if (titleEl && firstCard) {
                const tParent = titleEl.parentNode;
                const tNext   = titleEl.nextSibling;
                titleEl.style.marginBottom = '14px';
                firstCard.insertBefore(titleEl, firstCard.firstChild);
                restoreOps.push(() => {
                    titleEl.style.marginBottom = '';
                    if (tNext) tParent.insertBefore(titleEl, tNext);
                    else tParent.appendChild(titleEl);
                });
            }

            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        }

        try {
            const pdf = new window.jspdf.jsPDF({
                unit: 'mm', format: 'a4', orientation: 'p', compress: true
            });
            const pageState = { first: true };

            if (isBatch) {
                // Capture each TOP-LEVEL block of #batchOutput on its
                // own — the title, every (now-div) foundation card, and
                // the consolidated comparison table. Each block is at
                // most a few pages, so no single canvas exceeds the
                // browser's max-canvas-height limit. This is the whole
                // fix: the previous code captured the entire 13-page
                // #batchOutput as ONE oversized canvas, which the
                // browser refused and returned blank.
                const blocks = Array.from(target.children);
                for (const block of blocks) {
                    await _addElementToPdf(pdf, block, pageState);
                }
            } else {
                // Single foundation — capture the whole Solution tab as
                // one block. It's short enough (≈8 pages → ~16 700 px,
                // under the browser cap) and the continuous flow reads
                // better than forcing a page break between
                // #GivenParameters1 / #result / #Summary1. The user has
                // already confirmed this path produces a clean PDF.
                await _addElementToPdf(pdf, target, pageState);
            }

            // Guard: if nothing got added (every block empty), avoid
            // saving a zero-page file.
            if (pageState.first) {
                alert('Nothing to export — the result area is empty. Calculate or upload an Excel first.');
                return;
            }

            pdf.save(isBatch ? 'foundation-batch-design.pdf' : 'foundation-design.pdf');
        } catch (err) {
            console.error('PDF export failed:', err);
            alert('Could not generate PDF: ' + (err && err.message ? err.message : err));
        } finally {
            for (let i = restoreOps.length - 1; i >= 0; i--) {
                try { restoreOps[i](); } catch (rErr) { console.warn('restore failed:', rErr); }
            }
            if (btn) {
                btn.innerHTML = originalLabel;
                btn.disabled = false;
            }
        }
    }
    // Save / Print PDF — attach ONCE at module load. The previous
    // code re-attached on every form submit, so a 3-row Excel batch
    // ended up with 3 stacked click handlers all racing through
    // printDiv (the first reload would kill the others).
    const _saveBtn = document.getElementById('saveButton');
    if (_saveBtn) {
        _saveBtn.addEventListener('click', () => exportFoundationPdf('Solution'));
    }

    document.getElementById('formFoundation').addEventListener('submit',function(event){
        event.preventDefault();

        // Validate critical combinations before running the calculator.
        // (Isolated Rectangular without a Length Restriction makes dimension()
        //  skip its solver, leaving B_x and B_y at 0 and cascading NaN through
        //  every downstream check.)
        const _structureType = document.getElementById('structureType').value;
        const _restrictionType = document.getElementById('LengthRestriction').value;
        if (_structureType === 'Isolated Rectangular' && (_restrictionType === '0' || _restrictionType === '')) {
            alert(
                'Isolated Rectangular footings need a Length Restriction.\n\n' +
                'Pick "Ratio" (and enter the ratio L:B) or "Constricted" (and enter the constraint length).\n' +
                'Without it the solver cannot determine both B_x and B_y.'
            );
            return;
        }

    try {
        const resultDiv = document.getElementById("result");
        resultDiv.innerHTML = ''; // Clear previous results
        const summaryDiv = document.getElementById("Summary");
        summaryDiv.innerHTML = ''; // Clear previous results
        const summary1Div = document.getElementById("Summary1");
        summary1Div.innerHTML = ''; // Clear previous results
        const parametersDiv = document.getElementById("GivenParameters1");
        parametersDiv.innerHTML = ''; // Clear previous results

    // ════════════════════════════════════════════════════════════════
    //  COMBINED FOOTING (2 columns) — own design flow.
    //  Intercept early: this does NOT use the isolated-footing
    //  dimension()/punchingShear()/rebarDesign() path. Handles a
    //  Rectangular (CRF) or Trapezoidal (CTF) combined footing.
    //  Methodology after Engr. M. Dumal-is (NSCP 2015 / ACI 318-14).
    // ════════════════════════════════════════════════════════════════
    if (document.getElementById('structureType').value === 'Strip') {
        designCombinedFooting();
        document.getElementById('saveButton').style.display = 'block';
        document.getElementById('tab').style.display = 'flex';
        renderAllMath();
        return;
    }

    // ── Pure helpers reused by the combined-footing flow ──────────────
    function _cfBeta1(fc) { return fc > 28 ? Math.max(0.65, 0.85 - 0.05 * (fc - 28) / 7) : 0.85; }
    function _cfRoundUp(v, step) { return Math.ceil(v / step) * step; }

    function designCombinedFooting() {
        const R  = document.getElementById('result');
        const GP = document.getElementById('GivenParameters1');
        const P  = (html) => { const p = createParagraph(html); R.appendChild(p); };
        const H5 = (t)   => R.appendChild(createHeader5(t));
        const H7 = (t)   => R.appendChild(createHeader7(t));
        const CL = (t)   => R.appendChild(createClause(t));
        const GPH8 = (html) => GP.appendChild(createHeader8(html));

        // ── Read inputs ───────────────────────────────────────────────
        const num = (id) => parseFloat(document.getElementById(id).value);
        const cx1 = num('ColumnWidth');                // Column 1 size (mm, square)
        const cx2raw = num('cf-col2-width');
        const cx2 = Number.isFinite(cx2raw) && cx2raw > 0 ? cx2raw : cx1;  // Column 2 size (defaults to col 1)
        const cx = cx1;                                // legacy alias (col 1) for the given-params recap
        const cy = cx1;
        const cx1m = cx1 / 1000, cx2m = cx2 / 1000, cym = cx1 / 1000;
        const sf  = num('cf-sf');                       // c/c spacing, m
        const Pdl1 = num('DeadLoad'), Pll1 = num('LiveLoad');
        const Pdl2 = num('cf-pdl2'),  Pll2 = num('cf-pll2');
        const qa = num('SoilBearingCapacity');
        const gs = num('UnitWeightSoil'), gc = num('UnitWeightConcrete');
        const q  = num('Surcharge') || 0;
        const Hm = num('Depth');                        // total footing depth incl. soil cover, m
        const fc = num('fc'), fy = num('fy');
        const db = num('BarDiameter'), dAgg = num('aggDiameter'), cc = num('Cover');
        const leftRestrict  = document.getElementById('cf-left-restrict').value === '1';
        const rightRestrict = document.getElementById('cf-right-restrict').value === '1';
        const leftOh  = (num('cf-left-oh')  || 0) / 1000;   // m
        const rightOh = (num('cf-right-oh') || 0) / 1000;

        // ── Validate the combined-footing-specific inputs ─────────────
        const need = { 'Col 1 P_DL': Pdl1, 'Col 1 P_LL': Pll1,
                       'Col 2 P_DL': Pdl2, 'Col 2 P_LL': Pll2,
                       'Column spacing s_f': sf, 'Column 1 width': cx1,
                       'q_all': qa, 'γ_soil': gs, 'γ_con': gc,
                       'H': Hm, "f'c": fc, 'f_y': fy, 'd_b': db, 'Cover': cc };
        const bad = Object.entries(need).filter(([k, v]) => !Number.isFinite(v)).map(([k]) => k);
        if (bad.length) {
            R.appendChild(createParagraph(
                `<div class="bd-alert bd-alert-fail">Combined Footing needs these inputs: <strong>${bad.join(', ')}</strong>. ` +
                `Set Load Type to &ldquo;Individual Loads&rdquo; so the Col 1 P<sub>DL</sub>/P<sub>LL</sub> fields are available, ` +
                `and fill the Combined Footing section.</div>`));
            return;
        }

        // ── Given-parameters recap chips ──────────────────────────────
        GP.appendChild(createHeader5('Parameters Given:'));
        GPH8(`$$\\ \\text{Combined Footing — 2 columns}\$$`);
        GPH8(`$$\\ c_1 = ${cx1}\\text{ mm}, \\; c_2 = ${cx2}\\text{ mm} \$$`);
        GPH8(`$$\\ s_f = ${sf}\\text{ m (c/c)} \$$`);
        GPH8(`$$\\ P_{dl,1} = ${Pdl1}\\text{ kN}, \\; P_{ll,1} = ${Pll1}\\text{ kN} \$$`);
        GPH8(`$$\\ P_{dl,2} = ${Pdl2}\\text{ kN}, \\; P_{ll,2} = ${Pll2}\\text{ kN} \$$`);
        GPH8(`$$\\ q_{all} = ${qa}\\text{ kPa}, \\; q = ${q}\\text{ kPa} \$$`);
        GPH8(`$$\\ \\gamma_{soil} = ${gs}, \\; \\gamma_{con} = ${gc}\\;\\tfrac{kN}{m^3} \$$`);
        GPH8(`$$\\ f'_c = ${fc}\\text{ MPa}, \\; f_y = ${fy}\\text{ MPa} \$$`);
        GPH8(`$$\\ H = ${Hm}\\text{ m}, \\; d_b = ${db}, \\; d_{agg} = ${dAgg}, \\; C_c = ${cc}\\text{ mm} \$$`);
        GPH8(`$$\\ \\text{Left edge: ${leftRestrict ? 'property line, overhang ' + (leftOh*1000) + ' mm' : 'free'}} \$$`);
        GPH8(`$$\\ \\text{Right edge: ${rightRestrict ? 'property line, overhang ' + (rightOh*1000) + ' mm' : 'free'}} \$$`);

        // ── Step 1 — Service & factored column loads ──────────────────
        H5('Service & Factored Column Loads');
        CL('Per NSCP 2015 §203.3.1 / ACI 318-14 §5.3.1 — factored column load \\(P_u\\) is the larger of \\(1.4 P_{dl}\\) and \\(1.2 P_{dl} + 1.6 P_{ll}\\).');
        const Pa1 = Pdl1 + Pll1, Pa2 = Pdl2 + Pll2, Pa = Pa1 + Pa2;
        const Pu1 = Math.max(1.4 * Pdl1, 1.2 * Pdl1 + 1.6 * Pll1);
        const Pu2 = Math.max(1.4 * Pdl2, 1.2 * Pdl2 + 1.6 * Pll2);
        const Pu  = Pu1 + Pu2;
        P(`$$\\ P_{a1} = ${Pdl1} + ${Pll1} = ${Pa1.toFixed(1)}\\text{ kN}, \\quad P_{a2} = ${Pdl2} + ${Pll2} = ${Pa2.toFixed(1)}\\text{ kN} \$$`);
        P(`$$\\ P_a = P_{a1} + P_{a2} = ${Pa.toFixed(1)}\\text{ kN} \$$`);
        P(`$$\\ P_{u1} = \\max(${(1.4*Pdl1).toFixed(1)},\\,${(1.2*Pdl1+1.6*Pll1).toFixed(1)}) = ${Pu1.toFixed(1)}\\text{ kN} \$$`);
        P(`$$\\ P_{u2} = \\max(${(1.4*Pdl2).toFixed(1)},\\,${(1.2*Pdl2+1.6*Pll2).toFixed(1)}) = ${Pu2.toFixed(1)}\\text{ kN} \$$`);
        P(`$$\\ P_u = ${Pu.toFixed(1)}\\text{ kN} \$$`);

        // ── Step 2 — Net soil pressure ────────────────────────────────
        H5('Net Soil Bearing Pressure');
        CL('Assume an initial slab thickness \\(D_c = 250\\) mm to estimate the self-weight deductions.');
        const Dc0 = 0.25, Ds = Hm - Dc0;
        const qnet = qa - gs * Ds - gc * Dc0 - q;
        P(`$$\\ D_c = 250\\text{ mm}, \\quad D_s = H - D_c = ${Hm} - 0.25 = ${Ds.toFixed(3)}\\text{ m} \$$`);
        P(`$$\\ q_{net} = q_{all} - \\gamma_{soil} D_s - \\gamma_{con} D_c - q = ${qa} - ${gs}(${Ds.toFixed(3)}) - ${gc}(0.25) - ${q} = ${qnet.toFixed(3)}\\text{ kPa} \$$`);

        // ── Step 3 — Footing geometry (CRF vs CTF) ────────────────────
        H5('Footing Geometry — Resultant must coincide with the slab centroid');
        const bothRestricted = leftRestrict && rightRestrict;
        let shape, Bx, By, By1, By2, x1, x2, xbar, edgeOffset;
        if (!bothRestricted) {
            shape = 'Rectangular (CRF)';
            edgeOffset = leftRestrict ? leftOh : 0;       // left edge to PL offset (m)
            x1 = edgeOffset + cx1m / 2;                   // col1 centre from left edge
            x2 = x1 + sf;
            xbar = (Pa1 * x1 + Pa2 * x2) / Pa;
            Bx = _cfRoundUp(2 * xbar, 0.1);
            By = _cfRoundUp(Pa / (qnet * Bx), 0.1);
            By1 = By; By2 = By;
            CL('A rectangular combined footing keeps the resultant centred by setting \\(B_x = 2\\bar{x}\\) (left edge at the property line / free edge).');
            P(`$$\\ \\bar{x} = \\frac{P_{a1}\\,x_1 + P_{a2}\\,x_2}{P_a} = \\frac{${Pa1.toFixed(1)}(${x1.toFixed(3)}) + ${Pa2.toFixed(1)}(${x2.toFixed(3)})}{${Pa.toFixed(1)}} = ${xbar.toFixed(4)}\\text{ m} \$$`);
            P(`$$\\ B_x = 2\\bar{x} = ${(2*xbar).toFixed(3)} \\approx ${Bx}\\text{ m} \$$`);
            P(`$$\\ B_y = \\frac{P_a}{q_{net} B_x} = \\frac{${Pa.toFixed(1)}}{${qnet.toFixed(3)}\\times ${Bx}} = ${(Pa/(qnet*Bx)).toFixed(3)} \\approx ${By}\\text{ m} \$$`);
        } else {
            shape = 'Trapezoidal (CTF)';
            // Bx spans both overhangs + the half-widths of each column + the c/c spacing.
            Bx = +(sf + cx1m / 2 + cx2m / 2 + leftOh + rightOh).toFixed(6);
            x1 = leftOh + cx1m / 2;
            x2 = x1 + sf;
            xbar = (Pa1 * x1 + Pa2 * x2) / Pa;
            const A = Pa / qnet;
            const Bysum = 2 * A / Bx;
            const twoBy2plusBy1 = xbar * Bysum / (Bx / 3);
            let by2 = twoBy2plusBy1 - Bysum;
            let by1 = Bysum - by2;
            By2 = _cfRoundUp(by2, 0.1);
            By1 = _cfRoundUp(by1, 0.1);
            By = (By1 + By2) / 2;
            CL('Both edges restricted with unequal loads → a trapezoidal footing aligns the resultant with the slab centroid. \\(B_x\\) is fixed by geometry.');
            P(`$$\\ B_x = s_f + \\tfrac{c_1}{2} + \\tfrac{c_2}{2} + oh_L + oh_R = ${sf} + ${(cx1m/2).toFixed(3)} + ${(cx2m/2).toFixed(3)} + ${leftOh} + ${rightOh} = ${Bx}\\text{ m} \$$`);
            P(`$$\\ \\bar{x} = \\frac{P_{a1}\\,x_1 + P_{a2}\\,x_2}{P_a} = ${xbar.toFixed(4)}\\text{ m} \$$`);
            P(`$$\\ A = \\frac{P_a}{q_{net}} = ${A.toFixed(4)}\\text{ m}^2, \\quad B_{y1}+B_{y2} = \\frac{2A}{B_x} = ${Bysum.toFixed(4)}\\text{ m} \$$`);
            P(`$$\\ \\bar{x} = \\frac{B_x}{3}\\cdot\\frac{2B_{y2}+B_{y1}}{B_{y2}+B_{y1}} \\;\\Rightarrow\\; B_{y2} = ${by2.toFixed(4)} \\approx ${By2}\\text{ m}, \\; B_{y1} = ${by1.toFixed(4)} \\approx ${By1}\\text{ m} \$$`);
        }

        // ── Step 4 — Equivalent uniformly-varying ultimate pressure ───
        H5('Equivalent Uniformly-Varying Ultimate Line Load');
        CL('Convert the (slightly non-uniform) bearing into an equivalent uniformly-varying line load \\(w_u(x)=w_{u1}+\\alpha x\\) so the V & M diagrams can be drawn by statics.');
        const wsum = 2 * Pu / Bx;
        const SPx  = Pu1 * x1 + Pu2 * x2;
        const w1p2 = 6 * SPx / (Bx * Bx);
        const wu2 = w1p2 - wsum, wu1 = wsum - wu2;
        const alpha = (wu2 - wu1) / Bx;
        P(`$$\\ w_{u1} + w_{u2} = \\frac{2P_u}{B_x} = ${wsum.toFixed(3)}\\;\\tfrac{kN}{m} \$$`);
        P(`$$\\ w_{u1} + 2w_{u2} = \\frac{6\\sum P_{ui}x_i}{B_x^2} = ${w1p2.toFixed(3)} \$$`);
        P(`$$\\ w_{u1} = ${wu1.toFixed(3)}\\;\\tfrac{kN}{m}, \\quad w_{u2} = ${wu2.toFixed(3)}\\;\\tfrac{kN}{m}, \\quad \\alpha = ${alpha.toFixed(4)} \$$`);

        // Closed-form V and M along x (origin at left edge).
        const colX = [x1, x2], colP = [Pu1, Pu2];
        const Vat = (x) => {
            let v = wu1 * x + alpha * x * x / 2;
            for (let i = 0; i < 2; i++) if (colX[i] <= x + 1e-9) v -= colP[i];
            return v;
        };
        const Mat = (x) => {
            let m = wu1 * x * x / 2 + alpha * x * x * x / 6;
            for (let i = 0; i < 2; i++) if (colX[i] <= x + 1e-9) m -= colP[i] * (x - colX[i]);
            return m;
        };
        // zero-shear (max moment) between the columns — solve V=0 in (x1,x2)
        let xpeak = x1, lo = x1, hi = x2;
        // V just right of col1 is negative → increases toward col2; bisect for V=0.
        for (let it = 0; it < 60; it++) {
            const mid = (lo + hi) / 2;
            if (Vat(mid) < 0) lo = mid; else hi = mid;
            xpeak = mid;
        }

        // ── Shear & Moment Diagrams (same SVG style as Beam Design) ────
        H5('Shear &amp; Moment Diagrams');
        CL('The footing acts as an inverted beam — the upward soil pressure (\\(w_{u1}\\!\\to\\!w_{u2}\\)) is the distributed load and the two columns are the downward point loads. Because the conventional rigid method fixes the pressure as linear, the system is statically determinate, so \\(V(x)\\) and \\(M(x)\\) below follow directly from statics (origin at the left edge of the footing).');
        {
            const Npts = 200, epsX = 1e-4;
            const xsamp = [];
            for (let i = 0; i <= Npts; i++) xsamp.push(Bx * i / Npts);
            // Insert the column stations twice (±ε) so the shear jump at each
            // point load renders as a clean vertical step, plus the peak-moment x.
            [x1, x2].forEach(xc => xsamp.push(xc - epsX, xc, xc + epsX));
            xsamp.push(xpeak);
            const xsF = xsamp.filter(x => x >= -1e-9 && x <= Bx + 1e-9).sort((a, b) => a - b);
            const Vsamp = xsF.map(Vat);
            const Msamp = xsF.map(Mat);
            const sfdDiv = document.createElement('div'); sfdDiv.className = 'fd-diagram';
            const bmdDiv = document.createElement('div'); bmdDiv.className = 'fd-diagram';
            R.appendChild(sfdDiv);
            R.appendChild(bmdDiv);
            cfDrawDiagram(sfdDiv, xsF, Vsamp, {
                color: '#1f77b4', fillColor: 'rgba(31,119,180,0.18)',
                yLabel: 'V', unit: 'kN', title: 'Shear Force Diagram (factored)', curvXs: [x1, x2]
            });
            cfDrawDiagram(bmdDiv, xsF, Msamp, {
                color: '#d62728', fillColor: 'rgba(214,39,40,0.18)',
                yLabel: 'M', unit: 'kN·m', title: 'Bending Moment Diagram (factored)', curvXs: [x1, x2]
            });
        }

        // ── Step 5 — Slab thickness by punching shear (critical column) ─
        H5('Slab Thickness — Punching (Two-Way) Shear');
        CL('Per NSCP 2015 §422.6.5.2 — design the critical (heavier-loaded) column. \\(\\phi V_n = \\phi\\tfrac{1}{3}\\sqrt{f\'_c}\\,b_o d\\), \\(\\phi = 0.75\\). Assumes the full punching perimeter is maintained.');
        const A_foot = (shape[0] === 'R') ? Bx * By : (By1 + By2) * Bx / 2;
        const qu = Pu / A_foot;                              // kPa
        const Pcrit = Math.max(Pu1, Pu2);
        const cCrit = (Pu2 >= Pu1) ? cx2 : cx1;              // critical column's own size (mm)
        let dP = 0.155;
        for (let it = 0; it < 60; it++) {
            const dmm = dP * 1000, cmm = cCrit;
            const Ao = (dmm + cmm) * (dmm + cmm) / 1e6;       // m²
            const Vu = (Pcrit - qu * Ao) * 1000;             // N
            const f  = 0.75 * (1 / 3) * Math.sqrt(fc) * 4 * (dmm + cmm) * dmm - Vu;
            const dd = 0.5;
            const Ao2 = ((dmm + dd) + cmm) * ((dmm + dd) + cmm) / 1e6;
            const Vu2 = (Pcrit - qu * Ao2) * 1000;
            const f2 = 0.75 * (1 / 3) * Math.sqrt(fc) * 4 * ((dmm + dd) + cmm) * (dmm + dd) - Vu2;
            dP = dP - (f / ((f2 - f) / dd)) / 1000;
        }
        const dpunch = dP * 1000;
        const Ao_final = (dpunch + cCrit) * (dpunch + cCrit) / 1e6;
        const Vu_punch = (Pcrit - qu * Ao_final);
        const Dc_punch = _cfRoundUp(dpunch + cc + db, 25);
        P(`$$\\ q_u = \\frac{P_u}{A_{foot}} = \\frac{${Pu.toFixed(1)}}{${A_foot.toFixed(4)}} = ${qu.toFixed(3)}\\text{ kPa} \$$`);
        P(`$$\\ V_u = P_{u,crit} - q_u A_o = ${Pcrit.toFixed(1)} - ${qu.toFixed(3)}(${Ao_final.toFixed(4)}) = ${Vu_punch.toFixed(2)}\\text{ kN} \$$`);
        P(`$$\\ \\text{set } \\phi V_n = V_u \\;\\Rightarrow\\; d = ${dpunch.toFixed(2)}\\text{ mm} \$$`);
        P(`$$\\ D_{c,punch} = d + C_c + d_b = ${(dpunch+cc+db).toFixed(1)} \\approx ${Dc_punch}\\text{ mm} \$$`);

        // ── Step 6 — Slab thickness by beam (one-way) shear ───────────
        H5('Slab Thickness — Beam (One-Way) Shear');
        CL('Per NSCP 2015 §422.5.5 — \\(\\phi V_n = \\phi\\tfrac{1}{6}\\sqrt{f\'_c}\\,B_y d\\). Critical section at \\(d\\) from the interior face of the more heavily loaded column.');
        // assume Dc = punching + 25 mm for d
        const Dc_assume = Dc_punch + 25;
        const dBeam = Dc_assume - cc - db;                    // mm, longitudinal
        const dBeam_m = dBeam / 1000;
        // critical section: d from inner face of heavier column toward the span
        const heavier2 = Pu2 >= Pu1;
        const xface = heavier2 ? (x2 - cx2m / 2 - dBeam_m) : (x1 + cx1m / 2 + dBeam_m);
        const Vu_beam = Math.abs(Vat(xface));
        // By at that x (CTF varies)
        const ByAt = (x) => (shape[0] === 'R') ? By : (By1 + (By2 - By1) * x / Bx);
        const ByBeam = ByAt(xface);
        let dB = dBeam_m;
        // solve d: φ(1/6)√fc·By·d = Vu  (By taken at section, ~constant)
        dB = (Vu_beam * 1000) / (0.75 * (1 / 6) * Math.sqrt(fc) * (ByBeam * 1000));
        const Dc_beam = _cfRoundUp(dB + cc + db, 25);
        P(`$$\\ d = D_c - C_c - d_b = ${Dc_assume} - ${cc} - ${db} = ${dBeam}\\text{ mm} \$$`);
        P(`$$\\ V_u = ${Vu_beam.toFixed(2)}\\text{ kN at the critical section}, \\quad B_y = ${(ByBeam*1000).toFixed(0)}\\text{ mm} \$$`);
        P(`$$\\ \\text{set } \\phi V_n = V_u \\;\\Rightarrow\\; d = ${dB.toFixed(2)}\\text{ mm}, \\quad D_{c,beam} = ${(dB+cc+db).toFixed(1)} \\approx ${Dc_beam}\\text{ mm} \$$`);

        // ── Governing thickness ───────────────────────────────────────
        const Dc = Math.max(Dc_punch, Dc_beam);
        H7(`Governing slab thickness: \\(D_c = ${Dc}\\) mm`);

        // ── Step 7 — Longitudinal flexure at critical sections ────────
        H5('Longitudinal Flexure Design (along \\(x\\))');
        CL('Critical moments: maximum (between columns, tension on TOP) and the column-face moments. Each is designed for the local width \\(B_y\\).');
        const dFlex = Dc - cc - db / 2;                       // mm
        const beta1 = _cfBeta1(fc);
        const phiF = 0.90;
        const rhoMin = Math.max(1.4 / fy, Math.sqrt(fc) / (4 * fy));
        const rhoST  = fy < 420 ? 0.002 : 0.0018;
        const Ab = Math.PI / 4 * db * db;
        const scMin = Math.max(50, db, (4 / 3) * dAgg);
        // critical sections
        const sections = [];
        const addSec = (label, x, face) => {
            const Mu = Math.abs(Mat(x));
            const bmm = ByAt(x) * 1000;
            sections.push({ label, x, Mu, bmm, top: Mat(x) < 0 });
        };
        addSec('Max +M (interior, top steel)', xpeak);
        addSec('Col 1 inner face', x1 + cx1m / 2);
        addSec('Col 2 inner face', x2 - cx2m / 2);

        const flexRows = sections.map(s => {
            const b = s.bmm, d = dFlex, Mu = s.Mu;
            const Rn = Mu * 1e6 / (phiF * b * d * d);
            let rho = (0.85 * fc / fy) * (1 - Math.sqrt(Math.max(0, 1 - 2 * Rn / (0.85 * fc))));
            const useMin = rho < rhoMin;
            const rhoUse = useMin ? rhoMin : rho;
            const As = rhoUse * b * d;
            const As_st = rhoST * Dc * b;                     // shrinkage/temp floor
            const Asf = Math.max(As, As_st);
            const n = Math.max(2, Math.ceil(Asf / Ab));
            const sc = n > 1 ? (b - 2 * cc - n * db) / (n - 1) : null;
            return { ...s, Rn, rho, rhoUse, As: Asf, n, sc };
        });
        flexRows.forEach(fr => {
            P(`$$\\ \\textbf{${fr.label}: } M_u = ${fr.Mu.toFixed(1)}\\text{ kN}\\cdot\\text{m}, \\; b = ${fr.bmm.toFixed(0)}\\text{ mm}, \\; d = ${dFlex.toFixed(0)}\\text{ mm} \$$`);
            P(`$$\\ R_n = \\frac{M_u}{\\phi b d^2} = ${fr.Rn.toFixed(3)}\\text{ MPa}, \\; \\rho = ${fr.rhoUse.toFixed(6)} \\;\\Rightarrow\\; A_s = ${fr.As.toFixed(0)}\\text{ mm}^2 \$$`);
            P(`$$\\ n = \\lceil A_s/A_b \\rceil = ${fr.n}\\text{ bars } \\varnothing${db}\\text{ mm}, \\; s_c = ${fr.sc ? fr.sc.toFixed(0) : '—'}\\text{ mm}${fr.sc && fr.sc >= scMin ? '\\;✓' : ''} \$$`);
        });

        // ── Step 8 — Transverse flexure under each column ─────────────
        H5('Transverse Flexure Design (along \\(y\\), under each column)');
        CL('Each column spreads its load over a column strip; the cantilever moment about the column face drives the transverse bottom steel.');
        const transRows = [['Col 1', Pu1, leftRestrict ? By1 : By, cx1m], ['Col 2', Pu2, rightRestrict ? By2 : By, cx2m]];
        transRows.forEach(([lbl, Pcol, Byloc, cColm]) => {
            const stripW = Math.min(Byloc, cColm + 2 * (dFlex / 1000));   // column strip width, m
            const qStrip = Pcol / (Bx * Byloc);                          // kPa (avg)
            const arm = (Byloc - cColm) / 2;                             // cantilever arm, m
            const Mu = qStrip * Byloc * arm * arm / 2;                   // kN·m over full width (approx)
            const b = Bx * 1000 * 0;                                     // (use strip per-m design below)
            const Mu_perm = qStrip * arm * arm / 2;                      // kN·m per metre width
            const dT = Dc - cc - 1.5 * db;
            const Rn = Mu_perm * 1e6 / (phiF * 1000 * dT * dT);
            let rho = (0.85 * fc / fy) * (1 - Math.sqrt(Math.max(0, 1 - 2 * Rn / (0.85 * fc))));
            const rhoUse = Math.max(rho, rhoMin);
            const As_perm = rhoUse * 1000 * dT;
            const sBar = Ab / As_perm * 1000;                           // spacing mm for 1 m
            P(`$$\\ \\textbf{${lbl}: } B_y = ${(Byloc*1000).toFixed(0)}\\text{ mm}, \\; \\text{arm} = \\tfrac{B_y - c_y}{2} = ${(arm*1000).toFixed(0)}\\text{ mm} \$$`);
            P(`$$\\ q_{strip} = \\frac{P_u}{B_x B_y} = ${qStrip.toFixed(2)}\\text{ kPa}, \\; M_u = \\tfrac{q\\,arm^2}{2} = ${Mu_perm.toFixed(2)}\\text{ kN}\\cdot\\text{m/m} \$$`);
            P(`$$\\ \\rho = ${rhoUse.toFixed(6)}, \\; A_s = ${As_perm.toFixed(0)}\\text{ mm}^2/m \\;\\Rightarrow\\; \\varnothing${db}\\text{ @ } ${sBar.toFixed(0)}\\text{ mm o.c.} \$$`);
        });

        // ── Schedule ──────────────────────────────────────────────────
        const sched = buildCombinedFootingSchedule({
            shape, Bx, By, By1, By2, Dc, db, qu, qnet,
            Vu_punch, Pcrit, flexRows
        });
        for (const id of ['Summary', 'Summary1']) {
            const el = document.getElementById(id);
            if (el) { el.innerHTML = sched; renderMath(el); }
        }
    }

    // Combined-footing schedule (tabular summary, fd-schedule styling).
    function buildCombinedFootingSchedule(d) {
        const row = (l, v, c) => `<tr><td>${l}</td><td class="fd-sched-num">${v}</td><td>${c == null ? '&mdash;' : c}</td></tr>`;
        const hdr = (t) => `<tr class="fd-sched-header"><td colspan="3">${t}</td></tr>`;
        let h = `<div class="fd-schedule-title">Combined Footing Schedule &mdash; <small style="font-weight:400;color:#5c6773;">${d.shape}</small></div>`;
        h += `<div class="fd-schedule-wrap"><table class="fd-schedule"><thead><tr><th>Parameter</th><th>Value</th><th>Note</th></tr></thead><tbody>`;
        h += hdr('Geometry');
        h += row('Footing length \\(B_x\\)', `${d.Bx} m`);
        if (d.shape[0] === 'R') {
            h += row('Footing width \\(B_y\\)', `${d.By} m`);
        } else {
            h += row('Width at col 1 \\(B_{y1}\\)', `${d.By1} m`);
            h += row('Width at col 2 \\(B_{y2}\\)', `${d.By2} m`);
        }
        h += row('Slab thickness \\(D_c\\)', `${d.Dc} mm`);
        h += row('Bar diameter \\(d_b\\)', `&#8709;${d.db} mm`);
        h += hdr('Bearing & Shear');
        h += row('Net allowable \\(q_{net}\\)', `${d.qnet.toFixed(2)} kPa`);
        h += row('Ultimate pressure \\(q_u\\)', `${d.qu.toFixed(2)} kPa`);
        h += row('Punching \\(V_u\\) (critical col)', `${d.Vu_punch.toFixed(1)} kN`, `governs thickness`);
        h += hdr('Longitudinal Reinforcement (along \\(x\\))');
        d.flexRows.forEach(fr => {
            h += row(fr.label, `${fr.n} pcs &#8709;${d.db} mm`,
                     `\\(M_u\\) = ${fr.Mu.toFixed(0)} kN·m, ${fr.top ? 'TOP' : 'BOTTOM'}`);
        });
        h += `</tbody></table></div>`;
        h += `<div class="fd-schedule-legend"><span>TOP = tension on top (between columns)</span><span>BOTTOM = tension on bottom (overhangs)</span></div>`;
        return h;
    }


    function determineMethod(structureType, loadType, columnShape, centricity, method) {
        let n = "";  // Initialize the variable
        
        // Mapping structure type
        if (structureType === "Isolated Square") {
            n += "IS";
        } else if (structureType === "Isolated Rectangular") {
            n += "IR";
        } else if (structureType === "Strip") {
            n += "ST";
        }
    
        // Mapping load type
        if (loadType === "ultimate") {
            n += "-UL";
        } else {
            n += "-SW";  // Assuming "SW" is for Service Load
        }
    
        // Mapping column shape
        if (columnShape === "square") {
            n += "-SQ";
        } else if (columnShape === "rectangular") {
            n += "-RC";
        } else if (columnShape === "circle") {
            n += "-CR";
        }
    
        // Mapping centricity
        if (centricity === "concentric") {
            n += "-CC";
        } else if (centricity === "eccentric") {
            n += "-EC";
        }
    
        // Adding method as the final number
        n += `-${method}`;
    
        return n;
    }
            
    // Returns true when the content reduces to nothing visible after
    // stripping LaTeX delimiters / control chars. The DOM helpers below
    // tag these with the .fd-empty-p class so CSS can hide them — under
    // the soft-card paragraph styling, an empty <p> rendered as a
    // visible blank chip with a left border and no content.
    function _isVisuallyEmpty(content) {
        return String(content == null ? '' : content)
            .replace(/[$\\`\s ]/g, '') === '';
    }
    function createParagraph(content) {
        const p = document.createElement('p');
        p.innerHTML = content;
        if (_isVisuallyEmpty(content)) p.className = 'fd-empty-p';
        return p;
    }
    function createHeader8(content) {
        const h8 = document.createElement('h8');
        h8.innerHTML = content;
        if (_isVisuallyEmpty(content)) h8.className = 'fd-empty-p';
        return h8;
    }
    function createHeader7(content) {
        const h7 = document.createElement('h7');
        h7.innerHTML = content;
        return h7;
    }
    function createHeader5(content) {
        const h5 = document.createElement('h5');
        h5.innerHTML = content;
        return h5;
    }
    function createHeader3(content) {
        const h3 = document.createElement('h3');
        h3.innerHTML = content;
        return h3;
    }
    // Small italic badge under a step header naming the code clause / method
    function createClause(content) {
        const p = document.createElement('p');
        p.className = 'fd-clause';
        p.innerHTML = content;
        return p;
    }

    // ────────────────────────────────────────────────────────────────
    //  Foundation summary — tabular schedule (replaces the long
    //  paragraph-per-value Summary panel). Mirrors the beam-design
    //  Beam Schedule so the two calculators feel consistent.
    //
    //  Data shape (all fields optional except the geometry block):
    //    {
    //      dc, bx, by, barDia,                          (geometry)
    //      qact, qnet,                                  (bearing)
    //      punching:    { Vu, vn },                     (shear)
    //      beamShearX:  { Vu, vn },
    //      beamShearY:  { Vu, vn },
    //      rebarX:      { n, sc, level, m? },           (reinforcement)
    //      rebarY:      { n, sc, level, m? },
    //      isRectangular: bool,
    //      method:      1 | 2                           (for the title)
    //    }
    // ────────────────────────────────────────────────────────────────
    function fdScheduleRow(label, value, checkCell = '—', checkCls = '') {
        const cls = checkCls ? ` class="${checkCls}"` : '';
        return `<tr><td>${label}</td><td class="fd-sched-num">${value}</td><td${cls}>${checkCell}</td></tr>`;
    }
    function fdSectionHeader(title, span = 3) {
        return `<tr class="fd-sched-header"><td colspan="${span}">${title}</td></tr>`;
    }
    function buildFoundationSummaryHtml(data) {
        const tag = (data && data.method === 2) ? 'Approximation method' : 'Iteration method';
        let html = `<div class="fd-schedule-title">Design Schedule — Final values <small style="font-weight:400;color:#5c6773;font-size:0.78em;">(${tag})</small></div>`;
        html += `<div class="fd-schedule-wrap"><table class="fd-schedule">`;
        html += `<thead><tr><th>Parameter</th><th>Value</th><th>Capacity / Check</th></tr></thead><tbody>`;

        // Geometry & bar size — always present.
        html += fdSectionHeader('Geometry & Bar Size');
        html += fdScheduleRow('Footing depth \\(D_c\\)',           `${data.dc} mm`);
        html += fdScheduleRow('Width along X-axis \\(B_x\\)',      `${Number(data.bx).toFixed(2)} m`);
        html += fdScheduleRow('Width along Y-axis \\(B_y\\)',      `${Number(data.by).toFixed(2)} m`);
        html += fdScheduleRow('Bar diameter \\(d_b\\)',            `&#8709;${data.barDia} mm`);

        // Bearing pressure (when computed and reported).
        if (Number.isFinite(data.qact) && Number.isFinite(data.qnet)) {
            const ok = data.qact <= data.qnet;
            const cls = ok ? 'fd-sched-ok' : 'fd-sched-bad';
            html += fdSectionHeader('Soil Bearing');
            html += fdScheduleRow('Actual pressure \\(q_{act}\\)',
                                  `${data.qact.toFixed(3)} kPa`,
                                  `${ok ? '&#10003;' : '&#10007;'} \\(q_{net}\\) = ${data.qnet.toFixed(3)} kPa`,
                                  cls);
        }

        // Shear checks — punching, beam shear (X), beam shear (Y).
        const hasShear = data.punching || data.beamShearX || data.beamShearY;
        if (hasShear) {
            html += fdSectionHeader('Shear Checks');
            if (data.punching) {
                const ok = data.punching.Vu <= data.punching.vn;
                const cls = ok ? 'fd-sched-ok' : 'fd-sched-bad';
                html += fdScheduleRow('Punching shear \\(V_u\\)',
                                      `${data.punching.Vu.toFixed(2)} kN`,
                                      `${ok ? '&#10003;' : '&#10007;'} \\(\\phi V_n\\) = ${data.punching.vn.toFixed(2)} kN`,
                                      cls);
            }
            if (data.beamShearX) {
                const ok = data.beamShearX.Vu <= data.beamShearX.vn;
                const cls = ok ? 'fd-sched-ok' : 'fd-sched-bad';
                html += fdScheduleRow('Beam shear (X-axis) \\(V_u\\)',
                                      `${data.beamShearX.Vu.toFixed(2)} kN`,
                                      `${ok ? '&#10003;' : '&#10007;'} \\(\\phi V_n\\) = ${data.beamShearX.vn.toFixed(2)} kN`,
                                      cls);
            }
            if (data.beamShearY) {
                const ok = data.beamShearY.Vu <= data.beamShearY.vn;
                const cls = ok ? 'fd-sched-ok' : 'fd-sched-bad';
                html += fdScheduleRow('Beam shear (Y-axis) \\(V_u\\)',
                                      `${data.beamShearY.Vu.toFixed(2)} kN`,
                                      `${ok ? '&#10003;' : '&#10007;'} \\(\\phi V_n\\) = ${data.beamShearY.vn.toFixed(2)} kN`,
                                      cls);
            }
        }

        // Reinforcement schedule — bars per axis + center band for rectangular.
        if (data.rebarX || data.rebarY) {
            html += fdSectionHeader('Reinforcement Schedule');
            if (data.rebarX) {
                const lvl = data.rebarX.level ? ` (${data.rebarX.level} layer)` : '';
                html += fdScheduleRow(
                    `Bars along X-axis${lvl}`,
                    `${data.rebarX.n} pcs &#8709;${data.barDia} mm`,
                    `@ ${Number(data.rebarX.sc).toFixed(2)} mm o.c.`);
                if (data.isRectangular && data.rebarX.m !== undefined && data.rebarX.m !== '') {
                    html += fdScheduleRow('Center-band bars (X)',
                                          `${data.rebarX.m} pcs`,
                                          'concentrated within \\(B_x\\) center band');
                }
            }
            if (data.rebarY) {
                const lvl = data.rebarY.level ? ` (${data.rebarY.level} layer)` : '';
                html += fdScheduleRow(
                    `Bars along Y-axis${lvl}`,
                    `${data.rebarY.n} pcs &#8709;${data.barDia} mm`,
                    `@ ${Number(data.rebarY.sc).toFixed(2)} mm o.c.`);
                if (data.isRectangular && data.rebarY.m !== undefined && data.rebarY.m !== '') {
                    html += fdScheduleRow('Center-band bars (Y)',
                                          `${data.rebarY.m} pcs`,
                                          'concentrated within \\(B_y\\) center band');
                }
            }
        }

        html += `</tbody></table></div>`;

        // Legend mirrors the beam-schedule key.
        html += `<div class="fd-schedule-legend">
            <span><i style="background:#f0faf5;border-color:#b3e0c9;"></i> &#10003; Capacity OK</span>
            <span><i style="background:#fef2ef;border-color:#f0c0b3;"></i> &#10007; Capacity NOT OK / increase size</span>
            <span>Bar layer: upper = closer to top, lower = closer to bottom of the footing slab.</span>
        </div>`;

        return html;
    }
    function renderFoundationSummary(data) {
        const html = buildFoundationSummaryHtml(data);
        for (const id of ['Summary', 'Summary1']) {
            const el = document.getElementById(id);
            if (!el) continue;
            el.innerHTML = html;
            renderMath(el);
        }
        // Batch hook — the Excel upload uses this to capture each
        // foundation's converged data (label, geometry, shears, rebars)
        // without re-parsing the rendered HTML. If no batch is running
        // the callback is undefined and we no-op.
        if (typeof window._foundationBatchCapture === 'function') {
            try { window._foundationBatchCapture(data); } catch (_) {}
        }
    }
    function dimension(DC){
        let dc = DC;
        let ds = (h*1000) - dc;
        let qnet = qa - (ys*(ds/1000)) -(yc*(dc/1000)) - q;
        let pu1;
        let pu2;
        let mux1;
        let mux2;
        let muy1;
        let muy2;
       
               
        if(recheck===0){
            document.getElementById('result').appendChild(createHeader5(`Calculation of Dimensions`));
            document.getElementById('result').appendChild(createClause(`Per NSCP 2015 §420.6.1.3 / ACI 318-14 §20.6.1.3 — minimum cover 75 mm for concrete cast against and permanently in contact with earth.`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ D_c = ${dc}mm \$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ D_s = H - D_c = ${h*1000}mm - ${dc}mm = ${ds}mm \$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ q_{net} = q_{all} - (\\gamma_s \\times D_s) - (\\gamma_c \\times D_c) - q =  ${qa}kPa - (${ys}\\frac{kN}{m^3} \\times ${ds/1000}m) - (${yc}\\frac{kN}{m^3} \\times ${dc/1000}m) - ${q}kPa = ${qnet.toFixed(2)}kPa  \$$`));
            console.log(`qnet = ${qnet}`);
            document.getElementById('result').appendChild(createHeader7(`Service Load Calculation`));
            if(loadType==="ultimate"){
                document.getElementById('result').appendChild(createParagraph(`$$\\ P = ${p}kN \$$`));
                if (centricity === "eccentric"){
                document.getElementById('result').appendChild(createParagraph(`$$\\ M_x = ${mx}kNm \$$`));
                document.getElementById('result').appendChild(createParagraph(`$$\\ M_y = ${my}kNm   \$$`));
                }
            } else if (loadType==="individual"){
                p = pdl + pll;
                if (centricity === "eccentric"){
                mx = mdlx + mllx;
                my = mdly + mlly;
            }
                document.getElementById('result').appendChild(createParagraph(`$$\\ P = P_{DL} + P{LL} = ${pdl}kN + ${pll}kN = ${p}kN \$$`));
                if (centricity === "eccentric"){
                document.getElementById('result').appendChild(createParagraph(`$$\\ M_x = M_{xDL} + M_{xLL} = ${mdlx}kNm + ${mllx}kNm = ${mx}kNm \$$`));
                document.getElementById('result').appendChild(createParagraph(`$$\\ M_y = M_{yDL} + M_{yLL} = ${mdly}kNm + ${mlly}kNm = ${my}kNm   \$$`));
                }
            } if (centricity === "eccentric"){
            document.getElementById('result').appendChild(createHeader7(`Solve Service Eccentricity`));       
            
            ey = mx / p;
            ex = my / p;
            document.getElementById('result').appendChild(createParagraph(`$$\\ e_x = \\frac {M_y}{P} = \\frac {${my}kNm}{${p}kN} = ${(ex*1000).toFixed(2)}mm   \$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ e_y = \\frac {M_x}{P} = \\frac {${mx}kNm}{${p}kN} = ${(ey*1000).toFixed(2)}mm   \$$`));
                if (analysisMethod ==="design"){
                document.getElementById('result').appendChild(createParagraph(`$$\\ q_{net} = \\frac {P}{B_y\\times B_x}\\times (1 + \\frac{6\\times e_x}{B_x} + \\frac{6\\times e_y}{B_y}) \$$`));
                }
            } else if (centricity === "concentric"){
                document.getElementById('result').appendChild(createParagraph(`$$\\ q_{net} = \\frac {P}{B_y\\times B_x} \$$`));
            }
            if (analysisMethod ==="design"){
            document.getElementById('result').appendChild(createHeader7(`Solve for \\( B\\)`)); 
            if (structureType === "Strip") {
                // Combined / Strip footings need a different solver (column
                // spacing + service loads on each column → trapezoidal
                // pressure diagram, not the iso-axial B^2 equation). That
                // solver isn't ported yet, so surface a clear notice instead
                // of silently leaving Bx and By at 0 and cascading NaN
                // through every downstream check.
                throw new Error(
                    'Combined Footing ("Strip") detailed design is not yet implemented. ' +
                    'Switch Analysis Method to "Analyze with specified dimensions" and supply Bx / By / Dc to use the analysis path, ' +
                    'or pick Isolated Square / Isolated Rectangular for the detailed-design flow.'
                );
            } else if (structureType==="Isolated Square"){
                document.getElementById('result').appendChild(createParagraph(`$$\\ q_{net} = \\frac {P}{B^2}\\times (1 + \\frac{6\\times (e_x + e_y)}{B}) \$$`));
                document.getElementById('result').appendChild(createParagraph(`$$\\ ${qnet.toFixed(2)}kPa = \\frac {${p}kN}{B^2}\\times (1 + \\frac{6\\times (${ex.toFixed(3)}m+${ey.toFixed(3)}m)}{B})  \$$`));
                let Bx_solution = newtonRaphson(0, 0, 1,0,qnet,by,p,ex,ey);
                console.log(`Solution for B: ${Bx_solution}`);
                document.getElementById('result').appendChild(createParagraph(`$$\\ B = ${(Bx_solution*1000).toFixed(2)}mm \\approx ${Math.ceil(Bx_solution*10)/10}m \$$`));
                bx = Math.ceil(Bx_solution*10)/10;
                by = bx;
            } else if (structureType==="Isolated Rectangular"){
            if (restrictionType === "1"){
                //Ratio
                let k = ratioLengthB/ratioLengthL;
                let A = qnet*k/p;
                let C = (6*ex)+((6*ey)/k);   
                let initialGuess = 1000; 
                document.getElementById('result').appendChild(createParagraph(`$$\\ q_{net} = \\frac {P}{k \\times B_x^2}\\times (1 + \\frac{6\\times e_x}{B_x} + \\frac{6\\times e_y}{k \\times B_x}) \$$`));
                document.getElementById('result').appendChild(createParagraph(`$$\\ ${qnet.toFixed(2)}kPa = \\frac {${p}kN}{${k.toFixed(3)} \\times B_x^2}\\times (1 + \\frac{6\\times ${ex.toFixed(3)}m}{B_x} + \\frac{6\\times ${ey.toFixed(3)}m}{${k.toFixed(3)} \\times B_x}) \$$`));
                let Bx_solution = newtonRaphson(A, C, initialGuess,"1");
                console.log(`Solution for B_x: ${Bx_solution}`);
                document.getElementById('result').appendChild(createParagraph(`$$\\ B_x = ${(Bx_solution*1000).toFixed(2)}mm \\approx ${Math.ceil(Bx_solution*10)/10}m \$$`));
                document.getElementById('result').appendChild(createParagraph(`$$\\ B_y = k \\times B_x = ${k.toFixed(3)} \\times ${(Bx_solution*1000).toFixed(2)}mm \\approx ${Math.ceil(k*Bx_solution*10)/10}m \$$`));
                bx = Math.ceil(Bx_solution*10)/10;
                by = Math.ceil(k*Bx_solution*10)/10;
            } else if ( restrictionType === "2"){
                //Limited
                by = limitLength;
                let initialGuess = 100; 
                document.getElementById('result').appendChild(createParagraph(`$$\\ ${qnet.toFixed(2)}kPa = \\frac {${p}kN}{${by.toFixed(2)}m \\times B_x}\\times (1 + \\frac{6\\times ${ex.toFixed(3)}m}{B_x} + \\frac{6\\times ${ey.toFixed(3)}m}{${by.toFixed(2)}m}) \$$`));
                let Bx_solution = newtonRaphson(0, 0, initialGuess,"2",qnet,by,p,ex,ey);
                console.log(`Solution for B_x: ${Bx_solution}`);
                document.getElementById('result').appendChild(createParagraph(`$$\\ B_x = ${(Bx_solution*1000).toFixed(2)}mm \\approx ${Math.ceil(Bx_solution*10)/10}m \$$`));
                document.getElementById('result').appendChild(createParagraph(`$$\\ B_y = ${by}m \$$`));
                bx = Math.ceil(Bx_solution*10)/10;
            }
            }} else {
                qact = (p/(by*bx))*(1+(6*ex/bx)+(6*ey/by));
                document.getElementById('result').appendChild(createParagraph(`$$\\ q_{actual} = \\frac {P}{B_y\\times B_x}\\times (1 + \\frac{6\\times e_x}{B_x} + \\frac{6\\times e_y}{B_y}) \$$`));
                document.getElementById('result').appendChild(createParagraph(`$$\\ q_{actual} = \\frac {${p}kN}{${by}m\\times ${bx}m}\\times (1 + \\frac{6\\times ${ex}}{${bx}m} + \\frac{6\\times ${ey}m}{${by}m}) = ${qact}kPa \$$`));
                document.getElementById('result').appendChild(createParagraph(`$$\\ ${qact.toFixed(3)} ${qact > qnet ? "> q_{net} \\therefore \\text{Increase Size}":"< q_{net} \\therefore \\text{SAFE}"} \$$`));

            }
            document.getElementById('result').appendChild(createHeader7(`Solve for Ultimate Loads`));
            document.getElementById('result').appendChild(createClause(`Per NSCP 2015 §203.3.1 / ACI 318-14 §5.3.1 — factored load \\(P_u\\) is the larger of \\(1.4 D\\) and \\(1.2 D + 1.6 L\\).`));
            if(loadType==="ultimate"){
                document.getElementById('result').appendChild(createParagraph(`$$\\ Pu = ${pu.toFixed(2)}kN \$$`));
                if  (centricity === "eccentric"){
                document.getElementById('result').appendChild(createParagraph(`$$\\ M_{ux} = ${mux.toFixed(2)}kNm \$$`));
                document.getElementById('result').appendChild(createParagraph(`$$\\ M_{uy} = ${muy.toFixed(2)}kNm   \$$`));
                }
            } else if (loadType==="individual"){
                if (considerSoil==="yes"){
                    pu1 = 1.4*(pdl)+1.4*(ys*(ds/1000)+yc*(dc/1000)+q)*bx*by;
                    pu2 = 1.2*pdl +1.6*pll + 1.2*(ys*(ds/1000)+yc*(dc/1000)+q)*bx*by;
                    document.getElementById('result').appendChild(createParagraph(``));
                    document.getElementById('result').appendChild(createParagraph(``));
                    document.getElementById('result').appendChild(createParagraph(`\\( P_u = \\text{Greatest of}\\left\\{\\begin{array}{l}1.4 \\times P_{DL} + 1.4 \\times [(\\gamma_s \\times D_s) + (\\gamma_c \\times D_c) + q] \\times B_y \\times B_x \\,  \\\\ 1.2 \\times P_{DL} + 1.6 \\times P_{LL} + 1.2 \\times [(\\gamma_s \\times D_s) + (\\gamma_c \\times D_c) + q] \\times B_y \\times B_x \\,  \\end{array}\\right. \\)`));
                    document.getElementById('result').appendChild(createParagraph(``));
                    document.getElementById('result').appendChild(createParagraph(``));

                    document.getElementById('result').appendChild(createParagraph(`\\( P_u = \\text{Greatest of}\\left\\{\\begin{array}{l}1.4 \\times ${pdl}kN + 1.4 \\times [(${ys} \\frac{kN}{m^3} \\times ${ds/1000}m) + (${yc} \\frac{kN}{m^3} \\times ${dc/1000}m) + ${q}kPa] \\times ${by}m \\times ${bx}m = ${pu1.toFixed(2)}kN \\,  \\\\  1.2 \\times ${pdl}kN + 1.6 \\times ${pll}kN + 1.2 \\times [(${ys} \\frac{kN}{m^3} \\times ${ds/1000}m) + (${yc} \\frac{kN}{m^3} \\times ${dc/1000}m) + ${q}kPa] \\times ${by}m \\times ${bx}m  = ${pu2.toFixed(2)}kN \\,  \\end{array}\\right. = ${Math.max(pu1,pu2).toFixed(2)}kN \\)`));
                    
                    pu = Math.max(pu1,pu2); 
                } else {
                    pu1 = 1.4*pdl;
                    pu2 = 1.2*pdl +1.6*pll;
                    document.getElementById('result').appendChild(createParagraph(``));
                    document.getElementById('result').appendChild(createParagraph(`\\( P_u = \\text{Greatest of}\\left\\{\\begin{array}{l}1.4 \\times P_{DL}\\ = 1.4 \\times ${pdl}kN = ${pu1.toFixed(2)}kN\\,  \\\\ 1.2 \\times P_{DL} + 1.6 \\times P_{LL} = 1.2 \\times ${pdl}kN + 1.6 \\times ${pll}kN = ${pu2.toFixed(2)}kN  \\,  \\end{array}\\right. = ${Math.max(pu1,pu2).toFixed(2)}kN \\)`));
                    
                    pu = Math.max(pu1,pu2); 
                    }
                    if  (centricity === "eccentric"){
                mux1 = 1.4*(mdlx);
                mux2 = 1.2*mdlx +1.6*mllx;
                muy1 = 1.4*(mdly);
                muy2 = 1.2*mdly +1.6*mlly;
                document.getElementById('result').appendChild(createParagraph(``));
                document.getElementById('result').appendChild(createParagraph(``));

                document.getElementById('result').appendChild(createParagraph(`\\( M_{ux} = \\text{Greatest of}\\left\\{\\begin{array}{l}1.4 \\times M_{xDL} = 1.4 \\times ${mdlx}kNm = ${mux1.toFixed(2)}kNm \\,  \\\\ 1.2 \\times M_{xDL} + 1.6 \\times M_{xLL} = 1.2 \\times ${mdlx}kNm + 1.6 \\times ${mllx}kNm = ${mux2.toFixed(2)}kNm \\,  \\end{array}\\right. = ${Math.max(mux1,mux2).toFixed(2)}kNm \\)`));
                document.getElementById('result').appendChild(createParagraph(``));
                document.getElementById('result').appendChild(createParagraph(``));

                document.getElementById('result').appendChild(createParagraph(`\\( M_{uy} = \\text{Greatest of}\\left\\{\\begin{array}{l}1.4 \\times M_{yDL} = 1.4 \\times ${mdly}kNm = ${muy1.toFixed(2)}kNm \\,  \\\\ 1.2 \\times M_{yDL} + 1.6 \\times M_{yLL} = 1.2 \\times ${mdly}kNm + 1.6 \\times ${mlly}kNm = ${muy2.toFixed(2)}kNm \\,  \\end{array}\\right. = ${Math.max(muy1,muy2).toFixed(2)}kNm \\)`));
                document.getElementById('result').appendChild(createParagraph(``));
                document.getElementById('result').appendChild(createParagraph(``));

                
                document.getElementById('result').appendChild(createHeader7(`Solve for Ultimate Eccentricity`));
                muy = Math.max(muy1,muy2);
                mux = Math.max(mux1,mux2);
                euy = mux/pu;
                eux = muy/pu;
                con = (6*euy/by)+(6*eux/bx);
                document.getElementById('result').appendChild(createParagraph(`$$\\ e_{ux} = \\frac{M_{uy}}{P} = \\frac{${muy.toFixed(2)}kNm}{${pu.toFixed(2)}kN} = ${(eux*1000).toFixed(2)}mm\$$`));
                document.getElementById('result').appendChild(createParagraph(`$$\\ e_{uy} = \\frac{M_{ux}}{P} = \\frac{${mux.toFixed(2)}kNm}{${pu.toFixed(2)}kN} = ${(euy*1000).toFixed(2)}mm\$$`));
                document.getElementById('result').appendChild(createParagraph(`$$\\ 6 \\times \\frac{e_{ux}}{B_x} + 6 \\times \\frac{e_{uy}}{B_y} \\le 1 \$$`));
                document.getElementById('result').appendChild(createParagraph(`$$\\ 6 \\times \\frac{${(eux*1000).toFixed(2)}mm}{${(bx*1000).toFixed(2)}mm} + 6 \\times \\frac {${(euy*1000).toFixed(2)}mm}{${(by*1000).toFixed(2)}mm} \\le 1 \$$`));
                document.getElementById('result').appendChild(createParagraph(`$$\\ ${con.toFixed(6)} ${con > 1 ? "> 1 \\therefore \\text{Case 1, With Tension}":"< 1 \\therefore \\text{Case 2, Without Tension}"} \$$`));
                }
                

            }
        } else if (recheck===1){
            document.getElementById('result').appendChild(createHeader5(`Recompute Dimensions`));       
            document.getElementById('result').appendChild(createParagraph(`$$\\ D_c = ${dc}mm \$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ D_s = H - D_c = ${h*1000}mm - ${dc}mm = ${ds}mm \$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ q_{net} = q_{all} - (\\gamma_s \\times D_s) - (\\gamma_c \\times D_c) - q =  ${qa}kPa - (${ys}\\frac{kN}{m^3} \\times ${ds/1000}m) - (${yc}\\frac{kN}{m^3} \\times ${dc/1000}m) - ${q}kPa = ${qnet.toFixed(2)}kPa  \$$`));
            console.log(`qnet = ${qnet}`);
            document.getElementById('result').appendChild(createHeader7(`Service Load Calculation`));
            if(loadType==="ultimate"){
                document.getElementById('result').appendChild(createParagraph(`$$\\ P = ${p}kN \$$`));
                if (centricity === "eccentric"){
                document.getElementById('result').appendChild(createParagraph(`$$\\ M_x = ${mx}kNm \$$`));
                document.getElementById('result').appendChild(createParagraph(`$$\\ M_y = ${my}kNm   \$$`));
                }
            } else if (loadType==="individual"){
                p = pdl + pll;
                if (centricity === "eccentric"){
                mx = mdlx + mllx;
                my = mdly + mlly;
            }
                document.getElementById('result').appendChild(createParagraph(`$$\\ P = ${p}kN \$$`));
                if (centricity === "eccentric"){
                document.getElementById('result').appendChild(createParagraph(`$$\\ M_x = ${mx}kNm \$$`));
                document.getElementById('result').appendChild(createParagraph(`$$\\ M_y = ${my}kNm \$$`));
                }
            } if (centricity === "eccentric"){
            document.getElementById('result').appendChild(createHeader7(`Solve Service Eccentricity`));       
            
            ey = mx / p;
            ex = my / p;
            document.getElementById('result').appendChild(createParagraph(`$$\\ e_x = \\frac {M_y}{P} = ${(ex*1000).toFixed(2)}mm   \$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ e_y = \\frac {M_x}{P} = ${(ey*1000).toFixed(2)}mm   \$$`));
            } else if (centricity === "concentric"){
            document.getElementById('result').appendChild(createParagraph(`$$\\ q_{net} = \\frac {P}{B_y\\times B_x} \$$`));

            }
            document.getElementById('result').appendChild(createHeader7(`Solve for \\( B\\)`)); 
            if (structureType === "Strip") {
                // Combined / Strip footings need a different solver (column
                // spacing + service loads on each column → trapezoidal
                // pressure diagram, not the iso-axial B^2 equation). That
                // solver isn't ported yet, so surface a clear notice instead
                // of silently leaving Bx and By at 0 and cascading NaN
                // through every downstream check.
                throw new Error(
                    'Combined Footing ("Strip") detailed design is not yet implemented. ' +
                    'Switch Analysis Method to "Analyze with specified dimensions" and supply Bx / By / Dc to use the analysis path, ' +
                    'or pick Isolated Square / Isolated Rectangular for the detailed-design flow.'
                );
            } else if (structureType==="Isolated Square"){
                document.getElementById('result').appendChild(createParagraph(`$$\\ q_{net} = \\frac {P}{B^2}\\times (1 + \\frac{6\\times (e_x + e_y)}{B}) \$$`));
                document.getElementById('result').appendChild(createParagraph(`$$\\ ${qnet.toFixed(2)}kPa = \\frac {${p}kN}{B^2}\\times (1 + \\frac{6\\times (${ex.toFixed(3)}m+${ey.toFixed(3)}m)}{B})  \$$`));
                let Bx_solution = newtonRaphson(0, 0, 1,0,qnet,by,p,ex,ey);
                console.log(`Solution for B: ${Bx_solution}`);
                document.getElementById('result').appendChild(createParagraph(`$$\\ B = ${(Bx_solution*1000).toFixed(2)}mm \\approx ${Math.ceil(Bx_solution*10)/10}m \$$`));
                bx = Math.ceil(Bx_solution*10)/10;
                by = bx;
            } else if (structureType==="Isolated Rectangular"){
            if (restrictionType === "1"){
                //Ratio
                let k = ratioLengthB/ratioLengthL;
                let A = qnet*k/p;
                let C = (6*ex)+((6*ey)/k);   
                let initialGuess = 1000; 
                document.getElementById('result').appendChild(createParagraph(`$$\\ q_{net} = \\frac {P}{k \\times B_x^2}\\times (1 + \\frac{6\\times e_x}{B_x} + \\frac{6\\times e_y}{k \\times B_x}) \$$`));
                document.getElementById('result').appendChild(createParagraph(`$$\\ ${qnet.toFixed(2)}kPa = \\frac {${p}kN}{${k.toFixed(3)} \\times B_x^2}\\times (1 + \\frac{6\\times ${ex.toFixed(3)}m}{B_x} + \\frac{6\\times ${ey.toFixed(3)}m}{${k.toFixed(3)} \\times B_x}) \$$`));
                let Bx_solution = newtonRaphson(A, C, initialGuess,"1");
                console.log(`Solution for B_x: ${Bx_solution}`);
                document.getElementById('result').appendChild(createParagraph(`$$\\ B_x = ${(Bx_solution*1000).toFixed(2)}mm \\approx ${Math.ceil(Bx_solution*10)/10}m \$$`));
                document.getElementById('result').appendChild(createParagraph(`$$\\ B_y = k \\times B_x = ${k.toFixed(3)} \\times ${(Bx_solution*1000).toFixed(2)}mm \\approx ${Math.ceil(k*Bx_solution*10)/10}m \$$`));
                bx = Math.ceil(Bx_solution*10)/10;
                by = Math.ceil(k*Bx_solution*10)/10;
            } else if ( restrictionType === "2"){
                //Limited
                by = limitLength;
                let initialGuess = 100; 
                document.getElementById('result').appendChild(createParagraph(`$$\\ ${qnet.toFixed(2)}kPa = \\frac {${p}kN}{${by.toFixed(2)}m \\times B_x}\\times (1 + \\frac{6\\times ${ex.toFixed(3)}m}{B_x} + \\frac{6\\times ${ey.toFixed(3)}m}{${by.toFixed(2)}m}) \$$`));
                let Bx_solution = newtonRaphson(0, 0, initialGuess,"2",qnet,by,p,ex,ey);
                console.log(`Solution for B_x: ${Bx_solution}`);
                document.getElementById('result').appendChild(createParagraph(`$$\\ B_x = ${(Bx_solution*1000).toFixed(2)}mm \\approx ${Math.ceil(Bx_solution*10)/10}m \$$`));
                document.getElementById('result').appendChild(createParagraph(`$$\\ B_y = ${by}m \$$`));
                bx = Math.ceil(Bx_solution*10)/10;
            }
            }
            document.getElementById('result').appendChild(createHeader7(`Solve for Ultimate Load Combinations`));
                document.getElementById('result').appendChild(createClause(`Per NSCP 2015 §203.3.1 / ACI 318-14 §5.3.1 — factored load \\(P_u\\) is the larger of \\(1.4 D\\) and \\(1.2 D + 1.6 L\\).`));
            if(loadType==="ultimate"){
                document.getElementById('result').appendChild(createParagraph(`$$\\ Pu = ${pu}kN \$$`));
                if  (centricity === "eccentric"){
                document.getElementById('result').appendChild(createParagraph(`$$\\ M_{ux} = ${mux.toFixed(2)}kNm \$$`));
                document.getElementById('result').appendChild(createParagraph(`$$\\ M_{uy} = ${muy.toFixed(2)}kNm   \$$`));
                }
            } else if (loadType==="individual"){
                if (considerSoil==="yes"){
                    pu1 = 1.4*(pdl)+1.4*(ys*(ds/1000)+yc*(dc/1000)+q)*bx*by;
                    pu2 = 1.2*pdl +1.6*pll + 1.2*(ys*(ds/1000)+yc*(dc/1000)+q)*bx*by;
                    document.getElementById('result').appendChild(createParagraph(`$$\\ P_{u} = ${Math.max(pu1,pu2).toFixed(2)}kN\$$`));
                    pu = Math.max(pu1,pu2); 
                    if (centricity === "eccentric"){
                    document.getElementById('result').appendChild(createParagraph(`$$\\ M_{ux} = ${mux.toFixed(2)}kNm \$$`));
                    document.getElementById('result').appendChild(createParagraph(`$$\\ M_{uy} = ${muy.toFixed(2)}kNm   \$$`));
                    }
                } else {
                    pu1 = 1.4*pdl;
                    pu2 = 1.2*pdl +1.6*pll;
                    
                    document.getElementById('result').appendChild(createParagraph(`$$\\ P_{u} = ${Math.max(pu1,pu2).toFixed(2)}kN\$$`));
                    pu = Math.max(pu1,pu2);
                    if (centricity === "eccentric"){
                    document.getElementById('result').appendChild(createParagraph(`$$\\ M_{ux} = ${mux.toFixed(2)}kNm \$$`));
                    document.getElementById('result').appendChild(createParagraph(`$$\\ M_{uy} = ${muy.toFixed(2)}kNm   \$$`));
                    }
                    }

            }

        }
        function newtonRaphson(A, C, initialGuess, restrictionType, q_a_max, by, p, ex, ey, tolerance = 1e-6, maxIterations = 1000000) {
            let Bx = initialGuess; // Initial guess for Bx
            let f_Bx;
            let f_prime_Bx;
            const factor = 6 * (ex + ey);
            for (let i = 0; i < maxIterations; i++) {
                if (structureType==="Isolated Square"){
                    // f(Bx) = (P / Bx^2) * (1 + (6 * (ex + ey) / Bx)) - qa_max
                    // f(Bx) = (P / Bx^2) * (1 + (factor / Bx)) - qa_max
                    f_Bx = (p / Math.pow(Bx, 2)) * (1 + (factor / Bx)) - q_a_max;
    
                    // f'(Bx) = -2 * (P / Bx^3) * (1 + (factor / Bx)) + (factor * P / Bx^4)
                    f_prime_Bx = (-2 * (p / Math.pow(Bx, 3))) * (1 + (factor / Bx)) + (factor * p / Math.pow(Bx, 4));


                } else if (structureType==="Isolated Rectangular"){
                if (restrictionType === "1" ){
                    f_Bx = A * Math.pow(Bx, 3) - Bx - C;
                    f_prime_Bx = 3 * A * Math.pow(Bx, 2) - 1;
                } else if (restrictionType === "2"){
                    f_Bx = (q_a_max * by * Bx) - (p * (1 + (6 * ex / Bx))) - (p * 6 * ey / by);
                    f_prime_Bx = (q_a_max * by) + (p * 6 * ex / Math.pow(Bx, 2));
                }}
                // Update Bx using Newton-Raphson formula
                let next_Bx = Bx - f_Bx / f_prime_Bx;
        
                // Check if the approximation is within tolerance
                if (Math.abs(next_Bx - Bx) < tolerance) {
                    console.log(`Converged to ${next_Bx} after ${i+1} iterations.`);
                    return next_Bx;
                }
        
                // Update Bx for the next iteration
                Bx = next_Bx;
            }
        
            console.log("Did not converge within the maximum number of iterations.");
            return Bx; // Return the last approximation if not converged

        }
        
           
        
        return qnet;
    }

    function punchingShear(){
        let d = dc - cc - barDia;
        let Ao = (d + cx)*(d+cy);
        let Af = (by*1000)*(bx*1000);
        let Vu = pu - pu *(Ao/Af);
        let print = "";
        let vn=0;
        let dc1=0;
        let test;
        console.log(`Ao = `,Ao);
        console.log(`Punching Shear Vu = `,Vu);
        document.getElementById('result').appendChild(createHeader5(`Punching Shear Calculation`));
        document.getElementById('result').appendChild(createClause(`Per NSCP 2015 §422.6.5.2 / ACI 318-14 §22.6.5.2 — two-way (punching) shear; \\(\\phi V_n\\) is the LEAST of three expressions. Strength reduction \\(\\phi = 0.75\\) per §421.2.1.`));
        document.getElementById('result').appendChild(createParagraph(`$$\\ d = D_c - C_c - d_b = ${dc}mm - ${cc}mm - ${barDia}mm = ${d}mm \$$`));
        document.getElementById('result').appendChild(createParagraph(`$$\\ A_o = (d + c_x)\\times (d + c_y) = (${d}mm + ${cx.toFixed(2)}mm)\\times (${d}mm + ${cy.toFixed(2)}mm) = ${Ao.toFixed(2)}mm^2 \$$`));
        document.getElementById('result').appendChild(createParagraph(`$$\\ A_f = B_y \\times B_x = ${by*1000}mm \\times ${bx*1000}mm = ${Af.toFixed(2)}mm^2 \$$`));
        document.getElementById('result').appendChild(createParagraph(`$$\\ V_u = P_u - P_u \\times (\\frac{A_o}{A_f} ) = ${pu.toFixed(2)}kN - ${pu.toFixed(2)}kN \\times (\\frac{${Ao.toFixed(2)}mm^2}{${Af.toFixed(2)}mm^2} ) = ${Vu.toFixed(2)}kN \$$`));
        test = phiVn();
        vn =test.vn;
        dc1 = test.dc;
        console.log(`V,..,.h dc = `,dc1);

        // ACI 318-14 / NSCP 2015 §8.4.4.2 / §22.6.5.4 - Unbalanced moment transfer for eccentric punching
        // Max shear stress on critical section: v_max = Vu/Ac + gamma_v * Mu * c / Jc <= phi * vc
        if (method === 1 && centricity === "eccentric" && (Math.abs(mux) > 0 || Math.abs(muy) > 0)) {
            document.getElementById('result').appendChild(createHeader7(`Unbalanced Moment Transfer (Eccentric Punching)`));
            document.getElementById('result').appendChild(createClause(`Per NSCP 2015 §408.4.4.2 / ACI 318-14 §8.4.4.2 — fraction of unbalanced moment transferred by shear: \\(\\gamma_v = 1 - 1/(1 + \\tfrac{2}{3}\\sqrt{b_1/b_2})\\). Stress check: \\(v_{max} = V_u/A_c + \\gamma_v M_u c / J_c \\le \\phi v_c\\).`));
            if (columnLocation !== 1) {
                document.getElementById('result').appendChild(createParagraph(`$$\\ \\text{Note: } \\gamma_v \\text{ check below assumes an interior column. Edge/corner critical sections require separate hand check per ACI 318 §8.4.4.}\$$`));
            }
            // Critical section dimensions at d/2 from column face (interior column - full perimeter)
            const b1x = cx + d;                                // perp. to Y-axis bending (shear from Muy)
            const b2x = cy + d;
            const b1y = cy + d;                                // perp. to X-axis bending (shear from Mux)
            const b2y = cx + d;
            const Ac = (2*(d+cx) + 2*(d+cy)) * d;              // bo * d
            const JcMuy = (d*Math.pow(b1x,3))/6 + (Math.pow(d,3)*b1x)/6 + (d*b2x*Math.pow(b1x,2))/2;
            const JcMux = (d*Math.pow(b1y,3))/6 + (Math.pow(d,3)*b1y)/6 + (d*b2y*Math.pow(b1y,2))/2;
            const gammaF_x = 1 / (1 + (2/3)*Math.sqrt(b1x/b2x));
            const gammaF_y = 1 / (1 + (2/3)*Math.sqrt(b1y/b2y));
            const gammaV_x = 1 - gammaF_x;
            const gammaV_y = 1 - gammaF_y;
            const cABx = b1x/2;
            const cABy = b1y/2;
            // Convert to N and N*mm
            const Vu_N   = Vu * 1000;
            const Mux_Nmm = mux * 1e6;
            const Muy_Nmm = muy * 1e6;
            const vmax  = Vu_N/Ac + (gammaV_y*Mux_Nmm*cABy)/JcMux + (gammaV_x*Muy_Nmm*cABx)/JcMuy;
            const phivc = (vn*1000)/Ac;                        // governing phi*Vn / Ac

            document.getElementById('result').appendChild(createParagraph(`$$\\ A_c = B_o \\times d = ${(2*(d+cx)+2*(d+cy)).toFixed(2)}mm \\times ${d.toFixed(2)}mm = ${Ac.toFixed(2)}mm^2 \$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ \\gamma_{v,x} = 1 - \\frac{1}{1 + \\tfrac{2}{3}\\sqrt{b_{1x}/b_{2x}}} = 1 - \\frac{1}{1 + \\tfrac{2}{3}\\sqrt{${b1x.toFixed(1)}/${b2x.toFixed(1)}}} = ${gammaV_x.toFixed(4)} \$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ \\gamma_{v,y} = 1 - \\frac{1}{1 + \\tfrac{2}{3}\\sqrt{b_{1y}/b_{2y}}} = 1 - \\frac{1}{1 + \\tfrac{2}{3}\\sqrt{${b1y.toFixed(1)}/${b2y.toFixed(1)}}} = ${gammaV_y.toFixed(4)} \$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ J_{c,Muy} = \\frac{d\\,b_{1x}^3}{6} + \\frac{d^3 b_{1x}}{6} + \\frac{d\\,b_{2x}\\,b_{1x}^2}{2} = ${JcMuy.toExponential(3)}\\,mm^4 \$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ J_{c,Mux} = \\frac{d\\,b_{1y}^3}{6} + \\frac{d^3 b_{1y}}{6} + \\frac{d\\,b_{2y}\\,b_{1y}^2}{2} = ${JcMux.toExponential(3)}\\,mm^4 \$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ v_{max} = \\frac{V_u}{A_c} + \\frac{\\gamma_{v,y}\\,M_{ux}\\,c_{AB,y}}{J_{c,Mux}} + \\frac{\\gamma_{v,x}\\,M_{uy}\\,c_{AB,x}}{J_{c,Muy}} = ${vmax.toFixed(3)}\\,MPa \$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ \\phi v_c = \\frac{\\phi V_n}{A_c} = ${phivc.toFixed(3)}\\,MPa \$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ v_{max} ${vmax < phivc ? "< \\phi v_c \\therefore \\text{SAFE for combined shear + moment transfer}" : "> \\phi v_c \\therefore \\text{FAIL — increase } D_c \\text{ or column size}"} \$$`));
        }
        function phiVn(){
           
            let vn1;
            let vn2;
            let vn3;

            let beta;
            let alphaS;
            let bo;
            console.log(`Method = `,method);

            if( method === 1){
                console.log("phivn Method 1")
                if (cx<cy){
                    beta = cy/cx;
                    bo = (2*(d+cx))+(2*(d+cy));
                    document.getElementById('result').appendChild(createParagraph(`$$\\ \\beta = \\frac{c_y}{c_x} = \\frac{${cy.toFixed(2)}mm}{${cx.toFixed(2)}mm} = ${beta.toFixed(3)}\$$`));
                    document.getElementById('result').appendChild(createParagraph(`$$\\ B_o = [2 \\times (d + c_x)]+[2 \\times (d + c_y)] = [2 \\times (${d}mm + ${cx.toFixed(2)}mm)]+[2 \\times (${d}mm + ${cy.toFixed(2)}mm)] = ${bo.toFixed(3)}mm\$$`));
                    
                } else if (cy<cx){
                    beta = cx/cy;
                    document.getElementById('result').appendChild(createParagraph(`$$\\ \\beta = \\frac{c_x}{c_y} = \\frac{${cx.toFixed(2)}mm}{${cy.toFixed(2)}mm} = ${beta.toFixed(3)}\$$`));
                    bo = (2*(d+cx))+(2*(d+cy));
                    document.getElementById('result').appendChild(createParagraph(`$$\\ B_o = [2 \\times (d + c_x)]+[2 \\times (d + c_y)] = [2 \\times (${d}mm + ${cx.toFixed(2)}mm)]+[2 \\times (${d}mm + ${cy.toFixed(2)}mm)] = ${bo.toFixed(3)}mm\$$`));
                   
                } else if (cx===cy){
                    beta = 1;
                    document.getElementById('result').appendChild(createParagraph(`$$\\ \\beta = \\frac{c_y}{c_x} = \\frac{${cy.toFixed(2)}mm}{${cx.toFixed(2)}mm} = ${beta}\$$`));
                    bo = (2*(d+cx))+(2*(d+cy));
                    document.getElementById('result').appendChild(createParagraph(`$$\\ B_o = 4 \\times (d + c) = 4 \\times (${d}mm + ${cx.toFixed(2)}mm) = ${bo.toFixed(3)}mm\$$`));
                   
                }
                if (columnLocation===1){
                    alphaS = 40;
                    document.getElementById('result').appendChild(createParagraph(`$$\\ \\alpha_s = ${alphaS} ,(\\text{Interior Column})\$$`));

                } else if (columnLocation===2){
                    alphaS = 30;
                    document.getElementById('result').appendChild(createParagraph(`$$\\ \\alpha_s = ${alphaS} ,(\\text{Edge Column})\$$`));

                } else if (columnLocation===3){
                    alphaS = 20;
                    document.getElementById('result').appendChild(createParagraph(`$$\\ \\alpha_s = ${alphaS} ,(\\text{Corner Column})\$$`));

                }

                // ACI 318-14 / NSCP 2015 §422.6.5.2: Vc shall be the least of these three expressions
                vn1 = 0.75 * (1/3) * lambda * Math.sqrt(fc) *bo*d/1000;
                vn2 = 0.75 * (1/6) * (1+(2/beta)) * lambda * Math.sqrt(fc) *bo*d/1000;
                vn3 = 0.75 * (1/12) * (2+(alphaS*d/bo))* lambda * Math.sqrt(fc) *bo*d/1000;
                vn = Math.min(vn1,vn2,vn3);
                document.getElementById('result').appendChild(createParagraph(`\\(\\phi V_n = \\phi V_c = \\text{least of}\\left\\{\\begin{array}{l}\\phi \\times \\frac {1}{3} \\times \\lambda \\times \\sqrt{fc'} \\times B_o \\times d  \\,  \\\\\\phi \\times \\frac {1}{6} \\times ( 1 + \\frac{2}{\\beta}) \\times \\lambda \\times \\sqrt{fc'} \\times B_o \\times d \\, \\\\\\phi \\times \\frac {1}{12} \\times ( 2 + \\frac{\\alpha_s \\times d}{B_o}) \\times \\lambda \\times \\sqrt{fc'} \\times B_o \\times d \\, \\end{array}\\right. \\)`));
                // Removed an empty createParagraph("") that used to sit
                // between the symbolic and numeric phi*Vn blocks for
                // spacing — under the new soft-card paragraph styling
                // it rendered as a visible blank chip in the user's
                // screenshots.
                document.getElementById('result').appendChild(createParagraph(`\\(\\phi V_n = \\left\\{\\begin{array}{l}0.75 \\times \\frac {1}{3} \\times ${lambda} \\times \\sqrt{${fc}MPa} \\times ${bo.toFixed(2)}mm \\times ${d.toFixed(2)}mm = ${(vn1*1000).toFixed(2)}N \\approx ${(vn1).toFixed(2)}kN \\, \\\\0.75 \\times \\frac {1}{6} \\times (1+ \\frac{2}{${beta}}) \\times ${lambda} \\times \\sqrt{${fc}MPa} \\times ${bo.toFixed(2)}mm \\times ${d.toFixed(2)}mm = ${(vn2*1000).toFixed(2)}N \\approx ${(vn2).toFixed(2)}kN \\, \\\\ 0.75 \\times \\frac {1}{12} \\times (2+ \\frac{${alphaS} \\times ${d.toFixed(2)}}{${bo.toFixed(2)}}) \\times ${lambda} \\times \\sqrt{${fc}MPa} \\times ${bo.toFixed(2)}mm \\times ${d}mm = ${(vn3*1000).toFixed(2)}N \\approx ${(vn3).toFixed(2)}kN \\, \\end{array}\\right. = ${vn.toFixed(2)}kN \\, \\)`));
                document.getElementById('result').appendChild(createParagraph(`$$\\ V_u = ${Vu.toFixed(2)}kN ${Vu<vn ? "< \\phi V_n    \\therefore \\text{SAFE}":"> \\phi V_{n}\\therefore \\text{FAIL}"}\$$`));
                
            } else {
                console.log("phivn Method 2")
                document.getElementById('result').appendChild(createParagraph(`$$\\ V_{u} = \\phi \\times \\frac {1}{3} \\times \\lambda \\times \\sqrt{fc'} \\times (2 \\times (d + c_x) + 2 \\times (d + c_y) \\times d  \$$`));
                document.getElementById('result').appendChild(createParagraph(`$$\\ ${Vu.toFixed(2)}kN = 0.75 \\times \\frac {1}{3} \\times ${lambda} \\times \\sqrt{${fc}MPa} \\times (2 \\times (d + ${cx.toFixed(2)}mm) + 2 \\times (d + ${cy.toFixed(2)}mm) \\times d  \$$`));
                d = newtonRaphson(100);
                document.getElementById('result').appendChild(createParagraph(`$$\\ d = ${d.toFixed(2)} \\approx ${(Math.ceil(d/25)*25).toFixed(2)}\$$`));
                document.getElementById('result').appendChild(createParagraph(`$$\\ \\text{(Approximate: V_u held constant at the initial geometry; refine via iteration for a tight design.)}\$$`));
                dc = d + cc + barDia;
                document.getElementById('result').appendChild(createParagraph(`$$\\ D_c = ${d.toFixed(2)} + ${cc}mm + ${barDia}mm = ${dc.toFixed(2)}mm \\approx ${(Math.ceil(dc/25)*25).toFixed(2)}mm\$$`));
                dc = Math.ceil(dc/25)*25;
                console.log(`V dc method2 = `,dc);
            }
            function newtonRaphson(initialGuess, tolerance = 1e-6, maxIterations = 100000) {
                let d = initialGuess; // Initial guess for d
                let f_d, f_prime_d;
            
                for (let i = 0; i < maxIterations; i++) {
                    // Calculate the function f(d)
                    f_d = 0.75 * (1 / 3) * lambda * Math.sqrt(fc) * (2 * (d + cx) + 2 * (d + cy)) * d - (Vu*1000);
            
                    // Calculate the derivative f'(d)
                    f_prime_d = 0.75 * (1 / 3) * lambda * Math.sqrt(fc) * (4 * d + 2 * (d + cx) + 2 * (d + cy));
            
                    // Newton-Raphson formula to update d
                    let next_d = d - f_d / f_prime_d;
            
                    // Check if the difference is within tolerance
                    if (Math.abs(next_d - d) < tolerance) {
                        console.log(`Converged to d = ${next_d} after ${i+1} iterations.`);
                        return next_d; // Return the result when converged
                    }
            
                    // Update d for the next iteration
                    d = next_d;
                }
            
                console.log(`Did not converge within the maximum number of iterations.`, d);
                return d; // Return the last approximation if not converged
            }
            console.log(`Vm2 dc = `,dc);
            return {vn,dc} ;

        }
        
        return {dc,dc1,vn,Vu};
    }
    function beamShear(axis,dc){
        let x1;
        let x2;
        let y1;
        let y2;
        let vn;
        let longer;
        let shorter;
        let depth;
        if(bx<by){
            longer ="y";
            shorter ="x";
        } else if (bx>by){
            longer ="x";
            shorter="y";
        } 
        if(axis === "y"){
        //ACROSS X AXIS or ALONG Y AXIS
        if( longer === axis ){
            console.log(`y is longer`);
            r = 0.5;
            depth = dc - cc - (0.5*barDia);
        } else if ( shorter === axis ){
            console.log(`y is shorter`);
            depth = dc - cc - (1.5*barDia);
            r = 1.5;
        } else if ( bx === by){
            console.log(`y is equal to x`);
            depth = dc - cc - (1.5*barDia);
            r = 1.5;
        }
        
        x1 = -((bx*1000)/2);           console.log(`x1 = `,x1);
        x2 = (bx*1000)/2;              console.log(`x2 = `,x2);
        y1 = (cy/2)+depth;      console.log(`y1 = `,y1);
        y2 = ((by*1000)/2);            console.log(`y2 = `,y2);
       
        document.getElementById('result').appendChild(createHeader5(`Beam Shear Calculation Along Y-axis (Cut Across Y-axis)`));
        document.getElementById('result').appendChild(createClause(`Per NSCP 2015 §422.5.5 / ACI 318-14 §22.5.5 — one-way (beam) shear: \\(\\phi V_c = \\phi \\cdot \\tfrac{1}{6}\\lambda\\sqrt{f'_c}\\,b_w\\,d\\) with \\(\\phi = 0.75\\).`));
        if( longer === axis ){
            document.getElementById('result').appendChild(createParagraph(`$$\\ d = D_c - C_c - 0.5d_b = ${dc}mm - ${cc}mm - 0.5(${barDia}mm) = ${depth}mm \$$`));
        } else if ( shorter === axis ){
            document.getElementById('result').appendChild(createParagraph(`$$\\ d = D_c - C_c - 1.5d_b = ${dc}mm - ${cc}mm - 1.5(${barDia}mm) = ${depth}mm \$$`));
        } else {
            document.getElementById('result').appendChild(createParagraph(`$$\\ d = D_c - C_c - 1.5d_b = ${dc}mm - ${cc}mm - 1.5(${barDia}mm) = ${depth}mm \$$`));
        }     
        
        document.getElementById('result').appendChild(createParagraph(`$$\\ x_1 = \\frac {-B_x}{2} = \\frac {${-bx*1000}mm}{2} = ${x1}mm \$$`));
        document.getElementById('result').appendChild(createParagraph(`$$\\ x_2 = \\frac {B_x}{2} = \\frac {${bx*1000}mm}{2} = ${x2}mm \$$`));
        document.getElementById('result').appendChild(createParagraph(`$$\\ y_1 = \\frac {c_y}{2} + d = \\frac {${cy.toFixed(2)}mm}{2} + ${depth}mm = ${y1.toFixed(2)}mm \$$`));
        document.getElementById('result').appendChild(createParagraph(`$$\\ y_2 = \\frac {B_y}{2} = \\frac {${by*1000}mm}{2} = ${y2}mm\$$`));
       
        } else if (axis === "x"){
        //ACROSS X AXIS or ALONG Y AXIS
        if( longer === axis ){
            depth = dc - cc - (0.5*barDia);
            r = 0.5;
        } else if ( shorter === axis ){
            depth = dc - cc - (1.5*barDia);
            r = 1.5;
        } else if ( bx === by){
            console.log(`y is equal to x`);
            depth = dc - cc - (0.5*barDia);
            r = 0.5;
        }
        x1 = (cx/2)+depth;      console.log(`x1 = `,x1);
        x2 = ((bx*1000)/2);            console.log(`x2 = `,x2);
        y1 = -((by*1000)/2);           console.log(`y1 = `,y1);
        y2 = (by*1000)/2;              console.log(`y2 = `,y2);

        
        document.getElementById('result').appendChild(createHeader5(`Beam Shear Calculation Along X-axis (Cut Across X-axis)`));
        document.getElementById('result').appendChild(createClause(`Per NSCP 2015 §422.5.5 / ACI 318-14 §22.5.5 — one-way (beam) shear: \\(\\phi V_c = \\phi \\cdot \\tfrac{1}{6}\\lambda\\sqrt{f'_c}\\,b_w\\,d\\) with \\(\\phi = 0.75\\).`));
        if( longer === axis ){
            document.getElementById('result').appendChild(createParagraph(`$$\\ d = D_c - C_c - 0.5d_b = ${dc}mm - ${cc}mm - 0.5(${barDia}mm) = ${depth}mm \$$`));
        } else if ( shorter === axis ){
            document.getElementById('result').appendChild(createParagraph(`$$\\ d = D_c - C_c - 1.5d_b = ${dc}mm - ${cc}mm - 1.5(${barDia}mm) = ${depth}mm \$$`));
        } else {
            document.getElementById('result').appendChild(createParagraph(`$$\\ d = D_c - C_c - 0.5d_b = ${dc}mm - ${cc}mm - 0.5(${barDia}mm) = ${depth}mm \$$`));
        }
        
        document.getElementById('result').appendChild(createParagraph(`$$\\ x_1 = \\frac {c_x}{2} + d = \\frac {${cx.toFixed(2)}mm}{2} + {${depth}mm} = ${x1.toFixed(2)}mm \$$`));
        document.getElementById('result').appendChild(createParagraph(`$$\\ x_2 = \\frac {B_x}{2} = \\frac {${bx*1000}mm}{2} = ${x2}mm \$$`));
        document.getElementById('result').appendChild(createParagraph(`$$\\ y_1 = \\frac {-B_y}{2} = \\frac {${-by*1000}mm}{2} = ${y1}mm \$$`));
        document.getElementById('result').appendChild(createParagraph(`$$\\ y_2 = \\frac {B_y}{2} = \\frac {${by*1000}mm}{2} = ${y2}mm\$$`));
         
        }
        let a = x2 - x1;            console.log(`a = `,a);
        let b = y2 - y1;            console.log(`b = `,b);    
        let c = x2 + x1;            console.log(`c = `,c);
        let d = y2 + y1;            console.log(`d = `,d);
        let Vu = (Math.abs((a*b))/(by*bx*1000*1000))*(pu+((6*c*muy*1000)/Math.pow(bx*1000,2))+((6*d*mux*1000)/Math.pow(by*1000,2)));
        document.getElementById('result').appendChild(createParagraph(`$$\\ x_2 - x_1 = ${x2.toFixed(2)}mm - (${x1.toFixed(2)})mm = ${a.toFixed(2)}mm\$$`));
        document.getElementById('result').appendChild(createParagraph(`$$\\ y_2 - y_1 = ${y2.toFixed(2)}mm - (${y1.toFixed(2)})mm = ${b.toFixed(2)}mm\$$`));
        document.getElementById('result').appendChild(createParagraph(`$$\\ x_2 + x_1 = ${x2.toFixed(2)}mm + (${x1.toFixed(2)})mm = ${c.toFixed(2)}mm\$$`));
        document.getElementById('result').appendChild(createParagraph(`$$\\ y_2 + y_1 = ${y2.toFixed(2)}mm + (${y1.toFixed(2)})mm = ${d.toFixed(2)}mm\$$`));
        if (method === 1){
            if (axis === "x"){
            vn = phiVn(by*1000,"B_y");
            } else if (axis === "y"){
            vn = phiVn(bx*1000,"B_x"); 
            }
        } 
        document.getElementById('result').appendChild(createParagraph(`$$\\ V_u = \\frac{(x_2 - x_1)\\times(y_2 - y_1)}{B_y \\times B_x}\\times (P_u + \\frac{6 \\times (x_2 + x_1) \\times M_{uy}}{B_x^2} + \\frac{6 \\times (y_2 + y_1) \\times M_{ux}}{B_y^2} ) \$$`));
        document.getElementById('result').appendChild(createParagraph(`$$\\ V_u = \\frac{(${a.toFixed(2)}mm)\\times(${b.toFixed(2)}mm)}{${by*1000}mm \\times ${bx*1000}mm}\\times (${pu.toFixed(2)}kN + \\frac{6 \\times (${c.toFixed(2)}mm) \\times ${muy.toFixed(2)}kNm}{(${bx*1000}mm)^2} + \\frac{6 \\times (${d.toFixed(2)}mm) \\times ${mux.toFixed(2)}kNm}{(${by*1000}mm)^2} ) \$$`));
        if (method === 1){
            document.getElementById('result').appendChild(createParagraph(`$$\\ V_u = ${Vu.toFixed(2)}kN ${Vu<vn ? "< \\phi V_n    \\therefore \\text{SAFE}":"> \\phi V_{n}\\therefore \\text{FAIL}"}\$$`));
            
        } else if (method === 2){
            document.getElementById('result').appendChild(createParagraph(`$$\\ V_u = ${Vu.toFixed(2)}kN\$$`));

            if (axis === "x"){
                document.getElementById('result').appendChild(createParagraph(`$$\\ V_u = \\phi \\times \\frac {1}{6} \\times \\lambda \\times \\sqrt{fc'} \\times B_y \\times d \$$`));
                document.getElementById('result').appendChild(createParagraph(`$$\\ ${(Vu*1000).toFixed(2)}N = 0.75 \\times \\frac {1}{6} \\times ${lambda} \\times \\sqrt{${fc}MPa} \\times ${by*1000}mm \\times d \$$`));
                d = newtonRaphson(100,by*1000);  
            } else if (axis === "y"){
                document.getElementById('result').appendChild(createParagraph(`$$\\ V_u = \\phi \\times \\frac {1}{6} \\times \\lambda \\times \\sqrt{fc'} \\times B_x \\times d \$$`));
                document.getElementById('result').appendChild(createParagraph(`$$\\ ${(Vu*1000).toFixed(2)}N = 0.75 \\times \\frac {1}{6} \\times ${lambda} \\times \\sqrt{${fc}MPa} \\times ${bx*1000}mm \\times d \$$`));
                d = newtonRaphson(100,bx*1000);     
            }
            document.getElementById('result').appendChild(createParagraph(`$$\\ d = ${d.toFixed(2)}mm\$$`));
            dc1 = d + cc + (r*barDia);
            document.getElementById('result').appendChild(createParagraph(`$$\\ D_c = ${d.toFixed(2)} + ${cc}mm + (${r} \\times ${barDia}mm) = ${dc1.toFixed(2)}mm \\approx ${(Math.ceil(dc1/25)*25).toFixed(2)}mm\$$`));
            dc1 = Math.ceil(dc1/25)*25;
        }
        function phiVn(B,text){
            console.log(fc)
            let vn = 0.75 * (1/6) * lambda * Math.sqrt(fc) *B *depth/1000;
            document.getElementById('result').appendChild(createParagraph(`$$\\phi V_n = \\phi \\times \\frac {1}{6} \\times \\lambda \\times \\sqrt{fc'} \\times ${text} \\times d = 0.75 \\times \\frac {1}{6} \\times ${lambda} \\times \\sqrt{${fc}MPa} \\times ${B}mm \\times ${depth}mm = ${(vn*1000).toFixed(2)}N \\approx ${(vn).toFixed(2)}kN\$$`));
        
            return vn;
        }
       
        
        function newtonRaphson(initialGuess,B, tolerance = 1e-6, maxIterations = 100000000) {
            const K = 0.75 * (1/6) * lambda * Math.sqrt(fc) * B;
            console.log(`k = `,K);
            let d = initialGuess; // Initial guess for d
            let f_d, f_prime_d;
            let i = 0;
            while (i < maxIterations) {
                // Calculate the function f(d)
                f_d =  (Vu*1000) - K * d;
                // Calculate the derivative f'(d)
                f_prime_d = -K;
                // Newton-Raphson formula to update d
                let next_d = d - f_d / f_prime_d;
        
                // Check if the difference is within tolerance
                if (Math.abs(next_d - d) < tolerance) {
                    console.log(`Converged to d = ${next_d} after ${i+1} iterations.`);
                    return next_d; // Return the result when converged
                }
                i++;
                // Update d for the next iteration
                d = next_d;
                
            }
        
            console.log("Did not converge within the maximum number of iterations.");
            return d; // Return the last approximation if not converged
        }
        console.log(`Beam Shear Vu = `,Vu);
        console.log(`Beam Shear phi Vn = `,vn);
        return {vn,Vu,d,dc1};
    }
    function rebarDesign(axis){
        console.log(100);
        let x1;
        let x2;
        let y1;
        let y2;
        let longer;
        let shorter;
        let depth;
        

        if(bx<by){
            longer ="y";
            shorter ="x";
        } else if (bx>by){
            longer ="x";
            shorter="y";
        } 
        console.log(200);
        document.getElementById('result').appendChild(createHeader5(`Solve Preliminary Values for Design`));
        document.getElementById('result').appendChild(createClause(`Per NSCP 2015 §422.2.2.4.3 / ACI 318-14 §22.2.2.4.3 — Whitney stress-block factor \\(\\beta_1\\): \\(0.85\\) for \\(f'_c \\le 28\\,\\text{MPa}\\), reduces by \\(0.05/7\\) per MPa above 28, with a floor of \\(0.65\\).`));

        // ACI 318-14 / NSCP 2015 §22.2.2.4.3: beta1 step-down coefficient is 0.05/7, not 0.5/7
        let beta1 = 0;
        if ((0.85-(0.05/7)*(fc-28))>=0.85){
            beta1 = 0.85;
        } else if ((0.85-(0.05/7)*(fc-28))<0.65) {
            beta1 = 0.65;
        } else {
            beta1 = 0.85-(0.05/7)*(fc-28);
        }
        document.getElementById('result').appendChild(createParagraph(`$$\\ \\beta_1 : 0.65 < [0.85 - (\\frac{0.05}{7})\\times (f'_c - 28)] \\le 0.85 \$$`));
        document.getElementById('result').appendChild(createParagraph(`$$\\ \\beta_1 = 0.85 - (\\frac{0.05}{7})\\times (${fc} - 28) = ${beta1.toFixed(3)} \$$`));
        
        
        if(axis === "y"){
        //ACROSS X AXIS or ALONG Y AXIS
        if( longer === axis ){
            console.log(`y is longer`);
            r = 0.5;
            depth = dc - cc - (0.5*barDia);
            level = "lower";
        } else if ( shorter === axis ){
            console.log(`y is shorter`);
            depth = dc - cc - (1.5*barDia);
            r = 1.5;
            level = "upper";
        } else if ( bx === by){
            console.log(`y is equal to x`);
            depth = dc - cc - (1.5*barDia);
            r = 1.5;
            level = "upper";
        }
        document.getElementById('result').appendChild(createHeader5(`Rebar Design Calculation Along Y-axis (Cut Across Y-axis)`));       
        
        x1 = -(bx*1000/2);             console.log(`x1 = `,x1);
        x2 = ((bx*1000)/2);            console.log(`x2 = `,x2);
        y1 = ((cy)/2);           console.log(`y1 = `,y1);
        y2 = (by*1000)/2;              console.log(`y2 = `,y2);
        
        document.getElementById('result').appendChild(createParagraph(`$$\\ x_1 = \\frac {-B_x}{2} = \\frac {${-bx*1000}mm}{2} = ${x1}mm \$$`));
        document.getElementById('result').appendChild(createParagraph(`$$\\ x_2 = \\frac {B_x}{2} = \\frac {${bx*1000}mm}{2} = ${x2}mm \$$`));
        document.getElementById('result').appendChild(createParagraph(`$$\\ y_1 = \\frac {c_y}{2} = \\frac {${cy.toFixed(2)}mm}{2} = ${y1.toFixed(2)}mm \$$`));
        document.getElementById('result').appendChild(createParagraph(`$$\\ y_2 = \\frac {B_y}{2} = \\frac {${by*1000}mm}{2} = ${y2}mm\$$`));
       
        
        document.getElementById('result').appendChild(createParagraph(`$$\\ d = D_c - C_c - ${r}d_b = ${dc}mm - ${cc}mm - ${r}(${barDia}mm) = ${depth}mm \$$`));
        

        let a = x2 - x1;            console.log(`a = `,a);
        let b = y2 - y1;            console.log(`b = `,b);    
        let c = x2 + x1;            console.log(`c = `,c);
        let d = y2 + y1;            console.log(`d = `,d);
        
        console.log(`by = `,by);
        console.log(`bx = `,bx);
        console.log(`pu = `,pu);
        console.log(`muy = `,muy);
        console.log(`mux = `,mux);
        let muyShortcut;
        if (centricity === "eccentric"){
            muyShortcut = (((x2/1000)-(x1/1000))*Math.pow(((y2/1000)-(y1/1000)),2)/(2*by*bx))*(pu+(6*((x2/1000)+(x1/1000))*muy/Math.pow(bx,2))+(4*((2*y2/1000)+(y1/1000))*mux/Math.pow(by,2)));
            console.log(`Muy(shortcut) = `,muyShortcut);
            document.getElementById('result').appendChild(createParagraph(`$$\\ M_{uy(shortcut)} = \\frac{(x_2-x_1) \\times (y_2-y_1)^2}{2 \\times A_f} \\times (P_u + \\frac{6 \\times (x_2 + x_1 ) \\times M_{uy}}{B_x^2} + \\frac{4 \\times (2 \\times y_2 + y_1) \\times M_{ux}}{B_y^2})  \$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ M_{uy(shortcut)} = \\frac{(${a/1000}m) \\times (${b.toFixed(2)/1000}m)^2}{2 \\times ${by}m\\times${bx}m} \\times (${pu}kN +  \\frac{4 \\times (2 \\times ${y2/1000}m + (${(y1/1000).toFixed(2)}m)) \\times ${mux.toFixed(2)}kNm}{(${by}m)^2}) = ${muyShortcut.toFixed(2)}kNm  \$$`));
        } else {
            muyShortcut = (((x2/1000)-(x1/1000))*Math.pow(((y2/1000)-(y1/1000)),2)/(2*by*bx))*(pu);
            console.log(`Muy(shortcut) = `,muyShortcut);
            document.getElementById('result').appendChild(createParagraph(`$$\\ M_{uy(shortcut)} = \\frac{(x_2-x_1) \\times (y_2-y_1)^2}{2 \\times A_f} \\times (P_u)\$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ M_{uy(shortcut)} = \\frac{(${a/1000}m) \\times (${b.toFixed(2)/1000}m)^2}{2 \\times ${by}m\\times${bx}m} \\times (${pu}kN) = ${muyShortcut.toFixed(2)}kNm  \$$`));           
        }
        checkSRRB(bx*1000,muyShortcut,"x");

        
    } else if(axis === "x"){
        //ACROSS Y AXIS or ALONG X AXIS
        if( longer === axis ){
            console.log(`x is longer`);
            r = 0.5;
            depth = dc - cc - (0.5*barDia);
            level = "lower";
        } else if ( shorter === axis ){
            console.log(`x is shorter`);
            depth = dc - cc - (1.5*barDia);
            r = 1.5;
            level = "upper";
        } else if ( bx === by){
            console.log(`x is equal to y`);
            depth = dc - cc - (0.5*barDia);
            r = 0.5;
            level = "lower";
        }
        document.getElementById('result').appendChild(createHeader5(`Rebar Design Calculation Along X-axis (Cut Across X-axis)`));       
        
        x1 = cx/2;             console.log(`x1 = `,x1);
        x2 = ((bx*1000)/2);            console.log(`x2 = `,x2);
        y1 = -(by*1000/2);           console.log(`y1 = `,y1);
        y2 = (by*1000)/2;              console.log(`y2 = `,y2);
        
        document.getElementById('result').appendChild(createParagraph(`$$\\ x_1 = \\frac {c_x}{2} = \\frac {${cx.toFixed(2)}mm}{2} = ${x1.toFixed(2)}mm \$$`));
        document.getElementById('result').appendChild(createParagraph(`$$\\ x_2 = \\frac {B_x}{2} = \\frac {${bx*1000}mm}{2} = ${x2}mm \$$`));
        document.getElementById('result').appendChild(createParagraph(`$$\\ y_1 = \\frac {-B_y}{2} = \\frac {${(-by*1000)}mm}{2} = ${y1}mm \$$`));
        document.getElementById('result').appendChild(createParagraph(`$$\\ y_2 = \\frac {B_y}{2} = \\frac {${by*1000}mm}{2} = ${y2}mm\$$`));
       
        
        document.getElementById('result').appendChild(createParagraph(`$$\\ d = D_c - C_c - ${r}d_b = ${dc}mm - ${cc}mm - ${r}(${barDia}mm) = ${depth}mm \$$`));
        

        let a = x2 - x1;            console.log(`a = `,a);
        let b = y2 - y1;            console.log(`b = `,b);    
        let c = x2 + x1;            console.log(`c = `,c);
        let d = y2 + y1;            console.log(`d = `,d);
        
        console.log(`by = `,by);
        console.log(`bx = `,bx);
        console.log(`pu = `,pu);
        console.log(`muy = `,muy);
        console.log(`mux = `,mux);
        let muxShortcut;
        if (centricity === "eccentric"){
        muxShortcut = (Math.pow(((x2/1000)-(x1/1000)),2)*((y2/1000)-(y1/1000))/(2*by*bx))*(pu+(4*((2*x2/1000)+(x1/1000))*muy/Math.pow(bx,2))+(6*((y2/1000)+(y1/1000))*mux/Math.pow(by,2)));
        console.log(`Mux(shortcut) = `,muxShortcut);
        document.getElementById('result').appendChild(createParagraph(`$$\\ M_{ux(shortcut)} = \\frac{(x_2-x_1)^2 \\times (y_2-y_1)}{2 \\times A_f} \\times (P_u + \\frac{4 \\times (2 \\times x_2 + x_1 ) \\times M_{uy}}{B_x^2} + \\frac{6 \\times (y_2 + y_1) \\times M_{ux}}{B_y^2})  \$$`));
        document.getElementById('result').appendChild(createParagraph(`$$\\ M_{ux(shortcut)} = \\frac{(${a.toFixed(2)/1000}m)^2 \\times (${b/1000}m)}{2 \\times ${by}m\\times${bx}m} \\times (${pu}kN + \\frac{4 \\times (2 \\times ${(x2/1000).toFixed(2)}m +${(x1/1000).toFixed(2)}m) \\times ${muy.toFixed(2)}kNm}{(${bx}m)^2}) = ${muxShortcut.toFixed(2)}kNm  \$$`));
        } else {
            muxShortcut = (Math.pow(((x2/1000)-(x1/1000)),2)*((y2/1000)-(y1/1000))/(2*by*bx))*(pu) ;
            console.log(`Mux(shortcut) = `,muxShortcut);
            document.getElementById('result').appendChild(createParagraph(`$$\\ M_{ux(shortcut)} = \\frac{(x_2-x_1)^2 \\times (y_2-y_1)}{2 \\times A_f} \\times (P_u) \$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ M_{ux(shortcut)} = \\frac{(${a.toFixed(2)/1000}m)^2 \\times (${b/1000}m)}{2 \\times ${by}m\\times${bx}m} \\times (${pu}kN) = ${muxShortcut.toFixed(2)}kNm  \$$`));
        
        }
        checkSRRB(by*1000,muxShortcut,"y");

        
    }
    function checkSRRB (b,mu,text){
        let ct = 3*depth/8;
        let at = ct*beta1;
        let muMax = 0.9 * 0.85 * fc * at * b *(depth-(at/2))/1000000;
        document.getElementById('result').appendChild(createHeader7(`Check if SRRB`));
        document.getElementById('result').appendChild(createClause(`Per NSCP 2015 §421.2.2 / ACI 318-14 §21.2.2 — tension-controlled limit \\(c_t = 3d/8\\) gives steel strain \\(\\varepsilon_t = 0.005\\) and \\(\\phi = 0.90\\); below this, the section is Singly-Reinforced (SRRB), above it requires compression steel (DRRB).`));
        document.getElementById('result').appendChild(createParagraph(`$$\\ c_t = 3 \\times \\frac{d}{8} = 3 \\times \\frac{${depth}}{8} = ${ct.toFixed(2)}mm \$$`));
        document.getElementById('result').appendChild(createParagraph(`$$\\ a_t = \\beta_1 \\times  c_t   = ${beta1} \\times ${ct.toFixed(2)}mm = ${at.toFixed(2)}mm \$$`));
        document.getElementById('result').appendChild(createParagraph(`$$\\ M_{u(max)} = \\phi \\times 0.85 \\times f'c \\times a_t \\times b \\times (d - \\frac{a_t}{2}) \$$`));
        document.getElementById('result').appendChild(createParagraph(`$$\\ M_{u(max)} = 0.9 \\times 0.85 \\times ${fc}MPa \\times ${at.toFixed(2)}mm \\times ${b}mm \\times (${depth}mm - \\frac{${at.toFixed(2)}mm}{2}) = ${muMax.toFixed(2)}kNm \$$`));
        
        document.getElementById('result').appendChild(createParagraph(`$$\\ M_u ${mu < muMax ? "< M_{u(max)} \\therefore \\text{ SRRB}":"> M_{u(max)} \\therefore  \\text{ DRRB}"} \$$`));
        let rn = (mu*1000000)/(0.9*b*Math.pow(depth,2));
        document.getElementById('result').appendChild(createParagraph(`$$\\ R_{n} = \\frac{M_{uy}}{\\phi B_${text} d^2} = \\frac{${(mu*1000).toFixed(2)}Nm}{${0.9}\\times  ${b}m \\times  (${depth}mm)^2}  = ${rn.toFixed(3)}\\frac{N}{mm^2} \$$`));
        let rho = 0.85 * (fc/fy)*(1-Math.sqrt(1-(2*rn/(0.85*fc))));
        document.getElementById('result').appendChild(createParagraph(`$$\\ \\rho = 0.85 \\times (\\frac{f'c}{fy}) \\times (1- \\sqrt{1 - 2 \\times \\frac{R_n}{0.85 \\times f'c} }) = 0.85 \\times (\\frac{${fc}MPa}{${fy}MPa}) \\times (1- \\sqrt{1 - 2 \\times \\frac{${rn.toFixed(3)}MPa}{0.85 \\times ${fc}MPa} }) = ${rho.toFixed(6)} \$$`));
        let rhomin1 = 1.4/fy;
        let rhomin2 = Math.sqrt(fc)/(4*fy);
        let rhomin = Math.max(rhomin1,rhomin2);
        document.getElementById('result').appendChild(createClause(`Per NSCP 2015 §409.6.1.2 / ACI 318-14 §9.6.1.2 — minimum flexural reinforcement ratio \\(\\rho_{min}\\) is the larger of \\(1.4/f_y\\) and \\(\\sqrt{f'_c}/(4 f_y)\\).`));
        document.getElementById('result').appendChild(createParagraph(`\\( \\rho_{min} = \\text {Greatest of} \\left\\{\\begin{array}{l} \\frac{1.4}{fy} = \\frac{1.4}{${fy}MPa} = ${rhomin1.toFixed(6)}\\, \\\\ \\frac{f'c}{4 \\times fy} = \\frac{${fc}MPa}{4 \\times ${fy}MPa} = ${rhomin2.toFixed(6)} \\, \\end{array}\\right. = ${rhomin.toFixed(6)} \\, \\)`));
        document.getElementById('result').appendChild(createParagraph(`$$\\ \\therefore \\rho = ${rho>rhomin ? rho.toFixed(6):rhomin.toFixed(6)} \$$`));
        rho = Math.max(rho,rhomin);
        let as = rho*b*depth;
        // ACI 24.4.3.2 / NSCP 425.6.1.1: shrinkage-and-temperature reinforcement
        //  rhoST = 0.0018 for Grade 414 and higher deformed bars; 0.0020 otherwise.
        let rhoST = (fy >= 414) ? 0.0018 : 0.0020;
        let asmin = rhoST*dc*b;
        document.getElementById('result').appendChild(createParagraph(`$$\\ A_s = \\rho \\times B_${text} \\times d = ${rho.toFixed(6)}\\times ${b}mm \\times ${depth.toFixed(2)}mm = ${as.toFixed(2)}mm^2 \$$`));
        document.getElementById('result').appendChild(createClause(`Per NSCP 2015 §425.6.1.1 / ACI 318-14 §24.4.3.2 — shrinkage-and-temperature ratio \\(\\rho_{ST}\\): \\(0.0018\\) for Grade 414+ deformed bars, \\(0.0020\\) otherwise. Selected here based on the entered \\(f_y\\).`));
        // Note: keep \geq / < OUTSIDE any \text{} — math operators don't parse
        // inside text mode in KaTeX, which was causing this line to fall back
        // to raw markup on the deployed page.
        document.getElementById('result').appendChild(createParagraph(`$$\\ A_{s,min} = \\rho_{ST} \\times A_g = ${rhoST.toFixed(4)} \\times B_${text} \\times D_c = ${rhoST.toFixed(4)} \\times ${b}\\,\\text{mm} \\times ${dc}\\,\\text{mm} = ${asmin.toFixed(2)}\\,\\text{mm}^2 \\quad (\\rho_{ST} = ${rhoST.toFixed(4)},\\; f_y ${fy >= 414 ? "\\geq" : "<"} 414\\,\\mathrm{MPa}) \$$`));
        document.getElementById('result').appendChild(createParagraph(`$$\\  ${as>asmin ? "A_s > A_{smin}":"A_s < A_{smin}"} \$$`));
        as = Math.max(as,asmin);
        document.getElementById('result').appendChild(createParagraph(`$$\\ \\therefore A_s = ${as.toFixed(2)}mm^2 \$$`));
        let ab = (Math.PI/4)*Math.pow(barDia,2);
        n = as/ab;
        document.getElementById('result').appendChild(createParagraph(``));
        document.getElementById('result').appendChild(createParagraph(`$$\\ n = \\frac{A_s}{A_b} = \\frac{${as.toFixed(2)}mm}{\\frac{\\pi}{4} \\times (${barDia}mm)^2} = ${n.toFixed(2)} \\approx ${Math.ceil(n)}pcs \$$`));
        n = Math.ceil(n);
        const sc_raw = (b - 2*cc - (n*barDia))/(n-1);
        let scmin = Math.max(50,barDia,(4/3)*dAgg);
        // Floor the detailing spacing down to the nearest 25 mm increment
        // (standard rebar layout practice). The raw value still drives
        // the "Sc > Sc,min" sufficiency check so we never under-flag a
        // borderline case, but every downstream consumer — schedule,
        // beam-schedule table, batch comparison — uses the floored
        // value because that's what actually gets detailed.
        const sc_floored = Math.max(0, Math.floor(sc_raw / 25) * 25);
        sc = sc_floored;
        document.getElementById('result').appendChild(createParagraph(`$$\\ S_c = \\frac{B_${text} - (2 \\times C_c) - (n \\times d_b)}{n - 1} = \\frac{${b}mm - (2 \\times ${cc}mm) - (${n} \\times ${barDia}mm)}{${n} - 1} = ${sc_raw.toFixed(2)}mm \\;\\approx\\; ${sc_floored}mm \\text{ (floor to 25 mm)} \$$`));
        document.getElementById('result').appendChild(createParagraph(`\\( S_{c(min)} = \\text {Greatest of} \\left\\{\\begin{array}{l} 50mm\\, \\\\  d_b = ${barDia}mm \\, \\\\  d_{agg} = ${dAgg}mm \\,\\end{array}\\right. = ${scmin}mm \\, \\)`));
        document.getElementById('result').appendChild(createParagraph(`$$\\  ${sc_raw>scmin ? "S_c > S_{c(min)} \\therefore \\text{Okay}":"S_c < S_{c(min)} \\therefore \\text{Insufficient Spacing, add layer}"} \$$`));
        let centerbandRatio;
        let beta;
        if (by>bx){
            beta = by/bx;
        } else if (bx>by){
            beta = bx/by;
        } else {
            beta = 1;
        }
        centerbandRatio = 2 / (beta+1);
        m = Math.ceil(n*centerbandRatio);
        document.getElementById('result').appendChild(createClause(`Per NSCP 2015 §413.3.3.3 / ACI 318-14 §13.3.3.3 — in rectangular footings, a portion \\(\\Upsilon_s = 2/(\\beta+1)\\) of the short-direction reinforcement is concentrated in a center band of width equal to the short side, where \\(\\beta\\) = long / short.`));
        document.getElementById('result').appendChild(createParagraph(`$$\\ \\Upsilon_s = \\frac{2}{\\beta + 1} = \\frac{2}{${beta.toFixed(2)} + 1} = ${centerbandRatio.toFixed(2)}\$$`));
        document.getElementById('result').appendChild(createParagraph(`$$\\ n_{centerband} = n \\times \\Upsilon_s = ${n} \\times ${centerbandRatio.toFixed(2)} = ${(n*centerbandRatio).toFixed(2)}pcs \\approx ${Math.ceil(n*centerbandRatio)}pcs \$$`));
        
    }
    
    }
    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    // printDiv is hoisted to the outer DOMContentLoaded scope below so
    // the module-load save-button listener can call it.

  window.jsPDF = window.jspdf.jsPDF;

  function generatePDF(divId) {
    const doc = new jsPDF();

    // Capture LaTeX content
    let content = document.getElementById(divId).innerHTML;

    // Add content to PDF
    doc.text(content, 10, 10);

    // Save or auto-print the PDF
    doc.save('FoundationDesign.pdf');
  }
    //GET PARAMETERS AND INITIALIZE VALUES
    document.getElementById('GivenParameters1').appendChild(createHeader5(`Parameters Given:`));
    // (Removed an empty createHeader5("") that was here for spacing — it
    //  rendered as an empty numbered step-chip in the styled output.)
    const analysisMethod = document.getElementById('analysisMethod').value;
    let method = parseInt(document.getElementById('Method').value);
    
    


    let structureType = document.getElementById('structureType').value;
    const restrictionType = document.getElementById('LengthRestriction').value;
    const ratioLengthL = parseFloat(document.getElementById('RatioL').value);
    const ratioLengthB = parseFloat(document.getElementById('RatioB').value); 
    const limitLength =  parseFloat(document.getElementById('Limitation').value);
    const centricity =  document.getElementById('centricity').value;
    if (centricity === "concentric") {
        document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ Concentric \$$`));

    } else if (centricity === "eccentric") {
        document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ Eccentric \$$`));

    }
    let qact = 0;
    let dc=250;
    let dc1=0;
    let dc2=0;
    let dc3=0;
    let finalDc=0;
    // Concrete cover Cc (mm). Default 75 mm matches ACI 20.6.1.3.1 for concrete cast against earth.
    let cc = parseFloat(document.getElementById('Cover').value);
    if (!Number.isFinite(cc) || cc <= 0) { cc = 75; }
    document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ C_c = ${cc}mm  \$$`));
    let by=0;
    let bx=0;
    if (analysisMethod === "analyze"){
        bx = parseFloat(document.getElementById('bx').value);
        by = parseFloat(document.getElementById('by').value);
        dc = parseFloat(document.getElementById('dc').value);
        document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ B_x = ${bx}m  \$$`));
        document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ B_y = ${by}m  \$$`));
        document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ D_c = ${dc}mm  \$$`));
        console.log(`0bx: `, bx);
        console.log(`0by: `, by);
        method = 1;
        if(by === bx){
            structureType = "Isolated Square";
        } else {
            structureType = "Isolated Rectangular";
        }
        console.log(`11bx: `, bx);
        console.log(`11by: `, by);
    } else {

    if (structureType==="Isolated Rectangular"){
        if (restrictionType === "1"){
                //Ratio
                document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ ${ratioLengthL}B_{y} = ${ratioLengthB}B_x  \$$`));

            }else if (restrictionType === "2"){
                //limited
                document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ B_y = ${limitLength}m  \$$`));
                document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ \$$`));
                
                
            }
    }}
    console.log(`1bx: `, bx);
    console.log(`1by: `, by);
    const loadType = document.getElementById('loadType').value;
    let muy=0;
    let mux=0;
    let p=0;
    let pu=0;
    let mx=0;
    let my=0;
    let ey=0;
    let ex=0;
    let mdlx=0;
    let mdly=0;
    let mllx=0;
    let mlly=0;
    let recheck=0;
    let pdl;
    let pll;
    if (loadType === "ultimate" ){
        p = parseFloat(document.getElementById('AllowableLoad').value);
        document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ P = ${p}kN \$$`));
        pu = parseFloat(document.getElementById('UltimateLoad').value);
        document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ P_{u} = ${pu}kN  \$$`));

        if  (centricity === "eccentric"){
            mx = parseFloat(document.getElementById('AllowableMx').value);
            my = parseFloat(document.getElementById('AllowableMy').value);
            mux = parseFloat(document.getElementById('UltimateMx').value);
            muy = parseFloat(document.getElementById('UltimateMy').value);
            document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ M_{x} = ${mx}kNm  \$$`));
            document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ M_{y} = ${my}kNm  \$$`));
            document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ M_{ux} = ${mux}kNm \$$`));
            document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ M_{uy} = ${muy}kNm  \$$`));

        }
    } else {
    pdl = parseFloat(document.getElementById('DeadLoad').value);
    document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ P_{dl} = ${pdl}kN  \$$`));

    pll = parseFloat(document.getElementById('LiveLoad').value);
    document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ P_{ll} = ${pll}kN  \$$`));

    if  (centricity === "eccentric"){
    mdlx = parseFloat(document.getElementById('mdlx').value);
    mllx = parseFloat(document.getElementById('mllx').value);
    mdly = parseFloat(document.getElementById('mdly').value);
    mlly = parseFloat(document.getElementById('mlly').value);
    document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ M_{dlx} = ${mdlx}kNm  \$$`));
    document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ M_{llx} = ${mllx}kNm  \$$`));
    document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ M_{dly} = ${mdly}kNm \$$`));
    document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ M_{lly} = ${mlly}kNm  \$$`));
}}
    const h = parseFloat(document.getElementById('Depth').value);
    const barDia = parseInt(document.getElementById('BarDiameter').value);
    const dAgg = parseInt(document.getElementById('aggDiameter').value);
    document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ H = ${h*1000}mm  \$$`));
    document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ d_b = ${barDia}mm  \$$`));
    document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ d_{agg} = ${dAgg}mm  \$$`));

    const columnShape = document.getElementById('columnShape').value;
    let cx=0;
    let cy=0;
    if (columnShape==="square"){
        cx = parseInt(document.getElementById('ColumnWidth').value);
        cy = cx;
        document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ c = ${cx}mm , \\text{Square Column} \$$`));

    } else if (columnShape==="rectangular"){
        cx = parseInt(document.getElementById('ColumnWidthX').value);
        cy = parseInt(document.getElementById('ColumnWidthY').value);
        document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ c_x = ${cx}mm  \$$`));
        document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ c_y = ${cy}mm , \\text{Rectangular Column} \$$`));
        
    } else if (columnShape==="circle"){
        cx = parseInt(document.getElementById('ColumnWidth').value)*Math.sqrt(Math.PI/4);
        cy = cx;
        document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ c = ${(cx/Math.sqrt(Math.PI/4)).toFixed(0)}mm \\times \\sqrt{\\frac{\\pi}{4}} = ${cx.toFixed(2)}mm , \\text{Spiral Column} \$$`));
        
    }
    console.log(`bx: `, bx);
    console.log(`by: `, by);
    let columnLocation = parseInt(document.getElementById('ColumnLocation').value);
    const qa = parseFloat(document.getElementById('SoilBearingCapacity').value);
    const q = parseFloat(document.getElementById('Surcharge').value);
    const lambda = parseInt(document.getElementById('λ').value);
    const fc = parseFloat(document.getElementById('fc').value);
    const fy = parseFloat(document.getElementById('fy').value);
    const ys = parseFloat(document.getElementById('UnitWeightSoil').value);
    const yc = parseFloat(document.getElementById('UnitWeightConcrete').value);
    const considerSoil = document.getElementById('considerSoil').value;
    document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ q_a = ${qa}kPa  \$$`));
    document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ q = ${q}kPa  \$$`));
    document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ \\lambda = ${lambda}  \$$`));
    document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ f'c = ${fc}MPa  \$$`));
    document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ fy = ${fy}MPa  \$$`));
    document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ f'c = ${fc}MPa  \$$`));
    document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ \\gamma_s = ${ys}\\frac{kN}{m^3}  \$$`));
    document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ \\gamma_c = ${yc}\\frac{kN}{m^3}  \$$`));

    console.log(`bx: `, bx);
    console.log(`by: `, by);

    let r=0;
    let calc;
    let beamShearX;
    let beamShearY;
    let punchingV;
    let euy=0;
    let eux=0;
    let con=0;
    let m;
    let n;
    let sc;
    let level;
    //START SOLUTION
    let logic = determineMethod(structureType,loadType,columnShape,centricity,method);
    console.log(`logic: `, logic);
    console.log(`bx: `, bx);
    console.log(`by: `, by);
    calc = dimension(dc);
    console.log(`bx after: `, bx);
    console.log(`by after: `, by);
    punchingV = punchingShear ();
    
    if(method === 1){
        //ITERATION METHOD
        if (analysisMethod==="design"){
        console.log(`Punching Vu = `,punchingV.Vu);
        console.log(`Punching Vn = `,punchingV.vn);
        while(punchingV.vn<punchingV.Vu){
            console.log("iterating Punching Shear");    
            dc+=25;
            punchingV =punchingShear ();
        }
        beamShearX=beamShear ("x",dc+25);
        beamShearY=beamShear ("y",dc+25);
        while (beamShearX.Vu>beamShearX.vn ||beamShearY.Vu>beamShearY.vn  ){
            dc += 25;
            beamShearX=beamShear ("x",dc+25);
            beamShearY=beamShear ("y",dc+25);
        }
        recheck += 1;
        calc = dimension(dc+25);
        // qact is the actual soil pressure that the chosen Bx × By
        // produces under the (already-summed) service load P. The
        // engine only assigned qact in the "analyze with specified
        // dimensions" branch — in DESIGN mode for concentric loads it
        // stayed at its default 0, which is why the Soil-Bearing row
        // was reading "0.000 kPa" in the user's PDF. Compute it here
        // so every design path reports the same number.
        qact = (p / (bx * by)) * (1 + (6 * (ex || 0) / bx) + (6 * (ey || 0) / by));
        // Run rebar designs (also appends to #result) and capture the
        // per-axis n / spacing / layer values for the schedule.
        rebarDesign("x");
        const rebarX_size = { n, sc, level };
        if (structureType === "Isolated Rectangular") rebarX_size.m = m;
        rebarDesign("y");
        const rebarY_size = { n, sc, level };
        if (structureType === "Isolated Rectangular") rebarY_size.m = m;
        // Even when the foundation is SIZE-CONTROLLED (the while-loop
        // grew dc until shear passes), surface the actual Vu / phi*Vn
        // for transparency — otherwise the verdict column reads
        // "reported (no SAFE/FAIL)" with no diagnostic.
        renderFoundationSummary({
            method: 1,
            dc, bx, by, barDia,
            qact, qnet: calc,
            punching:   punchingV
                          ? { Vu: punchingV.Vu,  vn: punchingV.vn  } : null,
            beamShearX: beamShearX
                          ? { Vu: beamShearX.Vu, vn: beamShearX.vn } : null,
            beamShearY: beamShearY
                          ? { Vu: beamShearY.Vu, vn: beamShearY.vn } : null,
            rebarX: rebarX_size, rebarY: rebarY_size,
            isRectangular: structureType === "Isolated Rectangular"
        });
    } else {
        beamShearX = beamShear("x", dc);
        beamShearY = beamShear("y", dc);
        // Same qact computation as the size-controlled branch above —
        // the engine never set it for concentric loads in this path
        // either.
        qact = (p / (bx * by)) * (1 + (6 * (ex || 0) / bx) + (6 * (ey || 0) / by));
        rebarDesign("x");
        const rebarX_punch = { n, sc, level };
        if (structureType === "Isolated Rectangular") rebarX_punch.m = m;
        rebarDesign("y");
        const rebarY_punch = { n, sc, level };
        if (structureType === "Isolated Rectangular") rebarY_punch.m = m;
        renderFoundationSummary({
            method: 1,
            dc, bx, by, barDia,
            qact, qnet: calc,
            punching:   { Vu: punchingV.Vu,   vn: punchingV.vn   },
            beamShearX: { Vu: beamShearX.Vu,  vn: beamShearX.vn  },
            beamShearY: { Vu: beamShearY.Vu,  vn: beamShearY.vn  },
            rebarX: rebarX_punch, rebarY: rebarY_punch,
            isRectangular: structureType === "Isolated Rectangular"
        });
        }

    } else if (method === 2){
        //APPROXIMATION METHOD
        beamShearX=beamShear ("x",dc+25);
        dc2=beamShearX.dc1;
        beamShearY=beamShear ("y",dc+25);
        dc3=beamShearY.dc1;
        finalDc = Math.max(punchingV.dc1,dc2,dc3);
        console.log(`dc: ${punchingV.dc1}, ${dc2}, ${dc3}  `);
        console.log(`final dc: ${finalDc}mm  `);
        document.getElementById('result').appendChild(createParagraph(`\\( D_c = \\text {Greatest of} \\left\\{\\begin{array}{l} ${punchingV.dc1}mm \\, \\\\ ${dc2}mm \\, \\\\ ${dc3}mm \\, \\end{array}\\right. = ${finalDc}mm \\, \\)`));
        recheck += 1;
        calc = dimension(finalDc);
        dc = finalDc;
        
        rebarDesign("x");
        const rebarX_appr = { n, sc, level };
        if (structureType === "Isolated Rectangular") rebarX_appr.m = m;
        rebarDesign("y");
        const rebarY_appr = { n, sc, level };
        if (structureType === "Isolated Rectangular") rebarY_appr.m = m;
        // Method 2 solves dc from the equality Vu = phi*Vn, so phi*Vn
        // is real — surface both sides of the comparison instead of
        // hiding the verdict behind +Infinity.
        renderFoundationSummary({
            method: 2,
            dc, bx, by, barDia,
            punching:   { Vu: punchingV.Vu,   vn: punchingV.vn   },
            beamShearX: { Vu: beamShearX.Vu,  vn: beamShearX.vn  },
            beamShearY: { Vu: beamShearY.Vu,  vn: beamShearY.vn  },
            rebarX: rebarX_appr, rebarY: rebarY_appr,
            isRectangular: structureType === "Isolated Rectangular"
        });
    }
    document.getElementById('saveButton').style.display = 'block';
    document.getElementById('tab').style.display = 'flex';
    // Render all math now that every paragraph has been appended.
    renderAllMath();
    // The save-button listener is attached ONCE at module-load below,
    // not here — the previous code re-attached on every submit, so an
    // Excel batch of 3 footings ended up with 3 click handlers all
    // calling printDiv (and the first call's window.location.reload
    // killed the others before they could finish).
} catch (engineErr) {
    // The submit handler used to bury every exception with bare
    // `catch {}` — which is exactly why the Excel batch could
    // "silently not calculate": any failed read of an empty field,
    // any divide-by-zero, any KaTeX render hiccup would throw,
    // get swallowed, and leave #result empty with no clue why.
    //
    // Log it so the user (or me) can paste it from DevTools, and
    // re-throw so the batch runner's surrounding try/catch hears
    // about it and marks that row as failed with the real
    // message instead of the generic "did not converge".
    console.error('[foundationDesign engine] threw:', engineErr);
    throw engineErr;
}

 });



});
