import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { createStore, defaultBackend } from '../engine/soils/store'
import { resolveParameters, PARAMETER_LABEL, type ParameterKey } from '../engine/soils/parameters'
import { PROVENANCE_LABEL, describeProvenance, type SourcedValue } from '../engine/soils/provenance'
import type { Investigation, Borehole, SoilLayer } from '../engine/soils/model'
import { layerThickness } from '../engine/soils/model'
import type { LayerUnitWeight } from '../engine/soils/sptProfile'

// ─────────────────────────────────────────────────────────────────────────
// Pull γ, c′ and φ′ for a calculator from a saved soil investigation.
//
// The point of the whole soils module in one component: a soil property is
// interpreted once, on /soils, and read here — instead of being retyped on the
// bearing, slope and pile pages with no trail back to the test it came from.
//
// IT NEVER FILLS IN WHAT IT DOES NOT HAVE. A layer with no evidence for φ′
// offers no φ′, and the panel says which test would supply it. Silently
// leaving the page's existing default in place while announcing "applied from
// BH-01" would be worse than not offering the layer at all, so applied fields
// are listed explicitly and the rest are left untouched.
//
// Read-only: it never writes to the investigation.
// ─────────────────────────────────────────────────────────────────────────

export interface SoilParameterFill {
  /** Effective cohesion c′, kPa. */
  c?: number
  /** Effective friction angle φ′, degrees. */
  phiDeg?: number
  /** Bulk unit weight γ, kN/m³. */
  gamma?: number
  /** Saturated unit weight, kN/m³. */
  gammaSat?: number
  /** Undrained shear strength cu, kPa. */
  cu?: number
}

const PROVENANCE_STYLE: Record<string, string> = {
  measured: 'bg-emerald-100 text-emerald-800',
  derived: 'bg-sky-100 text-sky-800',
  correlated: 'bg-amber-100 text-amber-900',
  assumed: 'bg-violet-100 text-violet-800',
}

/**
 * Decimal places a value's SOURCE supports. A correlation carries several
 * degrees of scatter and is shown whole; a measurement keeps one.
 */
const dpFor = (v: SourcedValue): number =>
  v.unit === '—' || v.unit === '' ? 3 : v.provenance.kind === 'correlated' ? 0 : 1

/**
 * The number to APPLY — rounded exactly as it is displayed.
 *
 * Without this the panel showed "20.0 kPa" and put 20.004999999999995 into the
 * field, which is both ugly and a small lie: the two numbers a user sees should
 * be the same number.
 */
const applyValue = (v: SourcedValue): number =>
  Number(v.value.toFixed(dpFor(v)))

/** Print to the precision the source supports. */
const fmt = (v: SourcedValue): string =>
  v.unit === '—' || v.unit === ''
    ? v.value.toFixed(3)
    : `${v.value.toFixed(dpFor(v))} ${v.unit}`

/** Which of the picker's outputs a caller actually wants. */
export type WantedParameter = keyof SoilParameterFill

export function SoilLayerPicker({
  want, onApply, title = 'Use a layer from a soil investigation',
}: {
  want: WantedParameter[]
  onApply: (fill: SoilParameterFill) => void
  title?: string
}) {
  const store = useMemo(() => createStore(defaultBackend()), [])
  const [open, setOpen] = useState(false)
  const [applied, setApplied] = useState<string | null>(null)

  const investigations = useMemo(() => (open ? store.list() : []), [store, open])
  const [id, setId] = useState<string | null>(null)
  const inv: Investigation | null = useMemo(
    () => (id ? store.load(id) : null), [store, id],
  )

  // Auto-select the only (or most recent) investigation when the panel opens.
  const activeId = id ?? investigations[0]?.id ?? null
  const active = inv ?? (activeId ? store.load(activeId) : null)

  const rows = useMemo(() => {
    if (!active) return []
    const out: { bh: Borehole; layer: SoilLayer; fill: SoilParameterFill; resolved: { key: ParameterKey; value: SourcedValue }[]; missing: WantedParameter[] }[] = []
    for (const bh of active.boreholes) {
      for (const layer of bh.layers) {
        const stored = active.parameters.find((p) => p.layerId === layer.id)
        // Unit weights for the stress profile come from whatever was stored;
        // this component does not invent them.
        const unitWeights: Record<string, LayerUnitWeight> = {}
        for (const l of bh.layers) {
          const sp = active.parameters.find((p) => p.layerId === l.id)
          const g = sp?.unitWeight?.value
          if (g != null) unitWeights[l.id] = { gamma: g, gammaSat: sp?.saturatedUnitWeight?.value }
        }

        const r = resolveParameters({ borehole: bh, layer, unitWeights, stored })
        const get = (k: ParameterKey) => r.resolved.find((p) => p.key === k)?.value

        const pick = (...keys: ParameterKey[]) => {
          for (const k of keys) { const v = get(k); if (v) return applyValue(v) }
          return undefined
        }
        const fill: SoilParameterFill = {
          c: pick('effectiveCohesion', 'cohesion'),
          phiDeg: pick('effectiveFrictionAngle', 'frictionAngle'),
          gamma: pick('unitWeight'),
          gammaSat: pick('saturatedUnitWeight'),
          cu: pick('undrainedShearStrength'),
        }
        const missing = want.filter((w) => fill[w] == null)
        out.push({
          bh, layer, fill, missing,
          resolved: r.resolved.filter((p) => want.some((w) => WANT_KEYS[w].includes(p.key)))
            .map((p) => ({ key: p.key, value: p.value })),
        })
      }
    }
    return out
  }, [active, want])

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setOpen(true)}
          className="rounded-md border border-slate-300 px-2.5 py-1 text-[12px] font-medium text-slate-700 hover:bg-slate-50">
          {title}
        </button>
        {applied && (
          <span className="text-[11px] text-emerald-700">Applied from {applied}.</span>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[13px] font-bold text-[#0056b3]">{title}</h3>
        <button onClick={() => setOpen(false)}
          className="rounded px-1.5 py-0.5 text-[11px] text-slate-600 hover:bg-slate-200">close</button>
      </div>

      {!investigations.length ? (
        <p className="text-[12px] text-slate-600">
          No saved investigations in this browser.{' '}
          <Link to="/soils" className="font-medium text-[#0056b3] underline">Create one</Link> to enter boreholes,
          laboratory tests and parameters once and reuse them here.
        </p>
      ) : (
        <>
          {investigations.length > 1 && (
            <select value={activeId ?? ''} onChange={(e) => setId(e.target.value)}
              className="mb-2 rounded-md border border-slate-300 px-2 py-1 text-[12px]">
              {investigations.map((s) => (
                <option key={s.id} value={s.id}>{s.investigationNo || s.title}</option>
              ))}
            </select>
          )}

          {!rows.length && (
            <p className="text-[12px] text-slate-600">That investigation has no logged layers yet.</p>
          )}

          <div className="space-y-2">
            {rows.map(({ bh, layer, fill, resolved, missing }) => (
              <div key={`${bh.id}-${layer.id}`} className="rounded-lg border border-slate-200 bg-white p-2.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-[12px] font-semibold text-slate-800">
                    {bh.name} · {layer.name}
                    <span className="ml-1.5 font-mono text-[10px] font-normal text-slate-500">
                      {layer.depthTop.toFixed(2)}–{layer.depthBottom.toFixed(2)} m
                      {layer.symbol ? ` · ${layer.symbol}` : ''}
                      {` · ${layerThickness(layer).toFixed(2)} m thick`}
                    </span>
                  </span>
                  <button
                    disabled={!resolved.length}
                    onClick={() => { onApply(fill); setApplied(`${bh.name} · ${layer.name}`); setOpen(false) }}
                    className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                      resolved.length
                        ? 'bg-[#0056b3] text-white hover:bg-[#004a99]'
                        : 'cursor-not-allowed bg-slate-200 text-slate-500'
                    }`}>
                    {resolved.length ? 'Use this layer' : 'nothing to apply'}
                  </button>
                </div>

                {resolved.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5">
                    {resolved.map((p) => (
                      <li key={p.key} className="flex flex-wrap items-baseline gap-1.5 text-[11px]">
                        <span className="text-slate-600">{PARAMETER_LABEL[p.key]}</span>
                        <span className="font-mono font-semibold text-slate-800">{fmt(p.value)}</span>
                        <span className={`rounded px-1 text-[9px] font-semibold ${PROVENANCE_STYLE[p.value.provenance.kind]}`}>
                          {PROVENANCE_LABEL[p.value.provenance.kind]}
                        </span>
                        <span className="text-[10px] text-slate-500">{describeProvenance(p.value.provenance)}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {missing.length > 0 && (
                  <p className="mt-1 text-[10px] text-amber-800">
                    Not available for this layer: {missing.join(', ')}. Those fields are left as you have them —
                    nothing is filled in that the investigation cannot support.
                  </p>
                )}
              </div>
            ))}
          </div>
        </>
      )}

    </div>
  )
}

/** Which resolved parameters back each requested field. */
const WANT_KEYS: Record<WantedParameter, ParameterKey[]> = {
  c: ['effectiveCohesion', 'cohesion'],
  phiDeg: ['effectiveFrictionAngle', 'frictionAngle'],
  gamma: ['unitWeight'],
  gammaSat: ['saturatedUnitWeight'],
  cu: ['undrainedShearStrength'],
}
