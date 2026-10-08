import { useState } from 'react'
import { sphericalFromSides, sphericalFromSas, withRadius } from '../engine/sphericalTriangle'
import { Num, Pick } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { SphericalTriangleSketch } from '../components/mathSketches'
import type { SolutionStep } from '../lib/solution'
import { f2, f3 } from '../lib/influenceStyle'

// Spherical Triangle — the triangle of geodesy and surveying: three
// great-circle arcs on a sphere. Sides are stated in DEGREES of arc; the
// angles no longer sum to 180°, and the surplus — the spherical excess —
// measures the triangle's area through Girard's theorem.

type Mode = 'SSS' | 'SAS'

export default function SphericalTriangle() {
  const [mode, setMode] = useState<Mode>('SSS')
  const [a, setA] = useState(60)
  const [b, setB] = useState(60)
  const [c, setC] = useState(60)
  const [Cang, setCang] = useState(90)
  const [R, setR] = useState(6371)

  let t: ReturnType<typeof sphericalFromSides> | null = null
  let err = ''
  try {
    t = mode === 'SSS'
      ? sphericalFromSides({ a, b, c })
      : sphericalFromSas({ a, b, C: Cang })
  } catch (e) { err = (e as Error).message }
  // rw carries the radius-scaled values; null when the radius itself is refused.
  const rw: ReturnType<typeof withRadius> | null = t ? (() => {
    try { return withRadius(t, R) } catch { return null }
  })() : null
  const rwErr = t && !rw ? 'The sphere radius must be a positive number.' : ''
  const errAll = [err, rwErr].filter(Boolean).join(' · ')

  const steps: SolutionStep[] = t && rw ? [
    ...(mode === 'SAS' ? [{
      title: 'Third side from the included angle',
      lines: [
        { tex: `\\cos c = \\cos a\\,\\cos b + \\sin a\\,\\sin b\\,\\cos C` },
        { tex: `\\cos c = \\cos ${f2(a)}^{\\circ}\\cos ${f2(b)}^{\\circ} + \\sin ${f2(a)}^{\\circ}\\sin ${f2(b)}^{\\circ}\\cos ${f2(Cang)}^{\\circ} = ${f3(Math.cos((t.c * Math.PI) / 180))}` },
        { tex: `c = ${f3(t.c)}^{\\circ}` },
        { text: 'The included angle C sits between sides a and b, so the sides form of the cosine rule hands over c directly.' },
      ],
    }] : []),
    {
      title: 'Angles from the spherical law of cosines',
      lines: [
        { tex: `\\cos A = \\frac{\\cos a - \\cos b\\cos c}{\\sin b\\,\\sin c} = ${f3(Math.cos((t.A * Math.PI) / 180))} \\;\\Rightarrow\\; A = ${f3(t.A)}^{\\circ}` },
        { tex: `\\cos B = \\frac{\\cos b - \\cos a\\cos c}{\\sin a\\,\\sin c} = ${f3(Math.cos((t.B * Math.PI) / 180))} \\;\\Rightarrow\\; B = ${f3(t.B)}^{\\circ}` },
        { tex: `\\cos C = \\frac{\\cos c - \\cos a\\cos b}{\\sin a\\,\\sin b} = ${f3(Math.cos((t.C * Math.PI) / 180))} \\;\\Rightarrow\\; C = ${f3(t.C)}^{\\circ}` },
        { text: 'Each angle is read with arccos — the cosine rule pins it uniquely, so there is no sine-rule ambiguity case to argue about.' },
      ],
    },
    {
      title: 'Spherical excess',
      lines: [
        { tex: `E = A + B + C - 180^{\\circ} = ${f2(t.A)}^{\\circ} + ${f2(t.B)}^{\\circ} + ${f2(t.C)}^{\\circ} - 180^{\\circ} = ${f3(t.E)}^{\\circ}` },
        { text: 'On a sphere the angles always overrun 180° — the flatter the triangle (small sides), the closer E sits to zero; a hemisphere-spanning triangle approaches E = 180°.' },
      ],
    },
    {
      title: 'Area by Girard\'s theorem',
      lines: [
        { tex: `\\Delta = R^{2}\\,E_{\\text{rad}} = R^{2}\\cdot E\\cdot\\frac{\\pi}{180} = ${f3(R)}^{2}\\times ${f3((t.E * Math.PI) / 180)} = ${f3(rw.area)}` },
        { text: `With E in radians the area is E steradians of the unit sphere, scaled by R². On the unit sphere (R = 1) the excess IS the area; here the sphere carries radius ${f3(R)} and the triangle covers ${f3(rw.area)} square units — arcs a, b, c measure ${f3(rw.arcA)}, ${f3(rw.arcB)}, ${f3(rw.arcC)} along the surface.` },
      ],
    },
  ] : [{ title: 'Check the inputs', lines: [{ text: errAll || 'Check the inputs.' }] }]

  return (
    <WorkspacePage title="Spherical Triangle" badges={['Mathematics', 'Spherical trigonometry']}
      intro="Three great-circle arcs make a triangle on a sphere — the figure a geodetic survey, a celestial fix or a long runway alignment actually lives on. Give the three sides (degrees of arc), or two sides and their included angle; the calculator returns all three angles, the spherical excess, and the area through Girard's theorem once a radius is set."
      inputs={<>
        <InputGroup title="Solve from">
          <div className="col-span-2">
            <Pick label="Given" value={mode} onChange={(v) => setMode(v as Mode)}
              options={[['SSS', 'Three sides a, b, c'], ['SAS', 'Two sides + included angle (a, C, b)']]} />
          </div>
        </InputGroup>
        <InputGroup title="Sides" hint="Great-circle arcs in DEGREES — the central angle each arc subtends.">
          <Num label="Side a" unit="°" value={a} onChange={setA} min={0.0001} max={179.9999} step="5" />
          <Num label="Side b" unit="°" value={b} onChange={setB} min={0.0001} max={179.9999} step="5" />
          {mode === 'SSS'
            ? <Num label="Side c" unit="°" value={c} onChange={setC} min={0.0001} max={179.9999} step="5" />
            : <Num label="Included angle C" unit="°" value={Cang} onChange={setCang} min={0.0001} max={179.9999} step="5" />}
        </InputGroup>
        <InputGroup title="Sphere" hint="Earth's mean radius by default; 1 gives the unit sphere.">
          <Num label="Radius R" unit="km" value={R} onChange={setR} min={0.0001} step="100" />
        </InputGroup>
      </>}
      checks={t && rw ? <>
        <CheckCard title="Angles of the triangle" basis="spherical law of cosines" status="info"
          value={`${f2(t.A)}°`} unit="A" formula="cos A = (cos a − cos b cos c)/(sin b sin c)"
          pairs={[{ label: 'B', value: `${f2(t.B)}°` }, { label: 'C', value: `${f2(t.C)}°` }]} />
        <CheckCard title="Spherical excess" basis="A + B + C − 180°" status="info"
          value={f3(t.E)} unit="°" formula="Δ = R² · E (E in radians)"
          pairs={[{ label: 'Area', value: `${f3(rw.area)} km²` }, { label: 'Sum of angles', value: `${f3(t.A + t.B + t.C)}°` }]} />
      </> : (
        <CheckCard title="No triangle" basis="the sides are refused" status="warn" pillLabel="CHECK"
          value="—" formula={errAll || 'Check the sides.'} />
      )}
      summary={[
        { label: 'Given', value: mode === 'SSS' ? `a ${f2(a)}°, b ${f2(b)}°, c ${f2(c)}°` : `a ${f2(a)}°, b ${f2(b)}°, C ${f2(Cang)}°` },
        { label: 'Sphere radius R', value: `${f3(R)} km` },
        ...(t ? [
          { label: 'Angle A', value: `${f2(t.A)}°` }, { label: 'Angle B', value: `${f2(t.B)}°` }, { label: 'Angle C', value: `${f2(t.C)}°` },
        ] : []),
      ]}
      drawing={t ? { title: 'The triangle on the sphere', node: (
        <SphericalTriangleSketch a={t.a} b={t.b} c={t.c} A={t.A} B={t.B} C={t.C} />
      ) } : undefined}
      results={t && rw ? [
        { check: 'Angle A', basis: 'opposite side a', demand: `${f3(t.A)}°`, status: 'info' },
        { check: 'Angle B', basis: 'opposite side b', demand: `${f3(t.B)}°`, status: 'info' },
        { check: 'Angle C', basis: mode === 'SAS' ? 'given (included)' : 'opposite side c', demand: `${f3(t.C)}°`, status: 'info' },
        { check: 'Excess E', basis: 'A + B + C − 180°', demand: `${f3(t.E)}°`, status: 'info' },
        { check: 'Arc a on the surface', basis: `πR·a/180, R = ${f3(R)} km`, demand: `${f3(rw.arcA)} km`, status: 'info' },
        { check: 'Area Δ', basis: 'Girard: R² · E_rad', demand: `${f3(rw.area)} km²`, status: 'info' },
      ] : [{ check: 'Inputs', basis: 'sides strictly inside (0°, 180°); perimeter < 360°', demand: '—', status: 'warn' }]}
      steps={steps}
      references={[
        { topic: 'Spherical law of cosines', basis: 'cos a = cos b·cos c + sin b·sin c·cos A; rearranged for the angle: cos A = (cos a − cos b cos c)/(sin b sin c)', source: 'Spherical trigonometry' },
        { topic: 'Spherical excess', basis: 'E = A + B + C − 180° > 0 on a sphere; sides must satisfy |a − b| < c < a + b and a + b + c < 360°', source: 'Spherical trigonometry' },
        { topic: "Girard's theorem", basis: 'Δ = R²·E with E in radians — the excess measures the area in steradians of the unit sphere', source: 'Spherical trigonometry' },
      ]}
    />
  )
}
