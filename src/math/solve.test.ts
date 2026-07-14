import { describe, expect, it } from "vitest";
import { applyMat2, solve2 } from "./index";

describe("solve2", () => {
  it("solves a full-rank system and exposes a residual", () => {
    const matrix = [2, 1, 1, -1] as const;
    const result = solve2(matrix, [7, 2]);
    expect(result.kind).toBe("unique");
    if (result.kind !== "unique") return;
    expect(result.solution[0]).toBeCloseTo(3);
    expect(result.solution[1]).toBeCloseTo(1);
    expect(result.coefficientRank).toBe(2);
    expect(result.residualNorm).toBeLessThan(1e-12);
    expect(applyMat2(matrix, result.solution)).toEqual([7, 2]);
  });

  it("describes a consistent rank-one solution line", () => {
    const matrix = [1, 2, 2, 4] as const;
    const result = solve2(matrix, [5, 10]);
    expect(result.kind).toBe("infinite");
    if (result.kind !== "infinite") return;
    expect(result.coefficientRank).toBe(1);
    expect(result.augmentedRank).toBe(1);
    expect(result.nullspaceBasis).toHaveLength(1);
    expect(result.residualNorm).toBeLessThan(1e-12);
    expect(applyMat2(matrix, result.nullspaceBasis[0]!)[0]).toBeCloseTo(0);
    expect(applyMat2(matrix, result.particular)).toEqual([5, 10]);
  });

  it("detects inconsistent rank-one systems", () => {
    const result = solve2([1, 2, 2, 4], [5, 11]);
    expect(result.kind).toBe("none");
    if (result.kind !== "none") return;
    expect(result.coefficientRank).toBe(1);
    expect(result.augmentedRank).toBe(2);
    expect(result.inconsistency).toBeGreaterThan(0);
  });

  it("handles the zero operator with zero or nonzero right-hand sides", () => {
    const allSolutions = solve2([0, 0, 0, 0], [0, 0]);
    expect(allSolutions.kind).toBe("infinite");
    if (allSolutions.kind === "infinite") {
      expect(allSolutions.nullspaceBasis).toEqual([
        [1, 0],
        [0, 1],
      ]);
      expect(allSolutions.coefficientRank).toBe(0);
    }

    const noSolutions = solve2([0, 0, 0, 0], [0, 1]);
    expect(noSolutions.kind).toBe("none");
    if (noSolutions.kind === "none") {
      expect(noSolutions.augmentedRank).toBe(1);
    }
  });

  it("remains scale-independent for small, well-conditioned systems", () => {
    const result = solve2([2e-100, 0, 0, 4e-100], [6e-100, 8e-100]);
    expect(result.kind).toBe("unique");
    if (result.kind === "unique") {
      expect(result.solution[0]).toBeCloseTo(3);
      expect(result.solution[1]).toBeCloseTo(2);
    }
  });

  it("keeps an ill-conditioned but algebraically full-rank system unique", () => {
    const matrix = [2e6, 2e6, 2e6, 2_000_000.0001] as const;
    const target = applyMat2(matrix, [-1, 1]);
    const result = solve2(matrix, target);

    expect(result.kind).toBe("unique");
    if (result.kind === "unique") {
      expect(result.solution[0]).toBeCloseTo(-1, 5);
      expect(result.solution[1]).toBeCloseTo(1, 5);
    }
  });
});
