import { describe, expect, it } from "vitest";
import {
  IDENTITY_MAT2,
  applyMat2,
  columnsOfMat2,
  determinantMat2,
  interpolateMat2,
  inverseMat2,
  mat2FromColumns,
  mat2FromRows,
  multiplyMat2,
  nearlyEqualMat2,
  rankMat2,
  rowsOfMat2,
  traceMat2,
  transposeMat2,
} from "./index";

describe("Mat2 operations", () => {
  it("constructs and decomposes row-major matrices", () => {
    expect(mat2FromRows([1, 2], [3, 4])).toEqual([1, 2, 3, 4]);
    expect(mat2FromColumns([1, 3], [2, 4])).toEqual([1, 2, 3, 4]);
    expect(rowsOfMat2([1, 2, 3, 4])).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(columnsOfMat2([1, 2, 3, 4])).toEqual([
      [1, 3],
      [2, 4],
    ]);
  });

  it("multiplies matrices in composition order and applies them", () => {
    const scale = [2, 0, 0, 3] as const;
    const shear = [1, 1, 0, 1] as const;
    expect(multiplyMat2(shear, scale)).toEqual([2, 3, 0, 3]);
    expect(applyMat2(multiplyMat2(shear, scale), [1, 2])).toEqual([8, 6]);
    expect(multiplyMat2(IDENTITY_MAT2, scale)).toEqual(scale);
  });

  it("computes interpolation, transpose, trace, and determinant", () => {
    expect(interpolateMat2(IDENTITY_MAT2, [3, 2, 4, 5], 0.5)).toEqual([
      2, 1, 2, 3,
    ]);
    expect(transposeMat2([1, 2, 3, 4])).toEqual([1, 3, 2, 4]);
    expect(traceMat2([1, 2, 3, 4])).toBe(5);
    expect(determinantMat2([1, 2, 3, 4])).toBe(-2);
  });

  it("inverts nonsingular matrices and classifies rank scale-independently", () => {
    const matrix = [4, 7, 2, 6] as const;
    const inverse = inverseMat2(matrix);
    expect(inverse).not.toBeNull();
    expect(nearlyEqualMat2(multiplyMat2(matrix, inverse!), IDENTITY_MAT2)).toBe(
      true,
    );
    expect(rankMat2(matrix)).toBe(2);
    expect(rankMat2([1, 2, 2, 4])).toBe(1);
    expect(rankMat2([0, 0, 0, 0])).toBe(0);
    expect(rankMat2([1e-100, 0, 0, 1e-100])).toBe(2);
    expect(rankMat2([2e6, 2e6, 2e6, 2_000_000.0001])).toBe(2);
  });

  it("refuses a numerically singular inverse", () => {
    expect(inverseMat2([1, 2, 2, 4])).toBeNull();
    expect(inverseMat2([1, 1, 1, 1 + 1e-12])).toBeNull();
  });
});
