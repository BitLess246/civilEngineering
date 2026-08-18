import type { ReactNode } from 'react'
import { HintButton } from './LoadHints'

// ─────────────────────────────────────────────────────────────────────────
// The long-form explanation behind the Analysis options card.
//
// The card itself carries one short line per toggle — enough to recognise the
// option, not enough to explain it. Everything an engineer needs to decide
// whether to switch one on lives here, behind the ⓘ in the card header, so the
// panel stays scannable and the detail stays one click away rather than gone.
// ─────────────────────────────────────────────────────────────────────────

const Opt = ({ name, clause, children }: { name: string; clause?: string; children: ReactNode }) => (
  <div>
    <h4 className="mb-0.5 font-bold text-slate-800">
      {name}
      {clause && <span className="ml-1.5 font-medium text-slate-500">{clause}</span>}
    </h4>
    <div className="space-y-1.5 text-slate-700">{children}</div>
  </div>
)

const Note = ({ children }: { children: ReactNode }) => (
  <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-900">{children}</p>
)

/** ⓘ button for the Analysis options card header, with the full write-up. */
export function AnalysisOptionsHelp() {
  return (
    <HintButton title="Analysis options — what each one does" label="ⓘ">
      <p className="text-slate-600">
        Defaults are chosen for a concrete building being designed to NSCP 2015. Every toggle changes the
        stiffness the frame is solved with, the demands it reports, or both — so a result is only comparable
        with another result run on the same settings.
      </p>

      <Opt name="Assembly or garage" clause="NSCP §203.3.1">
        <p>
          Sets the live-load factor <b>f₁ = 1.0</b> instead of 0.5. f₁ applies to L where it rides alongside
          wind or seismic — combinations 203-3, 203-4 and 203-5. Use 1.0 for public assembly areas, garages,
          and anywhere the unreduced live load L<sub>o</sub> exceeds 4.8 kPa.
        </p>
        <p>
          It does <b>not</b> touch 1.2D + 1.6L, so for a gravity-only model the governing combination is the
          same either way.
        </p>
      </Opt>

      <Opt name="P-Δ second-order analysis">
        <p>
          Adds the geometric stiffness K<sub>g</sub>(N) and iterates until the axial state is self-consistent,
          so gravity acting on the deflected shape amplifies moments and drift. Off, the frame is solved
          first-order (linear).
        </p>
        <p>
          The solve reports whether it converged, in how many iterations, and the final residual — a run that
          did not converge is near instability and its results should not be used.
        </p>
      </Opt>

      <Opt name="Cracked sections" clause="ACI 318-14 §6.6.3.1.1">
        <p>
          Applies the code's stiffness modifiers by member role: <b>0.35I<sub>g</sub></b> beams,
          <b> 0.70I<sub>g</sub></b> columns, <b>0.25I<sub>g</sub></b> walls and flat plates. Concrete only —
          steel and timber members are untouched.
        </p>
        <p>
          This raises computed drift and shifts moment toward the members that stay relatively stiffer. It is
          on by default because a service-level RC frame is cracked; turn it off to compare against a
          gross-section hand calculation or another program running gross sections.
        </p>
      </Opt>

      <Opt name="Shear deformation (Timoshenko)">
        <p>
          Threads shear areas into the frame element, giving each member
          Φ = 12EI/(G·A<sub>s</sub>·L²). It softens deep girders and squat columns, where shear flexibility is
          a real part of the deflection rather than a rounding error.
        </p>
        <p className="text-slate-500">
          Fixed-end forces stay Euler — exact for a UDL, a small O(Φ) approximation for asymmetric point and
          trapezoidal loads. Modal, pushover and buckling still run the Euler element.
        </p>
      </Opt>

      <Opt name="Column bars on all four faces">
        <p>
          Builds the column P–M interaction from strain-compatibility layers matching the real cage, instead of
          assuming reinforcement only on the two extreme faces. The intermediate bars sit near the neutral axis
          and contribute little at balanced failure, so the balanced moment comes out <b>lower</b> — a more
          realistic and usually more demanding interaction diagram.
        </p>
      </Opt>

      <Opt name="Rigid floor diaphragm">
        <p>
          Ties the in-plane degrees of freedom — u<sub>x</sub>, u<sub>z</sub> and θ<sub>y</sub> — of every node
          at a storey to one master node by rigid-body kinematics, lever arm included. Storey shear then
          distributes by the relative stiffness of the frames resisting it, and accidental torsion becomes
          meaningful.
        </p>
        <p className="text-slate-500">
          In-plane only. It adds no out-of-plane (slab bending) stiffness, so it does not change how gravity
          load reaches the beams.
        </p>
      </Opt>

      <Opt name="Auto rigid end zones">
        <p>
          A member is flexible only between joint faces, not between node centres. Each end is shortened by an
          offset derived from the depths of the members framing into that joint, and the stub from node to face
          is carried as a rigid arm.
        </p>
        <p>
          The <b>rigid-zone factor</b> (0–1) scales it: 0.5 is the usual choice, 1.0 makes the member fully
          rigid to the face. The result is a stiffer frame with smaller span moments and larger face moments.
          An offset set by hand on a member always overrides the automatic value for that end.
        </p>
      </Opt>

      <Opt name="Shell elements for slab and wall panels">
        <p>
          Meshes panels as flat shell finite elements — membrane plus plate bending — so a slab or wall carries
          stiffness rather than only shedding load.
        </p>
        <Note>
          Each panel currently meshes to just <b>two triangles on its four corner nodes</b>. With no nodes along
          the edges, an area load lumps onto the corners and the edge beams receive almost none of it. Use this
          for panel stress plots and slab FE reinforcement, <b>not</b> to load a frame. The design pipeline
          always uses the tributary load model regardless of this setting.
        </Note>
      </Opt>

      <Opt name="Try alternative bar sizes">
        <p>
          Lets Design and Optimize search ⌀16–⌀32 for beams and ⌀20–⌀32 for columns rather than holding the bar
          diameter stored on the section. Off, the section's own bar size is respected.
        </p>
      </Opt>

      <div className="border-t border-slate-200 pt-3">
        <h4 className="mb-1 font-bold text-slate-800">How slab load reaches the frame</h4>
        <p className="mb-1.5">
          Area loads are distributed to the edge beams by <b>45° tributary areas</b>, converted to
          load-conserving equivalent uniform line loads: q·l<sub>x</sub>/4 on the short edges and
          (q·l<sub>x</sub>/2)(1 − l<sub>x</sub>/2l<sub>y</sub>) on the long ones. Panel totals are preserved
          exactly, so reactions, columns and footings stay in equilibrium.
        </p>
        <p className="mb-1.5">
          What it cannot reproduce is the elastic distribution of a slab that is <em>continuous</em> across an
          interior support line. A cross-check against STAAD.Pro on a 2×1-bay, two-storey frame with the slab
          meshed 10×10 per panel put the difference at:
        </p>
        <ul className="mb-1.5 list-disc space-y-0.5 pl-4">
          <li>support reactions within <b>4.6 %</b>, joint deflections within <b>0.3 %</b></li>
          <li>long-span beams <b>7 % conservative</b></li>
          <li>edge girders <b>21 % low</b>, interior girders <b>31 % low</b></li>
        </ul>
        <Note>
          Interior support lines are the unconservative case. Where a girder carries continuous slab on both
          sides, check it against a continuity factor or a meshed model before relying on the tributary result.
        </Note>
      </div>
    </HintButton>
  )
}
