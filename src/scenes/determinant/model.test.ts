import { describe, expect, it } from "vitest";
import { determinantMat2 } from "../../math";
import { determinantDefaults, determinantFrame } from "./model";

describe("determinant teaching paths", () => {
  it("distinguishes an intermediate collapse from an invertible target", () => {
    const state = { ...determinantDefaults, matrix: [-1, 0, 0, -1] as const };
    expect(determinantMat2(determinantFrame(state, 0.5))).toBe(0);
    expect(determinantMat2(determinantFrame(state, 1))).toBe(1);
  });
  it("preserves area throughout a column addition, starting at the previous matrix", () => {
    const state = {
      ...determinantDefaults,
      animationFrom: [2, 0, 1, 3] as const,
      matrix: [2, 2, 1, 4] as const,
    };
    for (const t of [0, 0.2, 0.5, 0.8, 1])
      expect(determinantMat2(determinantFrame(state, t))).toBeCloseTo(6);
    expect(determinantFrame(state, 0)).toEqual(state.animationFrom);
  });
  it("uses angular interpolation for the rotation lesson", () => {
    const state = {
      ...determinantDefaults,
      animationKind: "rotation" as const,
      matrix: [0, -1, 1, 0] as const,
    };
    for (const t of [0, 0.25, 0.5, 1])
      expect(determinantMat2(determinantFrame(state, t))).toBeCloseTo(1);
  });
});
