import { describe, expect, it } from "vitest";
import { applyRealMatrix, solveRealEigensystem } from "./index";

describe("certified 1-3D real eigensolver adapter", () => {
  it("solves 1D deterministically with JSON-safe output", () => {
    const result = solveRealEigensystem([[-2]]);
    expect(result).toMatchObject({
      dimension: 1,
      status: "real-eigenbasis",
      eigenvalues: [{ re: -2, im: 0 }],
    });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("certifies residuals and canonicalizes signs in 2D", () => {
    const matrix = [
      [2, 1],
      [1, 2],
    ];
    const first = solveRealEigensystem(matrix);
    const second = solveRealEigensystem(matrix);
    expect(first).toEqual(second);
    expect(first.status).toBe("real-eigenbasis");
    first.realEigenpairs.forEach((pair) => {
      const mapped = applyRealMatrix(matrix, pair.vector);
      pair.vector.forEach((entry, index) =>
        expect(mapped[index]).toBeCloseTo(pair.value * entry, 10),
      );
      expect(pair.residual).toBeLessThan(1e-10);
      const pivot = pair.vector.reduce(
        (best, value, index) =>
          Math.abs(value) > Math.abs(pair.vector[best]!) ? index : best,
        0,
      );
      expect(pair.vector[pivot]).toBeGreaterThan(0);
    });
  });

  it("certifies a nonsymmetric 3D eigenbasis", () => {
    const result = solveRealEigensystem([
      [4, 1, 0],
      [0, 2, 1],
      [0, 0, -1],
    ]);
    expect(result.status).toBe("real-eigenbasis");
    expect(result.realEigenpairs.map((pair) => pair.value)).toEqual([4, 2, -1]);
    expect(result.eigenbasisCoordinates).not.toBeNull();
  });

  it("keeps certified eigenpairs stable across finite input scales", () => {
    for (const scale of [1e-9, 1, 1e8]) {
      const result = solveRealEigensystem([
        [2 * scale, scale],
        [scale, 2 * scale],
      ]);
      expect(result.status).toBe("real-eigenbasis");
      expect(result.eigenvalues[0]?.re).toBeCloseTo(3 * scale, 12);
      expect(result.eigenvalues[1]?.re).toBeCloseTo(scale, 12);
      expect(result.eigenvalues.every((value) => value.im === 0)).toBe(true);
      expect(result.eigenbasisCoordinates).not.toBeNull();
      result.realEigenpairs.forEach((pair) =>
        expect(pair.residual).toBeLessThan(1e-10),
      );
    }
  });

  it("does not manufacture a basis for defective matrices", () => {
    const result = solveRealEigensystem([
      [2, 1, 0],
      [0, 2, 0],
      [0, 0, -1],
    ]);
    expect(result.status).toBe("defective");
    expect(result.realEigenbasis).toBeNull();
    expect(result.eigenbasisCoordinates).toBeNull();
  });

  it("preserves complex values textually and emits no fake real pairs", () => {
    const result = solveRealEigensystem([
      [0, -1, 0],
      [1, 0, 0],
      [0, 0, 3],
    ]);
    expect(result.status).toBe("complex");
    expect(result.eigenvalues).toEqual([
      { re: 3, im: 0 },
      { re: 0, im: 1 },
      { re: 0, im: -1 },
    ]);
    expect(result.realEigenpairs).toHaveLength(1);
    expect(result.realEigenbasis).toBeNull();
  });
});
