import { describe, it, expect } from "vitest";
import {
  kinematicsRectilinear,
  projectile,
  kinetics,
  workEnergy,
  impulseMomentum,
  curvilinear,
} from "./dynamics";

describe("kinematicsRectilinear", () => {
  it("v = u + at: u=10, a=2, t=5 → v=20, s=75", () => {
    const r = kinematicsRectilinear({ u: 10, a: 2, t: 5 });
    expect(r.v).toBeCloseTo(20);
    expect(r.s).toBeCloseTo(75);
  });

  it("v² = u² + 2as: u=0, a=9.81, s=20 → v≈19.81", () => {
    const r = kinematicsRectilinear({ u: 0, a: 9.81, s: 20 });
    expect(r.v).toBeCloseTo(19.81, 1);
    expect(r.t).toBeCloseTo(2.02, 1);
  });

  it("s = ut + ½at²: u=5, a=-1, t=8 → s=8, v=-3", () => {
    const r = kinematicsRectilinear({ u: 5, a: -1, t: 8 });
    expect(r.s).toBeCloseTo(8);
    expect(r.v).toBeCloseTo(-3);
  });
});

describe("projectile", () => {
  it("Level ground: u=20, θ=45°, g=9.81 → R≈40.8, H≈10.2, T≈2.88", () => {
    const r = projectile({ u: 20, thetaDeg: 45 });
    expect(r.range).toBeCloseTo(40.77, 1);
    expect(r.maxHeight).toBeCloseTo(10.19, 1);
    expect(r.timeOfFlight).toBeCloseTo(2.88, 1);
  });

  it("From height: u=15, θ=30°, y0=10, g=9.81 → R≈31.0", () => {
    const r = projectile({ u: 15, thetaDeg: 30, y0: 10 });
    expect(r.range).toBeCloseTo(30.97, 1);
    expect(r.maxHeight).toBeGreaterThan(10);
  });

  it("Vertical throw: u=20, θ=90° → R=0, H≈20.4, T≈4.08", () => {
    const r = projectile({ u: 20, thetaDeg: 90 });
    expect(r.range).toBeCloseTo(0, 5);
    expect(r.maxHeight).toBeCloseTo(20.39, 1);
    expect(r.timeOfFlight).toBeCloseTo(4.08, 1);
    expect(r.impactAngleDeg).toBeCloseTo(90, 1);
  });
});

describe("kinetics", () => {
  it("F=ma: m=5, Fx=20, t=3 → ax=4, vx=12, sx=18", () => {
    const r = kinetics({ m: 5, forces: { Fx: 20, Fy: 0, Fz: 0 }, t: 3 });
    expect(r.a.ax).toBe(4);
    expect(r.v.vx).toBe(12);
    expect(r.s.sx).toBe(18);
  });

  it("Multiple forces: m=2, F1={10,0,0}, F2={0,6,0}, t=2 → a={5,3,0}, v={10,6,0}, s={10,6,0}", () => {
    const r = kinetics({
      m: 2,
      forces: [
        { Fx: 10, Fy: 0, Fz: 0 },
        { Fx: 0, Fy: 6, Fz: 0 },
      ],
      t: 2,
    });
    expect(r.a.ax).toBe(5);
    expect(r.a.ay).toBe(3);
    expect(r.v.vx).toBe(10);
    expect(r.v.vy).toBe(6);
    expect(r.s.sx).toBe(10);
    expect(r.s.sy).toBe(6);
  });

  it("With initial velocity: m=3, v0={4,0,0}, F={0,9,0}, t=2 → v={4,6,0}", () => {
    const r = kinetics({
      m: 3,
      forces: { Fx: 0, Fy: 9, Fz: 0 },
      v0: { vx: 4, vy: 0, vz: 0 },
      t: 2,
    });
    expect(r.v.vx).toBe(4);
    expect(r.v.vy).toBe(6);
  });
});

describe("workEnergy", () => {
  it("Wnet = ΔKE: m=2, v1=3, v2=7 → Wnet=40, ΔKE=40", () => {
    const r = workEnergy({ m: 2, v1: 3, v2: 7 });
    expect(r.Wnet).toBeCloseTo(40);
    expect(r.deltaKE).toBeCloseTo(40);
  });

  it("Solve for v2: m=5, v1=4, Wnet=90 → v2≈7.21", () => {
    const r = workEnergy({ m: 5, v1: 4, Wnet: 90 });
    expect(r.v2).toBeCloseTo(7.21, 1);
    expect(r.deltaKE).toBeCloseTo(90);
  });

  it("With non-conservative work: m=10, v1=5, Wnet=0, Wnc=-50, ΔPE=20 → v2≈4.36", () => {
    // Wnet + Wnc + ΔPE = ΔKE = 0.5*m*(v2² - v1²)
    // 0 - 50 + 20 = -30 = 0.5*10*(v2² - 25) → v2² = 25 - 6 = 19 → v2≈4.36
    const r = workEnergy({ m: 10, v1: 5, Wnet: 0, Wnc: -50, deltaPE: 20 });
    expect(r.v2).toBeCloseTo(4.36, 1);
  });
});

describe("impulseMomentum", () => {
  it("I = mΔv: m=4, v1=2, v2=10 → I=32, Δp=32", () => {
    const r = impulseMomentum({ m: 4, v1: 2, v2: 10 });
    expect(r.I).toBe(32);
    expect(r.deltaP).toBe(32);
  });

  it("Solve for v2: m=3, v1=5, I=24 → v2=13", () => {
    const r = impulseMomentum({ m: 3, v1: 5, I: 24 });
    expect(r.v2).toBe(13);
  });

  it("From Favg and t: m=2, v1=0, Favg=50, t=0.4 → I=20, v2=10", () => {
    const r = impulseMomentum({ m: 2, v1: 0, Favg: 50, t: 0.4 });
    expect(r.I).toBe(20);
    expect(r.v2).toBe(10);
  });
});

describe("curvilinear", () => {
  it("Uniform circular: v=10, ρ=25 → an=4, at=0, a=4", () => {
    const r = curvilinear({ v: 10, rho: 25 });
    expect(r.an).toBe(4);
    expect(r.at).toBe(0);
    expect(r.a).toBe(4);
    expect(r.thetaDeg).toBe(90);
  });

  it("Non-uniform: v=10, ρ=20, at=3 → an=5, a≈5.83, θ≈59°", () => {
    const r = curvilinear({ v: 10, rho: 20, at: 3 });
    expect(r.an).toBe(5);
    expect(r.at).toBe(3);
    expect(r.a).toBeCloseTo(5.83, 1);
    expect(r.thetaDeg).toBeCloseTo(59.04, 1);
  });
});