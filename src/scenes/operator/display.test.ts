import { describe, expect, it } from "vitest";
import type { ComplexMatrix } from "../../math/nd";
import {
  compactOperatorDisplayMatrix,
  compactOperatorDisplayNumber,
} from "./display";

describe("operator display precision", () => {
  it("rounds read-only factors to six decimals and removes negative zero", () => {
    expect(compactOperatorDisplayNumber(0.8971733252879663)).toBe(0.897173);
    expect(compactOperatorDisplayNumber(0.9999999999999999)).toBe(1);
    expect(compactOperatorDisplayNumber(-Number.EPSILON)).toBe(0);
    expect(Object.is(compactOperatorDisplayNumber(-Number.EPSILON), -0)).toBe(
      false,
    );
  });

  it("returns a compact copy without changing the spectral matrix", () => {
    const matrix: ComplexMatrix = [
      [
        { re: 0.123456789, im: -0.0000001 },
        { re: 0, im: 0.333333333 },
      ],
      [
        { re: -0.987654321, im: Number.EPSILON },
        { re: 1, im: 0 },
      ],
    ];

    const compact = compactOperatorDisplayMatrix(matrix);

    expect(compact).toEqual([
      [
        { re: 0.123457, im: 0 },
        { re: 0, im: 0.333333 },
      ],
      [
        { re: -0.987654, im: 0 },
        { re: 1, im: 0 },
      ],
    ]);
    expect(compact).not.toBe(matrix);
    expect(matrix[0]![0]).toEqual({ re: 0.123456789, im: -0.0000001 });
  });
});
