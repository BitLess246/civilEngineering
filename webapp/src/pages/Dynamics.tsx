import { useState } from "react";
import { WorkedSolution } from "../components/WorkedSolution";
import type { SolutionStep } from "../lib/solution";
import {
  kinematicsRectilinear,
  projectile,
  kinetics,
  workEnergy,
  impulseMomentum,
  curvilinear,
} from "../engine/dynamics";

// Local numeric input to avoid type issues with shared Num component
function NumInput({ label, unit, value, onChange, step, min, max }: {
  label: React.ReactNode; unit?: string; value: number; onChange: (v: number) => void;
  step?: number; min?: number; max?: number;
}) {
  return (
    <label className="flex flex-col text-sm">
      <span className="mb-1 text-[11.5px] font-semibold text-muted">{label}</span>
      <span className="flex overflow-hidden rounded-md border border-field-line bg-field focus-within:border-brand focus-within:shadow-[0_0_0_3px_rgba(15,76,146,.14)]">
        <input type="number" inputMode="decimal" step={step?.toString() ?? 'any'} min={min} max={max}
          value={Number.isFinite(value) ? value : ''}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="min-w-0 flex-1 !rounded-none !border-0 !bg-transparent text-[13px] !shadow-none" />
        {unit && <span className="flex items-center border-l border-hairline-2 bg-sheet-2 px-2.5 font-mono text-[10.5px] text-faint">{unit}</span>}
      </span>
    </label>
  );
}

type Tab = "rectilinear" | "projectile" | "curvilinear" | "kinetics" | "workEnergy" | "impulseMomentum";

const f3 = (n: number) => n.toFixed(3);
const f2 = (n: number) => n.toFixed(2);

export default function Dynamics() {
  const [tab, setTab] = useState<Tab>("rectilinear");

  // Rectilinear
  const [u, setU] = useState(10);
  const [a, setA] = useState(2);
  const [tRect, setTRect] = useState(5);
  const [vRect, setVRect] = useState(NaN);
  const [sRect, setSRect] = useState(NaN);

  // Projectile
  const [uProj, setUProj] = useState(20);
  const [theta, setTheta] = useState(45);
  const [y0, setY0] = useState(0);
  const [gProj, setGProj] = useState(9.81);

  // Curvilinear
  const [vCurv, setVCurv] = useState(10);
  const [rho, setRho] = useState(25);
  const [at, setAt] = useState(0);

  // Kinetics
  const [mKin, setMKin] = useState(5);
  const [Fx, setFx] = useState(20);
  const [Fy, setFy] = useState(0);
  const [Fz, setFz] = useState(0);
  const [v0x, setV0x] = useState(0);
  const [v0y, setV0y] = useState(0);
  const [v0z, setV0z] = useState(0);
  const [tKin, setTKin] = useState(3);

  // Work-Energy
  const [mWE, setMWE] = useState(2);
  const [v1WE, setV1WE] = useState(3);
  const [v2WE, setV2WE] = useState(7);
  const [Wnet, setWnet] = useState(NaN);
  const [Wnc, setWnc] = useState(0);
  const [dPE, setDPE] = useState(0);

  // Impulse-Momentum
  const [mIM, setMIM] = useState(4);
  const [v1IM, setV1IM] = useState(2);
  const [v2IM, setV2IM] = useState(10);
  const [I_IM, setI_IM] = useState(NaN);
  const [Favg, setFavg] = useState(NaN);
  const [tIM, setTIM] = useState(NaN);

  // Compute functions
  const computeRectilinear = () => {
    const input: Parameters<typeof kinematicsRectilinear>[0] = { u, a };
    if (Number.isFinite(tRect)) input.t = tRect;
    if (Number.isFinite(vRect)) input.v = vRect;
    if (Number.isFinite(sRect)) input.s = sRect;
    return kinematicsRectilinear(input);
  };

  const computeProjectile = () => {
    return projectile({ u: uProj, thetaDeg: theta, y0, g: gProj });
  };

  const computeCurvilinear = () => {
    return curvilinear({ v: vCurv, rho, at });
  };

  const computeKinetics = () => {
    return kinetics({
      m: mKin,
      forces: { Fx, Fy, Fz },
      v0: { vx: v0x, vy: v0y, vz: v0z },
      t: tKin,
    });
  };

  const computeWorkEnergy = () => {
    const input: Parameters<typeof workEnergy>[0] = { m: mWE, v1: v1WE, Wnc, deltaPE: dPE };
    if (Number.isFinite(v2WE)) input.v2 = v2WE;
    if (Number.isFinite(Wnet)) input.Wnet = Wnet;
    return workEnergy(input);
  };

  const computeImpulseMomentum = () => {
    const input: Parameters<typeof impulseMomentum>[0] = { m: mIM, v1: v1IM };
    if (Number.isFinite(v2IM)) input.v2 = v2IM;
    if (Number.isFinite(I_IM)) input.I = I_IM;
    if (Number.isFinite(Favg)) input.Favg = Favg;
    if (Number.isFinite(tIM)) input.t = tIM;
    return impulseMomentum(input);
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "rectilinear", label: "Rectilinear" },
    { id: "projectile", label: "Projectile" },
    { id: "curvilinear", label: "Curvilinear" },
    { id: "kinetics", label: "Kinetics" },
    { id: "workEnergy", label: "Work–Energy" },
    { id: "impulseMomentum", label: "Impulse–Momentum" },
  ];

  // Build worked solution steps per tab
  const rectilinearSteps = ((): SolutionStep[] => {
    try {
      const r = computeRectilinear();
      return [
        {
          title: "Final velocity",
          lines: [
            { tex: `v = u + a t = ${f2(u)} + (${f2(a)})\\times${f2(tRect)} = ${f3(r.v)}\\,\\text{m/s}` },
            { text: "Final velocity from initial velocity, acceleration, and time." },
          ],
        },
        {
          title: "Displacement",
          lines: [
            { tex: `s = u t + \\tfrac{1}{2} a t^2 = ${f2(u)}\\times${f2(tRect)} + \\tfrac{1}{2}\\times${f2(a)}\\times${f2(tRect)}^2 = ${f3(r.s)}\\ \\text{m}` },
            { text: "Displacement from initial velocity, acceleration, and time." },
          ],
        },
        {
          title: "Verification",
          lines: [
            { tex: `v^2 = u^2 + 2 a s = ${f2(u)}^2 + 2\\times${f2(a)}\\times${f3(r.s)} = ${f3(r.v * r.v)}\\,\\text{m}^2/\\text{s}^2` },
            { text: "Velocity-displacement relation confirms the result." },
          ],
        },
      ];
    } catch {
      return [];
    }
  })();

  const projectileSteps = ((): SolutionStep[] => {
    const r = computeProjectile();
    return [
      {
        title: "Time of flight",
        lines: [
          { tex: `T = \\frac{u\\sin\\theta + \\sqrt{u^2\\sin^2\\theta + 2 g y_0}}{g} = \\frac{${f2(uProj)}\\sin${f2(theta)}^\\circ + \\sqrt{${f2(uProj)}^2\\sin^2${f2(theta)}^\\circ + 2\\times${f2(gProj)}\\times${f2(y0)}}}{${f2(gProj)}} = ${f3(r.timeOfFlight)}\\,\\text{s}` },
          { text: "Time of flight from quadratic solution of vertical motion." },
        ],
      },
      {
        title: "Range",
        lines: [
          { tex: `R = u\\cos\\theta \\times T = ${f2(uProj)}\\cos${f2(theta)}^\\circ \\times ${f3(r.timeOfFlight)} = ${f3(r.range)}\\,\\text{m}` },
          { text: "Horizontal range from horizontal velocity and flight time." },
        ],
      },
      {
        title: "Maximum height",
        lines: [
          { tex: `H = y_0 + \\frac{(u\\sin\\theta)^2}{2g} = ${f2(y0)} + \\frac{(${f2(uProj)}\\sin${f2(theta)}^\\circ)^2}{2\\times${f2(gProj)}} = ${f3(r.maxHeight)}\\,\\text{m}` },
          { text: "Maximum height at apex where vertical velocity = 0." },
        ],
      },
      {
        title: "Impact",
        lines: [
          { tex: `v_{\\text{impact}} = ${f3(r.impactSpeed)}\\,\\text{m/s} \\qquad \\theta_{\\text{impact}} = ${f2(r.impactAngleDeg)}^\\circ \\text{ below horizontal}` },
          { text: "Impact speed and angle from horizontal and vertical velocity components at landing." },
        ],
      },
    ];
  })();

  const curvilinearSteps = ((): SolutionStep[] => {
    const r = computeCurvilinear();
    return [
      {
        title: "Normal acceleration",
        lines: [
          { tex: `a_n = \\frac{v^2}{\\rho} = \\frac{${f2(vCurv)}^2}{${f2(rho)}} = ${f3(r.an)}\\,\\text{m/s}^2` },
          { text: "Normal (centripetal) acceleration toward center of curvature." },
        ],
      },
      {
        title: "Total acceleration",
        lines: [
          { tex: `a = \\sqrt{a_t^2 + a_n^2} = \\sqrt{${f3(r.at)}^2 + ${f3(r.an)}^2} = ${f3(r.a)}\\,\\text{m/s}^2` },
          { text: "Total acceleration magnitude from vector sum of tangential and normal components." },
        ],
      },
      {
        title: "Angle from tangent",
        lines: [
          { tex: `\\theta = \\tan^{-1}(a_n/a_t) = ${f2(r.thetaDeg)}^\\circ` },
          { text: "Direction of total acceleration relative to the tangent." },
        ],
      },
    ];
  })();

  const kineticsSteps = ((): SolutionStep[] => {
    const r = computeKinetics();
    return [
      {
        title: "Acceleration",
        lines: [
          { tex: `a_x = F_x/m = ${f2(Fx)}/${f2(mKin)} = ${f3(r.a.ax)}\\,\\text{m/s}^2` },
          { tex: `a_y = F_y/m = ${f2(Fy)}/${f2(mKin)} = ${f3(r.a.ay)}\\,\\text{m/s}^2` },
          { tex: `a_z = F_z/m = ${f2(Fz)}/${f2(mKin)} = ${f3(r.a.az)}\\,\\text{m/s}^2` },
          { text: "Acceleration from resultant force and mass (Newton's second law)." },
        ],
      },
      {
        title: "Final velocity",
        lines: [
          { tex: `v_x = v_{0x} + a_x t = ${f2(v0x)} + ${f3(r.a.ax)}\\times${f2(tKin)} = ${f3(r.v.vx)}\\,\\text{m/s}` },
          { tex: `v_y = v_{0y} + a_y t = ${f2(v0y)} + ${f3(r.a.ay)}\\times${f2(tKin)} = ${f3(r.v.vy)}\\,\\text{m/s}` },
          { tex: `v_z = v_{0z} + a_z t = ${f2(v0z)} + ${f3(r.a.az)}\\times${f2(tKin)} = ${f3(r.v.vz)}\\,\\text{m/s}` },
          { text: "Final velocity from initial velocity and constant acceleration." },
        ],
      },
      {
        title: "Displacement",
        lines: [
          { tex: `s_x = v_{0x} t + \\tfrac{1}{2} a_x t^2 = ${f3(r.s.sx)}\\,\\text{m}` },
          { tex: `s_y = v_{0y} t + \\tfrac{1}{2} a_y t^2 = ${f3(r.s.sy)}\\,\\text{m}` },
          { tex: `s_z = v_{0z} t + \\tfrac{1}{2} a_z t^2 = ${f3(r.s.sz)}\\,\\text{m}` },
          { text: "Displacement from initial velocity and constant acceleration." },
        ],
      },
    ];
  })();

  const workEnergySteps = ((): SolutionStep[] => {
    try {
      const r = computeWorkEnergy();
      return [
        {
          title: "Change in kinetic energy",
          lines: [
            { tex: `\\Delta KE = \\tfrac{1}{2}m(v_2^2 - v_1^2) = \\tfrac{1}{2}\\times${f2(mWE)}\\times(${f3(r.v2)}^2 - ${f2(v1WE)}^2) = ${f3(r.deltaKE)}\\,\\text{J}` },
            { text: "Change in kinetic energy between initial and final states." },
          ],
        },
        {
          title: "Net work",
          lines: [
            { tex: `W_{\\text{net}} = \\Delta KE - W_{\\text{nc}} - \\Delta PE = ${f3(r.deltaKE)} - ${f2(Wnc)} - ${f2(dPE)} = ${f3(r.Wnet)}\\,\\text{J}` },
            { text: "Net work accounting for non-conservative forces and potential energy change." },
          ],
        },
      ];
    } catch {
      return [];
    }
  })();

  const impulseMomentumSteps = ((): SolutionStep[] => {
    try {
      const r = computeImpulseMomentum();
      return [
        {
          title: "Impulse–momentum",
          lines: [
            { tex: `I = m(v_2 - v_1) = ${f2(mIM)}\\times(${f3(r.v2)} - ${f2(v1IM)}) = ${f3(r.I)}\\,\\text{N·s}` },
            { text: "Impulse equals change in momentum." },
          ],
        },
        ...(Number.isFinite(Favg) && Number.isFinite(tIM) ? [{
          title: "From average force",
          lines: [
            { tex: `I = F_{\\text{avg}} \\times t = ${Favg}\\times${tIM} = ${f3(r.I)}\\,\\text{N·s}` },
            { text: "Impulse from average force and duration." },
          ],
        } as SolutionStep] : []),
      ];
    } catch {
      return [];
    }
  })();

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 text-ink">Dynamics Calculator</h1>
      <p className="text-muted mb-6">
        PRC CELE syllabus (Structural 35%): kinematics, kinetics, work-energy, impulse-momentum.
      </p>

      <div className="border-b border-hairline mb-6">
        <nav className="flex gap-4 overflow-x-auto" role="tablist">
          {tabs.map(({ id, label }) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`px-4 py-2 rounded-t-lg font-medium transition-colors whitespace-nowrap ${
                tab === id
                  ? "bg-sheet border-b-2 border-brand text-brand"
                  : "text-faint hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      {tab === "rectilinear" && (
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-ink">Rectilinear Motion</h2>
            <p className="text-sm text-muted">
              Equations: v = u + at, s = ut + ½at², v² = u² + 2as
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <NumInput label="Initial velocity u" unit="m/s" value={u} onChange={setU} step={0.1} min={-1000} max={1000} />
              <NumInput label="Acceleration a" unit="m/s²" value={a} onChange={setA} step={0.1} min={-100} max={100} />
              <NumInput label="Time t" unit="s" value={tRect} onChange={setTRect} step={0.1} min={0} max={1000} />
              <NumInput label="Final velocity v" unit="m/s" value={vRect} onChange={setVRect} step={0.1} min={-1000} max={1000} />
              <NumInput label="Displacement s" unit="m" value={sRect} onChange={setSRect} step={0.1} min={-10000} max={10000} />
            </div>

            <button
              onClick={() => computeRectilinear()}
              className="px-6 py-2 bg-brand text-on-solid rounded hover:bg-brand-hover transition"
            >
              Compute
            </button>
          </div>

          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-ink">Results</h2>
            {(() => {
              try {
                const r = computeRectilinear();
                return (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="p-3 bg-sheet-2 rounded border border-hairline">
                        <div className="text-sm text-muted">Final velocity v</div>
                        <div className="text-2xl font-bold text-ink">{f3(r.v)} m/s</div>
                      </div>
                      <div className="p-3 bg-sheet-2 rounded border border-hairline">
                        <div className="text-sm text-muted">Displacement s</div>
                        <div className="text-2xl font-bold text-ink">{f3(r.s)} m</div>
                      </div>
                      <div className="p-3 bg-sheet-2 rounded border border-hairline">
                        <div className="text-sm text-muted">Time t</div>
                        <div className="text-2xl font-bold text-ink">{f3(r.t)} s</div>
                      </div>
                      <div className="p-3 bg-sheet-2 rounded border border-hairline">
                        <div className="text-sm text-muted">Acceleration a</div>
                        <div className="text-2xl font-bold text-ink">{f3(r.a)} m/s²</div>
                      </div>
                    </div>

                    <WorkedSolution steps={rectilinearSteps} title="Rectilinear motion — worked solution" />
                  </>
                );
              } catch (e: unknown) {
                return <div className="text-fail text-sm">{(e as Error).message}</div>;
              }
            })()}
          </div>
        </div>
      )}

      {tab === "projectile" && (
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-ink">Projectile Motion</h2>
            <p className="text-sm text-muted">
              No air resistance. y = y₀ + x·tanθ - (g·x²)/(2u²cos²θ)
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <NumInput label="Initial speed u" unit="m/s" value={uProj} onChange={setUProj} step={0.1} min={0} max={1000} />
              <NumInput label="Launch angle θ" unit="deg" value={theta} onChange={setTheta} step={1} min={0} max={90} />
              <NumInput label="Initial height y₀" unit="m" value={y0} onChange={setY0} step={0.1} min={-100} max={1000} />
              <NumInput label="Gravity g" unit="m/s²" value={gProj} onChange={setGProj} step={0.01} min={1} max={20} />
            </div>

            <button
              onClick={() => computeProjectile()}
              className="px-6 py-2 bg-brand text-on-solid rounded hover:bg-brand-hover transition"
            >
              Compute
            </button>
          </div>

          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-ink">Results</h2>
            {(() => {
              const r = computeProjectile();
              return (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="p-3 bg-sheet-2 rounded border border-hairline">
                      <div className="text-sm text-muted">Range</div>
                      <div className="text-2xl font-bold text-ink">{f3(r.range)} m</div>
                    </div>
                    <div className="p-3 bg-sheet-2 rounded border border-hairline">
                      <div className="text-sm text-muted">Max height</div>
                      <div className="text-2xl font-bold text-ink">{f3(r.maxHeight)} m</div>
                    </div>
                    <div className="p-3 bg-sheet-2 rounded border border-hairline">
                      <div className="text-sm text-muted">Time of flight</div>
                      <div className="text-2xl font-bold text-ink">{f3(r.timeOfFlight)} s</div>
                    </div>
                    <div className="p-3 bg-sheet-2 rounded border border-hairline">
                      <div className="text-sm text-muted">Impact speed</div>
                      <div className="text-2xl font-bold text-ink">{f3(r.impactSpeed)} m/s</div>
                    </div>
                    <div className="p-3 bg-sheet-2 rounded border border-hairline">
                      <div className="text-sm text-muted">Impact angle</div>
                      <div className="text-2xl font-bold text-ink">{f2(r.impactAngleDeg)}°</div>
                    </div>
                  </div>

                  <WorkedSolution steps={projectileSteps} title="Projectile motion — worked solution" />
                </>
              );
            })()}
          </div>
        </div>
      )}

      {tab === "curvilinear" && (
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-ink">Curvilinear Motion</h2>
            <p className="text-sm text-muted">
              Normal acceleration aₙ = v²/ρ, tangential aₜ = dv/dt, total a = √(aₜ² + aₙ²)
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <NumInput label="Speed v" unit="m/s" value={vCurv} onChange={setVCurv} step={0.1} min={0} max={1000} />
              <NumInput label="Radius ρ" unit="m" value={rho} onChange={setRho} step={0.1} min={0.01} max={10000} />
              <NumInput label="Tangential accel aₜ" unit="m/s²" value={at} onChange={setAt} step={0.1} min={-100} max={100} />
            </div>

            <button
              onClick={() => computeCurvilinear()}
              className="px-6 py-2 bg-brand text-on-solid rounded hover:bg-brand-hover transition"
            >
              Compute
            </button>
          </div>

          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-ink">Results</h2>
            {(() => {
              const r = computeCurvilinear();
              return (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="p-3 bg-sheet-2 rounded border border-hairline">
                      <div className="text-sm text-muted">Normal accel aₙ</div>
                      <div className="text-2xl font-bold text-ink">{f3(r.an)} m/s²</div>
                    </div>
                    <div className="p-3 bg-sheet-2 rounded border border-hairline">
                      <div className="text-sm text-muted">Tangential accel aₜ</div>
                      <div className="text-2xl font-bold text-ink">{f3(r.at)} m/s²</div>
                    </div>
                    <div className="p-3 bg-sheet-2 rounded border border-hairline">
                      <div className="text-sm text-muted">Total accel a</div>
                      <div className="text-2xl font-bold text-ink">{f3(r.a)} m/s²</div>
                    </div>
                    <div className="p-3 bg-sheet-2 rounded border border-hairline">
                      <div className="text-sm text-muted">Angle from tangent</div>
                      <div className="text-2xl font-bold text-ink">{f2(r.thetaDeg)}°</div>
                    </div>
                  </div>

                  <WorkedSolution steps={curvilinearSteps} title="Curvilinear motion — worked solution" />
                </>
              );
            })()}
          </div>
        </div>
      )}

      {tab === "kinetics" && (
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-ink">Kinetics (F = ma)</h2>
            <p className="text-sm text-muted">
              Newton's 2nd law / D'Alembert's principle. Resultant force → acceleration → velocity → displacement.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <NumInput label="Mass m" unit="kg" value={mKin} onChange={setMKin} step={0.1} min={0.01} max={10000} />
              <NumInput label="Force Fx" unit="N" value={Fx} onChange={setFx} step={1} min={-10000} max={10000} />
              <NumInput label="Force Fy" unit="N" value={Fy} onChange={setFy} step={1} min={-10000} max={10000} />
              <NumInput label="Force Fz" unit="N" value={Fz} onChange={setFz} step={1} min={-10000} max={10000} />
              <NumInput label="Initial vx" unit="m/s" value={v0x} onChange={setV0x} step={0.1} min={-1000} max={1000} />
              <NumInput label="Initial vy" unit="m/s" value={v0y} onChange={setV0y} step={0.1} min={-1000} max={1000} />
              <NumInput label="Initial vz" unit="m/s" value={v0z} onChange={setV0z} step={0.1} min={-1000} max={1000} />
              <NumInput label="Time t" unit="s" value={tKin} onChange={setTKin} step={0.1} min={0} max={1000} />
            </div>

            <button
              onClick={() => computeKinetics()}
              className="px-6 py-2 bg-brand text-on-solid rounded hover:bg-brand-hover transition"
            >
              Compute
            </button>
          </div>

          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-ink">Results</h2>
            {(() => {
              const r = computeKinetics();
              return (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="p-3 bg-sheet-2 rounded border border-hairline">
                      <div className="text-sm text-muted">Acceleration</div>
                      <div className="text-lg font-bold text-ink">
                        ({f3(r.a.ax)}, {f3(r.a.ay)}, {f3(r.a.az)}) m/s²
                      </div>
                    </div>
                    <div className="p-3 bg-sheet-2 rounded border border-hairline">
                      <div className="text-sm text-muted">Final velocity</div>
                      <div className="text-lg font-bold text-ink">
                        ({f3(r.v.vx)}, {f3(r.v.vy)}, {f3(r.v.vz)}) m/s
                      </div>
                    </div>
                    <div className="p-3 bg-sheet-2 rounded border border-hairline">
                      <div className="text-sm text-muted">Displacement</div>
                      <div className="text-lg font-bold text-ink">
                        ({f3(r.s.sx)}, {f3(r.s.sy)}, {f3(r.s.sz)}) m
                      </div>
                    </div>
                  </div>

                  <WorkedSolution steps={kineticsSteps} title="Kinetics (F = ma) — worked solution" />
                </>
              );
            })()}
          </div>
        </div>
      )}

      {tab === "workEnergy" && (
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-ink">Work–Energy Theorem</h2>
            <p className="text-sm text-muted">
              W_net = ΔKE = ½m(v₂² - v₁²). With non-conservative work: W_nc + ΔPE = ΔKE.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <NumInput label="Mass m" unit="kg" value={mWE} onChange={setMWE} step={0.1} min={0.01} max={10000} />
              <NumInput label="Initial velocity v₁" unit="m/s" value={v1WE} onChange={setV1WE} step={0.1} min={0} max={1000} />
              <NumInput label="Final velocity v₂" unit="m/s" value={v2WE} onChange={setV2WE} step={0.1} min={0} max={1000} />
              <NumInput label="Net work W_net" unit="J" value={Wnet} onChange={setWnet} step={1} min={-100000} max={100000} />
              <NumInput label="Non-conservative work W_nc" unit="J" value={Wnc} onChange={setWnc} step={1} min={-100000} max={100000} />
              <NumInput label="ΔPE" unit="J" value={dPE} onChange={setDPE} step={1} min={-100000} max={100000} />
            </div>

            <button
              onClick={() => computeWorkEnergy()}
              className="px-6 py-2 bg-brand text-on-solid rounded hover:bg-brand-hover transition"
            >
              Compute
            </button>
          </div>

          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-ink">Results</h2>
            {(() => {
              try {
                const r = computeWorkEnergy();
                return (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="p-3 bg-sheet-2 rounded border border-hairline">
                        <div className="text-sm text-muted">Final velocity v₂</div>
                        <div className="text-2xl font-bold text-ink">{f3(r.v2)} m/s</div>
                      </div>
                      <div className="p-3 bg-sheet-2 rounded border border-hairline">
                        <div className="text-sm text-muted">Net work W_net</div>
                        <div className="text-2xl font-bold text-ink">{f3(r.Wnet)} J</div>
                      </div>
                      <div className="p-3 bg-sheet-2 rounded border border-hairline">
                        <div className="text-sm text-muted">ΔKE</div>
                        <div className="text-2xl font-bold text-ink">{f3(r.deltaKE)} J</div>
                      </div>
                    </div>

                    <WorkedSolution steps={workEnergySteps} title="Work–Energy theorem — worked solution" />
                  </>
                );
              } catch (e: unknown) {
                return <div className="text-fail text-sm">{(e as Error).message}</div>;
              }
            })()}
          </div>
        </div>
      )}

      {tab === "impulseMomentum" && (
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-ink">Impulse–Momentum</h2>
            <p className="text-sm text-muted">
              I = Δp = m(v₂ - v₁). For constant force: I = F_avg × t.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <NumInput label="Mass m" unit="kg" value={mIM} onChange={setMIM} step={0.1} min={0.01} max={10000} />
              <NumInput label="Initial velocity v₁" unit="m/s" value={v1IM} onChange={setV1IM} step={0.1} min={-1000} max={1000} />
              <NumInput label="Final velocity v₂" unit="m/s" value={v2IM} onChange={setV2IM} step={0.1} min={-1000} max={1000} />
              <NumInput label="Impulse I" unit="N·s" value={I_IM} onChange={setI_IM} step={1} min={-100000} max={100000} />
              <NumInput label="Avg force F_avg" unit="N" value={Favg} onChange={setFavg} step={1} min={-100000} max={100000} />
              <NumInput label="Time t" unit="s" value={tIM} onChange={setTIM} step={0.01} min={0} max={1000} />
            </div>

            <button
              onClick={() => computeImpulseMomentum()}
              className="px-6 py-2 bg-brand text-on-solid rounded hover:bg-brand-hover transition"
            >
              Compute
            </button>
          </div>

          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-ink">Results</h2>
            {(() => {
              try {
                const r = computeImpulseMomentum();
                return (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="p-3 bg-sheet-2 rounded border border-hairline">
                        <div className="text-sm text-muted">Final velocity v₂</div>
                        <div className="text-2xl font-bold text-ink">{f3(r.v2)} m/s</div>
                      </div>
                      <div className="p-3 bg-sheet-2 rounded border border-hairline">
                        <div className="text-sm text-muted">Impulse I</div>
                        <div className="text-2xl font-bold text-ink">{f3(r.I)} N·s</div>
                      </div>
                      <div className="p-3 bg-sheet-2 rounded border border-hairline">
                        <div className="text-sm text-muted">Δp</div>
                        <div className="text-2xl font-bold text-ink">{f3(r.deltaP)} kg·m/s</div>
                      </div>
                    </div>

                    <WorkedSolution steps={impulseMomentumSteps} title="Impulse–Momentum — worked solution" />
                  </>
                );
              } catch (e: unknown) {
                return <div className="text-fail text-sm">{(e as Error).message}</div>;
              }
            })()}
          </div>
        </div>
      )}
    </div>
  );
}