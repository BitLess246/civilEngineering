import { useState, type ReactNode } from 'react'

// ─────────────────────────────────────────────────────────────────────────
// Input guides for the seismic (NSCP 208) and wind (NSCP 207) load cards —
// the code tables and formulas a user needs to pick Ca, Cv, R, I, Z, Nv and
// V, Kzt, exposure, shown in a popup next to the input.
// ─────────────────────────────────────────────────────────────────────────

/** A small "ⓘ Guide" button that opens a modal with reference content. */
export function HintButton({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="no-print inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-0.5 text-xs font-semibold text-[#0056b3] hover:border-[#0056b3] hover:bg-blue-50"
        title={title}>
        ⓘ Guide
      </button>
      {open && (
        <div className="no-print fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4"
          onClick={() => setOpen(false)}>
          <div className="my-8 w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h3 className="text-[1.02rem] font-bold text-[#0056b3]">{title}</h3>
              <button type="button" onClick={() => setOpen(false)}
                className="rounded-md px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100">✕</button>
            </div>
            <div className="max-h-[75vh] space-y-4 overflow-y-auto px-4 py-4 text-xs text-slate-700">
              {children}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const Th = ({ children }: { children: ReactNode }) => (
  <th className="border border-slate-200 bg-slate-50 px-2 py-1 text-left font-semibold">{children}</th>
)
const Td = ({ children }: { children: ReactNode }) => (
  <td className="border border-slate-200 px-2 py-1">{children}</td>
)
const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <div>
    <h4 className="mb-1 font-bold text-slate-800">{title}</h4>
    {children}
  </div>
)

export function SeismicHint(): ReactNode {
  return (
    <>
      <p>
        Static base shear (NSCP 208.5.2): <b>V = Cv·I·W / (R·T)</b>, bounded by
        2.5Ca·I·W/R (max), 0.11Ca·I·W (min), and in Zone 4 also 0.8·Z·Nv·I·W/R.
        Period <b>T = Ct·hₙ^¾</b>, Ct = 0.0731 for RC moment frames.
      </p>

      <Section title="Seismic zone factor Z (Table 208-3)">
        <table className="w-full border-collapse">
          <tbody>
            <tr><Td>Zone 2 (Palawan, Sulu, Tawi-Tawi)</Td><Td><b>Z = 0.20</b></Td></tr>
            <tr><Td>Zone 4 (rest of the Philippines)</Td><Td><b>Z = 0.40</b></Td></tr>
          </tbody>
        </table>
      </Section>

      <Section title="Soil profile type (Table 208-2)">
        <table className="w-full border-collapse">
          <tbody>
            <tr><Td>SA</Td><Td>Hard rock (vs &gt; 1500 m/s)</Td></tr>
            <tr><Td>SB</Td><Td>Rock (760–1500 m/s)</Td></tr>
            <tr><Td>SC</Td><Td>Very dense soil / soft rock (360–760)</Td></tr>
            <tr><Td>SD</Td><Td>Stiff soil (180–360) — default if unknown</Td></tr>
            <tr><Td>SE</Td><Td>Soft soil (&lt; 180 m/s)</Td></tr>
          </tbody>
        </table>
      </Section>

      <Section title="Ca — seismic coefficient (Table 208-7)">
        <table className="w-full border-collapse">
          <thead><tr><Th>Soil</Th><Th>Zone 2 (0.20)</Th><Th>Zone 4 (0.40)</Th></tr></thead>
          <tbody>
            <tr><Td>SA</Td><Td>0.12</Td><Td>0.32 Na</Td></tr>
            <tr><Td>SB</Td><Td>0.15</Td><Td>0.40 Na</Td></tr>
            <tr><Td>SC</Td><Td>0.18</Td><Td>0.40 Na</Td></tr>
            <tr><Td>SD</Td><Td>0.22</Td><Td>0.44 Na</Td></tr>
            <tr><Td>SE</Td><Td>0.30</Td><Td>0.44 Na</Td></tr>
          </tbody>
        </table>
      </Section>

      <Section title="Cv — seismic coefficient (Table 208-8)">
        <table className="w-full border-collapse">
          <thead><tr><Th>Soil</Th><Th>Zone 2 (0.20)</Th><Th>Zone 4 (0.40)</Th></tr></thead>
          <tbody>
            <tr><Td>SA</Td><Td>0.12</Td><Td>0.32 Nv</Td></tr>
            <tr><Td>SB</Td><Td>0.15</Td><Td>0.40 Nv</Td></tr>
            <tr><Td>SC</Td><Td>0.25</Td><Td>0.56 Nv</Td></tr>
            <tr><Td>SD</Td><Td>0.32</Td><Td>0.64 Nv</Td></tr>
            <tr><Td>SE</Td><Td>0.50</Td><Td>0.96 Nv</Td></tr>
          </tbody>
        </table>
      </Section>

      <Section title="Near-source factors Na, Nv — Zone 4 only (Tables 208-4, 208-5)">
        <table className="w-full border-collapse">
          <thead><tr><Th>Source</Th><Th>≤ 2 km</Th><Th>5 km</Th><Th>10 km</Th><Th>≥ 15 km</Th></tr></thead>
          <tbody>
            <tr><Td>Na (A / B / C)</Td><Td>1.5 / 1.3 / 1.0</Td><Td>1.2 / 1.0 / 1.0</Td><Td>1.0 / 1.0 / 1.0</Td><Td>1.0</Td></tr>
            <tr><Td>Nv (A / B / C)</Td><Td>2.0 / 1.6 / 1.0</Td><Td>1.6 / 1.2 / 1.0</Td><Td>1.2 / 1.0 / 1.0</Td><Td>1.0</Td></tr>
          </tbody>
        </table>
        <p className="mt-1 text-slate-500">Source A: M ≥ 7.0, high slip rate. B: most faults. C: M &lt; 6.5, low rate. Outside Zone 4, Na = Nv = 1.0.</p>
      </Section>

      <Section title="R — response modification (Table 208-11)">
        <table className="w-full border-collapse">
          <tbody>
            <tr><Td>Special RC moment frame (SMRF)</Td><Td><b>8.5</b></Td></tr>
            <tr><Td>Intermediate RC moment frame (IMRF)</Td><Td>5.5</Td></tr>
            <tr><Td>Dual: SMRF + special RC shear wall</Td><Td>8.5</Td></tr>
            <tr><Td>Building frame + special RC shear wall</Td><Td>5.5</Td></tr>
            <tr><Td>Bearing wall + special RC shear wall</Td><Td>4.5</Td></tr>
          </tbody>
        </table>
        <p className="mt-1 text-slate-500">IMRF and OMRF are not permitted as the SFRS in Zone 4.</p>
      </Section>

      <Section title="Importance factor I (Table 103-1 / 208-1)">
        <table className="w-full border-collapse">
          <tbody>
            <tr><Td>Essential (hospitals, fire/police, emergency)</Td><Td><b>1.50</b></Td></tr>
            <tr><Td>Hazardous facilities</Td><Td>1.25</Td></tr>
            <tr><Td>Special occupancy (assembly &gt; 300, schools)</Td><Td>1.00</Td></tr>
            <tr><Td>Standard occupancy (typical buildings)</Td><Td>1.00</Td></tr>
          </tbody>
        </table>
      </Section>
    </>
  )
}

export function WindHint(): ReactNode {
  return (
    <>
      <p>
        Directional procedure (NSCP 207B): velocity pressure <b>qz = 0.613·Kz·Kzt·Kd·V²</b> (N/m², V in m/s),
        design pressure <b>p = q·G·Cp − qi·(GCpi)</b>. Windward Cp = +0.8, leeward −0.5…−0.2 by L/B.
      </p>

      <Section title="V — basic wind speed (Figure 207A.5-1)">
        <p>
          3-second gust at 10 m, Exposure C, read from the wind-zone map for the building's occupancy/importance
          (three maps: MRI 1700 / 700 / 300 yr). Convert kph → m/s by ÷ 3.6.
        </p>
        <table className="mt-1 w-full border-collapse">
          <thead><tr><Th>Region (typical)</Th><Th>V (kph)</Th><Th>V (m/s)</Th></tr></thead>
          <tbody>
            <tr><Td>Metro Manila / Central Luzon</Td><Td>≈ 270</Td><Td>≈ 75</Td></tr>
            <tr><Td>Eastern seaboard (Bicol, Samar)</Td><Td>≈ 300–320</Td><Td>≈ 83–89</Td></tr>
            <tr><Td>Western Visayas / Mindanao interior</Td><Td>≈ 200–250</Td><Td>≈ 56–69</Td></tr>
          </tbody>
        </table>
        <p className="mt-1 text-slate-500">Use the actual contour value from Fig 207A.5-1 for the site — these are indicative only.</p>
      </Section>

      <Section title="Exposure category (§207A.7)">
        <table className="w-full border-collapse">
          <tbody>
            <tr><Td>B</Td><Td>Urban / suburban / wooded — closely spaced obstructions</Td></tr>
            <tr><Td>C</Td><Td>Open terrain, scattered obstructions &lt; 9 m (default)</Td></tr>
            <tr><Td>D</Td><Td>Flat unobstructed — mud flats, open water, coastal &lt; 1.5 km from shore</Td></tr>
          </tbody>
        </table>
      </Section>

      <Section title="Other factors">
        <table className="w-full border-collapse">
          <tbody>
            <tr><Td>Kzt — topographic (§207A.8)</Td><Td><b>1.0</b> on level ground; &gt; 1 on hills, ridges, escarpments</Td></tr>
            <tr><Td>Kd — directionality (Table 207A.6-1)</Td><Td>0.85 for buildings (MWFRS) — applied internally</Td></tr>
            <tr><Td>G — gust effect (§207A.9)</Td><Td>0.85 for rigid structures — applied internally</Td></tr>
            <tr><Td>GCpi — internal pressure (Table 207A.11-1)</Td><Td>±0.18 enclosed (cancels for the net lateral force)</Td></tr>
          </tbody>
        </table>
      </Section>

      <Section title="Kz — velocity-pressure exposure coefficient (Table 207B.3-1)">
        <table className="w-full border-collapse">
          <thead><tr><Th>z (m)</Th><Th>B</Th><Th>C</Th><Th>D</Th></tr></thead>
          <tbody>
            <tr><Td>0–4.5</Td><Td>0.57</Td><Td>0.85</Td><Td>1.03</Td></tr>
            <tr><Td>9</Td><Td>0.70</Td><Td>0.98</Td><Td>1.16</Td></tr>
            <tr><Td>15</Td><Td>0.81</Td><Td>1.09</Td><Td>1.27</Td></tr>
            <tr><Td>30</Td><Td>0.99</Td><Td>1.26</Td><Td>1.43</Td></tr>
          </tbody>
        </table>
        <p className="mt-1 text-slate-500">Computed automatically from Kz = 2.01(z/zg)^(2/α) per storey.</p>
      </Section>
    </>
  )
}
