import { describe, expect, it } from "vitest";
import { deriveSystems, migrateSystemsState } from "./model";
const solve = (matrix: number[][], b: number[], parameters = [0, 0, 0]) =>
  deriveSystems(
    migrateSystemsState({
      rows: matrix.length,
      columns: matrix[0]!.length,
      matrix,
      b,
      parameters,
    }),
  );
describe("solution families and least squares", () => {
  it("keeps homogeneous systems exact while moving along a numerical nullspace", () => {
    const d = solve([[1, 1]], [0], [3, 0, 0]);
    expect(d.exact).toBe(true);
    expect(d.residualNorm).toBeLessThan(1e-12);
  });
  it("finds a unique exact solution", () => {
    const d = solve(
      [
        [2, 0],
        [0, 3],
      ],
      [4, 9],
    );
    expect(d.exact).toBe(true);
    expect(d.solution).toEqual([2, 3]);
    expect(d.nullspace).toHaveLength(0);
  });
  it("projects an inconsistent target and certifies orthogonality", () => {
    const d = solve([[1], [1], [1]], [1, 2, 3]);
    expect(d.exact).toBe(false);
    expect(d.solution[0]).toBeCloseTo(2);
    expect(d.normalResidual).toBeLessThan(1e-12);
    expect(d.residualNorm).toBeCloseTo(Math.sqrt(2));
  });
  it("completes the thin SVD nullspace and preserves Ax along the family", () => {
    const d = solve([[1, 1, 0]], [2], [2, -3]);
    expect(d.nullspace).toHaveLength(2);
    expect(d.minimum[0]).toBeCloseTo(1);
    expect(d.minimum[1]).toBeCloseTo(1);
    expect(d.fitted[0]).toBeCloseTo(2);
    expect(d.exact).toBe(true);
    expect(Math.hypot(...d.solution)).toBeGreaterThan(Math.hypot(...d.minimum));
  });
  it("handles zero matrices and distinguishes zero from nonzero targets", () => {
    expect(
      solve(
        [
          [0, 0],
          [0, 0],
        ],
        [0, 0],
      ).exact,
    ).toBe(true);
    const d = solve(
      [
        [0, 0],
        [0, 0],
      ],
      [1, 0],
    );
    expect(d.exact).toBe(false);
    expect(d.rank).toBe(0);
    expect(d.nullspace).toHaveLength(2);
  });
  it("does not mistake a tiny inconsistent system for an exact solution", () => {
    const d = solve([[1e-12], [1e-12]], [1e-12, 2e-12]);
    expect(d.exact).toBe(false);
    expect(d.solution[0]).toBeCloseTo(1.5);
  });
});
