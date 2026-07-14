import { describe, expect, it } from "vitest";
import {
  EPSILON,
  clamp,
  finiteOr,
  inverseLerp,
  lerpNumber,
  nearlyEqual,
  nearlyZero,
  safeAcos,
  scaledTolerance,
  snapNearZero,
} from "./index";

describe("numeric helpers", () => {
  it("clamps, interpolates, and inverse-interpolates scalars", () => {
    expect(clamp(12, -2, 5)).toBe(5);
    expect(clamp(-3, -2, 5)).toBe(-2);
    expect(lerpNumber(10, 20, 0.25)).toBe(12.5);
    expect(inverseLerp(10, 20, 12.5)).toBe(0.25);
    expect(inverseLerp(2, 2, 9)).toBeNull();
  });

  it("uses relative comparisons at both large and small scales", () => {
    expect(nearlyEqual(1_000_000, 1_000_000 + EPSILON * 500_000)).toBe(true);
    expect(nearlyEqual(1, 1.001)).toBe(false);
    expect(nearlyZero(1e-12, 1)).toBe(true);
    expect(nearlyZero(1e-6, 1e6)).toBe(true);
    expect(scaledTolerance([2, -10, 3])).toBeCloseTo(10 * EPSILON, 20);
  });

  it("keeps inverse trigonometry and display cleanup finite", () => {
    expect(safeAcos(1 + Number.EPSILON)).toBe(0);
    expect(safeAcos(-1 - Number.EPSILON)).toBe(Math.PI);
    expect(snapNearZero(-1e-12)).toBe(0);
    expect(finiteOr(Number.POSITIVE_INFINITY, 7)).toBe(7);
    expect(finiteOr(3, 7)).toBe(3);
  });
});
