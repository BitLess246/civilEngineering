import { describe, it, expect } from "vitest";
import {
  bernoulli,
  rotatingVessel,
  movingVessel,
  waterJet,
} from "./hydraulics";

describe("bernoulli", () => {
  it("computes point 2 from point 1 with no losses or machinery", () => {
    const r = bernoulli({ p1: 200000, v1: 2, z1: 10, rho: 1000, g: 9.81, hL: 0, hP: 0, hT: 0 });
    // head1 = 200000/9810 + 4/19.62 + 10 = 20.387 + 0.204 + 10 = 30.591 m
    expect(r.head1).toBeCloseTo(30.59, 1);
    // head2 = head1 = 30.591 (no losses)
    expect(r.head2).toBeCloseTo(30.59, 1);
    // p2 = (head2 - z2 - v2^2/2g) * γ = (30.591 - 0 - 0) * 9810 = 300100 Pa
    expect(r.p2).toBeCloseTo(300100, 0);
  });

  it("solves for p2 given v2 and z2", () => {
    const r = bernoulli({ p1: 200000, v1: 2, z1: 10, v2: 3, z2: 5, solveFor: "p2" });
    // head1 = 30.591, head2 = 30.591, v2^2/2g = 9/19.62 = 0.459, z2 = 5
    // p2/γ = 30.591 - 0.459 - 5 = 25.132 m -> p2 = 25.132 * 9810 = 246550 Pa
    expect(r.p2).toBeCloseTo(246550, 0);
  });

  it("solves for v2 given p2 and z2", () => {
    const r = bernoulli({ p1: 200000, v1: 2, z1: 10, p2: 150000, z2: 5, solveFor: "v2" });
    // head1 = 30.591, p2/γ = 150000/9810 = 15.29, z2 = 5
    // v2^2/2g = 30.591 - 15.29 - 5 = 10.301 -> v2 = sqrt(2*9.81*10.301) = 14.22 m/s
    expect(r.v2).toBeCloseTo(14.22, 1);
  });

  it("solves for z2 given p2 and v2", () => {
    const r = bernoulli({ p1: 200000, v1: 2, z1: 10, p2: 150000, v2: 3, solveFor: "z2" });
    // head1 = 30.591, head2 = 30.591, p2/γ = 15.29, v2^2/2g = 0.459
    // z2 = 30.591 - 15.29 - 0.459 = 14.84 m
    expect(r.z2).toBeCloseTo(14.84, 1);
  });

  it("solves for hL given p2, v2, z2", () => {
    const r = bernoulli({ p1: 200000, v1: 2, z1: 10, p2: 150000, v2: 3, z2: 5, solveFor: "hL" });
    // head1 = 30.591, head2 = 15.29 + 0.459 + 5 = 20.749
    // hL = head1 - head2 = 9.842 m
    expect(r.hL).toBeCloseTo(9.84, 1);
  });

  it("solves for hP given p2, v2, z2, hL", () => {
    const r = bernoulli({ p1: 100000, v1: 1, z1: 5, p2: 200000, v2: 2, z2: 10, hL: 2, solveFor: "hP" });
    // head1 = 100000/9810 + 1/19.62 + 5 = 10.194 + 0.051 + 5 = 15.245
    // head2 = 200000/9810 + 4/19.62 + 10 = 20.387 + 0.204 + 10 = 30.591
    // hP = head2 + hL - head1 = 30.591 + 2 - 15.245 = 17.346 m
    expect(r.hP).toBeCloseTo(17.35, 1);
  });

  it("solves for hT given p2, v2, z2, hL, hP", () => {
    const r = bernoulli({ p1: 200000, v1: 2, z1: 10, p2: 150000, v2: 1, z2: 5, hL: 2, hP: 5, solveFor: "hT" });
    // head1 = 30.591, head2 = 15.29 + 0.051 + 5 = 20.341
    // hT = head1 + hP - head2 - hL = 30.591 + 5 - 20.341 - 2 = 13.25 m
    expect(r.hT).toBeCloseTo(13.25, 1);
  });
});

describe("rotatingVessel", () => {
  it("computes rim rise and volume for forced vortex", () => {
    const r = rotatingVessel({ omega: 5, R: 0.5, h0: 0.3 });
    // z_rim = 5^2 * 0.5^2 / (2*9.81) = 6.25 / 19.62 = 0.3186 m
    expect(r.z_rim).toBeCloseTo(0.3186, 3);
    expect(r.z_center).toBe(0);
    // volume = π*0.5^2*0.3 + π*0.5^2*0.3186/2 = 0.2356 + 0.1249 = 0.3605
    expect(r.volume).toBeCloseTo(0.3605, 3);
    // pressure at r=0.5, h=0.1: p = 1000*9.81*0.1 + 1000*25*0.25/2 = 981 + 3125 = 4106 Pa
    expect(r.p_at_r(0.5, 0.1)).toBeCloseTo(4106, 0);
  });
});

describe("movingVessel", () => {
  it("horizontal acceleration: computes surface tilt and pressure", () => {
    const r = movingVessel({ a: 3, direction: "horizontal", depth: 1, x: 0.5 });
    // tanθ = 3/9.81 = 0.3058, θ = 17.0°
    expect(r.thetaDeg).toBeCloseTo(17.0, 1);
    // p = 1000*(9.81*1 + 3*0.5) = 1000*(9.81 + 1.5) = 11310 Pa
    expect(r.p).toBeCloseTo(11310, 0);
    expect(r.free_surface_slope).toBeCloseTo(0.3058, 3);
  });

  it("vertical acceleration: computes effective gravity", () => {
    const r = movingVessel({ a: 2, direction: "vertical", depth: 2 });
    // g_eff = 9.81 + 2 = 11.81
    // p = 1000 * 11.81 * 2 = 23620 Pa
    expect(r.p).toBeCloseTo(23620, 0);
    expect(r.thetaDeg).toBe(0);
  });

  it("inclined acceleration: computes effective perpendicular gravity", () => {
    const r = movingVessel({ a: 3, direction: "inclined", thetaDeg: 30, depth: 1 });
    // theta = 30°, a_parallel = 3*cos30 = 2.598, a_perp = 3*sin30 = 1.5
    // g_eff_perp = 9.81*cos30 + 1.5 = 8.496 + 1.5 = 9.996
    // p = 1000 * 9.996 * 1 = 9996 Pa
    expect(r.p).toBeCloseTo(9996, 0);
    // free surface slope = a_parallel / g_eff_perp = 2.598 / 9.996 = 0.2599
    expect(r.free_surface_slope).toBeCloseTo(0.26, 2);
  });
});

describe("waterJet", () => {
  it("stationary vane: 90° deflection", () => {
    const r = waterJet({ v: 20, d: 0.05, thetaDeg: 90, u: 0 });
    // A = π*0.05^2/4 = 0.0019635 m²
    // v_r = 20
    // Q = 0.0019635 * 20 = 0.03927 m³/s
    // m_dot = 1000 * 0.03927 = 39.27 kg/s
    // F = 39.27 * 20 * (1 - cos90°) = 39.27 * 20 * 1 = 785.4 N
    expect(r.A).toBeCloseTo(0.0019635, 5);
    expect(r.Q).toBeCloseTo(0.03927, 4);
    expect(r.m_dot).toBeCloseTo(39.27, 1);
    expect(r.F).toBeCloseTo(785.4, 0);
    expect(r.F_x).toBeCloseTo(785.4, 0);
    expect(r.F_y).toBeCloseTo(785.4, 0);
    expect(r.power).toBe(0);
    expect(r.efficiency).toBe(0);
  });

  it("stationary flat plate: 180° deflection", () => {
    const r = waterJet({ v: 20, d: 0.05, thetaDeg: 180, u: 0 });
    // F = m_dot * v * (1 - cos180°) = 39.27 * 20 * 2 = 1570.8 N
    expect(r.F).toBeCloseTo(1570.8, 0);
    expect(r.F_x).toBeCloseTo(1570.8, 0);
    expect(r.F_y).toBeCloseTo(0, 1);
  });

  it("moving vane: computes power and efficiency", () => {
    const r = waterJet({ v: 20, d: 0.05, thetaDeg: 90, u: 5 });
    // v_r = 20 - 5 = 15
    // A = π*0.05^2/4 = 0.0019635
    // Q = 0.0019635 * 15 = 0.02945 m³/s
    // m_dot = 1000 * 0.02945 = 29.45 kg/s
    // F = 29.45 * 15 * (1 - cos90°) = 441.75 N
    // power = F * u = 441.75 * 5 = 2208.75 W
    // power_in = 0.5 * 29.45 * 20^2 = 5890 W
    // efficiency = 2208.75 / 5890 = 0.375 = 37.5%
    expect(r.F).toBeCloseTo(441.8, 1);
    expect(r.power).toBeCloseTo(2208.93, 1);
    expect(r.efficiency).toBeCloseTo(0.375, 3);
  });
});