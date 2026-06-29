import { Link } from 'react-router-dom'

type DocSection = {
  title: string
  body: string
  items: string[]
}

const toolGroups: DocSection[] = [
  {
    title: 'Structural design',
    body: 'Interactive calculators for reinforced concrete, steel checks, and frame-level analysis workflows.',
    items: [
      'Foundation, pile-cap, combined-footing, beam, column, slab, and truss design pages.',
      '2D frame, 3D model space, slab load path, time-history, shell, and pushover analysis tools.',
      'Worked solutions, schedules, diagrams, take-off quantities, and printable reports where supported.',
    ],
  },
  {
    title: 'Quantity take-off',
    body: 'Estimator pages for common site quantities, with inputs kept close to the measurements used on drawings.',
    items: [
      'Slab, beam, column, CHB wall, and box-culvert material estimators.',
      'Concrete, reinforcement, formwork, block, mortar, and related construction quantities.',
      'Excel-oriented batch workflows on supported design pages.',
    ],
  },
  {
    title: 'Model space',
    body: 'The 3D model workspace combines structural modeling, loading, analysis, design, optimization, and reporting.',
    items: [
      'Nodes, members, supports, plates, walls, slabs, load cases, and NSCP load combinations.',
      'Frame and shell analysis paths with contours, diagrams, member schedules, and design checks.',
      'Costed bill of materials, section optimization, and export-friendly report views.',
    ],
  },
]

const standards = [
  'NSCP 2015 load combinations and lateral-load workflows',
  'ACI 318-14 reinforced-concrete strength design references',
  'AISC 360 steel member checks and section properties',
  'Consistent engineering units: geometry in m, sections in mm, forces in kN, stresses in MPa',
]

const workflows = [
  ['Choose the tool', 'Start from the home page and open the design, analysis, model, or estimate page that matches the task.'],
  ['Enter geometry and loads', 'Use the input panels for dimensions, material strengths, load cases, and support conditions.'],
  ['Review calculations', 'Read the governing checks, diagrams, schedules, utilization values, and worked solution cards.'],
  ['Print or export', 'Use the report controls on supported pages to prepare a clean printable or PDF-ready output.'],
]

function SectionCard({ section }: { section: DocSection }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-slate-900">{section.title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{section.body}</p>
      <ul className="mt-4 space-y-2 text-sm text-slate-700">
        {section.items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#0056b3]" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default function Documentation() {
  return (
    <main className="mx-auto max-w-6xl px-5 py-6 sm:px-8">
      <Link to="/" className="no-print text-sm font-medium text-[#0056b3] hover:underline">Back to home</Link>

      <header className="mt-4 border-b border-slate-200 pb-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Documentation</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-[#0056b3] sm:text-4xl">
          Civil Engineering Toolkit
        </h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
          A practical guide to the app's design tools, analysis workflows, quantity estimators,
          reporting outputs, and engineering assumptions.
        </p>
      </header>

      <div className="mt-8 grid gap-5 lg:grid-cols-3">
        {toolGroups.map((section) => <SectionCard key={section.title} section={section} />)}
      </div>

      <section className="mt-8 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Typical workflow</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Most pages follow the same rhythm: define the model, inspect the computed result,
              then generate a report-ready view.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {workflows.map(([title, body], index) => (
              <article key={title} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-[#0056b3]">Step {index + 1}</div>
                <h3 className="mt-1 font-semibold text-slate-900">{title}</h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-5 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">Engineering basis</h2>
          <ul className="mt-4 space-y-2 text-sm text-slate-700">
            {standards.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#0056b3]" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">Local development</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            The React app lives in <code className="rounded bg-slate-100 px-1.5 py-0.5">webapp/</code>.
            The production build is emitted to <code className="rounded bg-slate-100 px-1.5 py-0.5">public/app</code>
            and served by the Express backend at the site root.
          </p>
          <div className="mt-4 overflow-x-auto rounded-lg bg-slate-950 p-4 text-sm text-slate-100">
            <pre>{`cd webapp
npm run dev
npm test
npm run build`}</pre>
          </div>
        </div>
      </section>

      <section className="mt-8 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">Quick links</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link to="/model" className="rounded-lg bg-[#0056b3] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#003f86]">
            Open model space
          </Link>
          <Link to="/foundation" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-[#0056b3] hover:border-[#0056b3] hover:bg-blue-50">
            Foundation design
          </Link>
          <Link to="/beam-design" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-[#0056b3] hover:border-[#0056b3] hover:bg-blue-50">
            Beam design
          </Link>
          <Link to="/truss" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-[#0056b3] hover:border-[#0056b3] hover:bg-blue-50">
            Truss space
          </Link>
        </div>
      </section>
    </main>
  )
}
