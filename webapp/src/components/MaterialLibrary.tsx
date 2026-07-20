import { useRef, useState } from 'react'
import { validateWoodRef, WOOD_SPECIES, speciesList, gradesOf, type WoodKind, type WoodRefValues } from '../engine/woodDesign'
import {
  materialsToCsv, csvToMaterials, slugId, upsertMaterial, deleteMaterial, type CustomMaterial,
} from '../lib/materialLibrary'

const REF_FIELDS: { k: keyof WoodRefValues; label: string; unit: string }[] = [
  { k: 'Fb', label: 'Fb bending', unit: 'MPa' }, { k: 'Ft', label: 'Ft tension', unit: 'MPa' },
  { k: 'Fv', label: 'Fv shear', unit: 'MPa' }, { k: 'FcPerp', label: 'Fc⊥ bearing', unit: 'MPa' },
  { k: 'Fc', label: 'Fc∥ compr.', unit: 'MPa' }, { k: 'E', label: 'E', unit: 'MPa' },
  { k: 'Emin', label: 'Emin (stability)', unit: 'MPa' }, { k: 'G', label: 'G (sp. gravity)', unit: '' },
]
const DEFAULT_REF = (): WoodRefValues => ({ ...WOOD_SPECIES['DFL-2'].ref })

/** User-defined timber material library: select a custom material, or create /
 *  copy / edit / delete one, with CSV import-export. Values validated before
 *  save so an unusable material can't reach the solver. */
export function MaterialLibrary({ materials, selectedId, onSelect, onChange }: {
  materials: CustomMaterial[]
  selectedId: string
  /** Selection changed. `material` is the resolved entry (undefined = none) so
   *  the parent never has to look it up from its own (possibly stale) state. */
  onSelect: (id: string, material?: CustomMaterial) => void
  onChange: (list: CustomMaterial[]) => void
}) {
  const [draft, setDraft] = useState<CustomMaterial | null>(null)
  const [importErr, setImportErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const errors = draft ? validateWoodRef(draft.ref) : []

  const startNew = () => { setImportErr(''); setDraft({ id: '', name: '', kind: 'sawn', ref: DEFAULT_REF() }) }
  const startEdit = () => { const m = materials.find((x) => x.id === selectedId); if (m) { setImportErr(''); setDraft({ ...m, ref: { ...m.ref } }) } }
  const save = () => {
    if (!draft || errors.length || !draft.name.trim()) return
    const id = draft.id || slugId(draft.name, materials.map((m) => m.id))
    const m = { ...draft, id }
    onChange(upsertMaterial(materials, m))
    onSelect(id, m); setDraft(null)               // pass the fresh material
  }
  const del = () => { if (selectedId) { onChange(deleteMaterial(materials, selectedId)); onSelect('') } }
  const exportCsv = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([materialsToCsv(materials)], { type: 'text/csv' }))
    a.download = 'timber-materials.csv'; a.click(); URL.revokeObjectURL(a.href)
  }
  const importCsv = (file: File) => {
    setImportErr('')
    file.text().then((t) => {
      const { materials: imp, errors: errs } = csvToMaterials(t, materials.map((m) => m.id))
      if (imp.length) { onChange([...materials, ...imp]); onSelect(imp[0].id, imp[0]) }
      if (errs.length) setImportErr(errs.join(' · '))
    })
  }
  const btn = 'rounded-md border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50'

  return (
    <div className="col-span-full">
      <div className="flex flex-wrap items-center gap-2">
        <select value={selectedId} onChange={(e) => onSelect(e.target.value, materials.find((m) => m.id === e.target.value))}
          className="min-w-[10rem] flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm">
          <option value="">— select a custom material —</option>
          {materials.map((m) => <option key={m.id} value={m.id}>{m.name}{m.kind === 'glulam' ? ' (GL)' : ''}</option>)}
        </select>
        <button type="button" className={btn} onClick={startNew}>＋ New</button>
        <button type="button" className={btn} onClick={startEdit} disabled={!selectedId}>Edit</button>
        <button type="button" className={btn} onClick={del} disabled={!selectedId}>Delete</button>
        <button type="button" className={btn} onClick={exportCsv} disabled={!materials.length}>Export CSV</button>
        <button type="button" className={btn} onClick={() => fileRef.current?.click()}>Import CSV</button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) importCsv(f); e.target.value = '' }} />
      </div>
      {importErr && <p className="mt-1 text-[11px] text-red-600">{importErr}</p>}

      {draft && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label className="col-span-2 flex flex-col text-[11px] sm:col-span-2">
              <span className="mb-0.5 font-medium text-slate-600">Name</span>
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className="rounded-md border border-slate-300 px-2 py-1" placeholder="e.g. Apitong (80% grade)" />
            </label>
            <label className="flex flex-col text-[11px]">
              <span className="mb-0.5 font-medium text-slate-600">Kind</span>
              <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as WoodKind })}
                className="rounded-md border border-slate-300 px-2 py-1">
                <option value="sawn">Sawn</option><option value="glulam">Glulam</option>
              </select>
            </label>
            <label className="flex flex-col text-[11px]">
              <span className="mb-0.5 font-medium text-slate-600">Seed from</span>
              <select value="" onChange={(e) => { const g = e.target.value; if (g) setDraft({ ...draft, ref: { ...WOOD_SPECIES[g].ref }, kind: WOOD_SPECIES[g].kind }) }}
                className="rounded-md border border-slate-300 px-2 py-1">
                <option value="">library…</option>
                {speciesList().flatMap((sp) => gradesOf(sp.species).map((gr) => <option key={gr.id} value={gr.id}>{gr.label}</option>))}
              </select>
            </label>
            {REF_FIELDS.map(({ k, label, unit }) => (
              <label key={k} className="flex flex-col text-[11px]">
                <span className="mb-0.5 font-medium text-slate-600">{label}{unit ? ` (${unit})` : ''}</span>
                <input type="number" step="any" value={draft.ref[k]}
                  onChange={(e) => setDraft({ ...draft, ref: { ...draft.ref, [k]: parseFloat(e.target.value) } })}
                  className="rounded-md border border-slate-300 px-2 py-1" />
              </label>
            ))}
            <label className="col-span-2 flex flex-col text-[11px] sm:col-span-4">
              <span className="mb-0.5 font-medium text-slate-600">Note / source (optional)</span>
              <input value={draft.note ?? ''} onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                className="rounded-md border border-slate-300 px-2 py-1" placeholder="e.g. FPRDI Technical Note, air-dry" />
            </label>
          </div>
          {errors.length > 0 && <p className="mt-2 text-[11px] text-red-600">{errors.join(' · ')}</p>}
          <p className="mt-2 text-[10px] text-amber-600">User-defined values are unverified — you are responsible for their source and validity.</p>
          <div className="mt-2 flex gap-2">
            <button type="button" className="rounded-md bg-[#0056b3] px-3 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
              onClick={save} disabled={errors.length > 0 || !draft.name.trim()}>Save</button>
            <button type="button" className={btn} onClick={() => setDraft(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
