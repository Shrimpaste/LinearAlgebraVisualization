import { describe, expect, it } from "vitest";
import {
  addVec2,
  canonicalizeDirection,
  crossVec2,
  distanceVec2,
  dotVec2,
  hadamardVec2,
  lengthVec2,
  lerpVec2,
  negateVec2,
  normalizeVec2,
  perpendicularVec2,
  rotateVec2,
  scaleVec2,
  subtractVec2,
} from "./index";

describe("Vec2 operations", () => {
  it("performs component and scalar arithmetic without mutating inputs", () => {
    const left = [2, -3] as const;
    const right = [-1, 5] as const;
    expect(addVec2(left, right)).toEqual([1, 2]);
    expect(subtractVec2(left, right)).toEqual([3, -8]);
    expect(negateVec2(left)).toEqual([-2, 3]);
    expect(scaleVec2(left, 2)).toEqual([4, -6]);
    expect(hadamardVec2(left, right)).toEqual([-2, -15]);
    expect(left).toEqual([2, -3]);
  });

  it("computes dot, cross, length, and distance", () => {
    expect(dotVec2([3, 4], [-4, 3])).toBe(0);
    expect(crossVec2([1, 0], [0, 1])).toBe(1);
    expect(crossVec2([0, 1], [1, 0])).toBe(-1);
    expect(lengthVec2([3, 4])).toBe(5);
    expect(distanceVec2([1, 2], [4, 6])).toBe(5);
  });

  it("normalizes directions and rejects only the zero vector", () => {
    expect(normalizeVec2([0, 0])).toBeNull();
    expect(normalizeVec2([3, 4])).toEqual([0.6, 0.8]);
    expect(normalizeVec2([3e-100, 4e-100])).toEqual([0.6, 0.8]);
    expect(canonicalizeDirection([-1, -2])).toEqual([1, 2]);
    expect(canonicalizeDirection([0, -1])).toEqual([0, 1]);
  });

  it("supports interpolation and planar geometry", () => {
    expect(lerpVec2([0, 10], [10, -10], 0.25)).toEqual([2.5, 5]);
    expect(perpendicularVec2([2, 3])).toEqual([-3, 2]);
    const rotated = rotateVec2([1, 0], Math.PI / 2);
    expect(rotated[0]).toBeCloseTo(0, 12);
    expect(rotated[1]).toBeCloseTo(1, 12);
  });
});
