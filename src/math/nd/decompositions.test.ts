import { describe, expect, it } from "vitest";
import {
  absComplex,
  classifyComplexOperator,
  complex,
  rightPolarDecompositionReal,
  spectralDecomposeNormal,
  svdRealMatrix,
} from "./index";

describe("real decomposition adapters", () => {
  it("decomposes 1D and rectangular 2D/3D matrices", () => {
    const scalar = svdRealMatrix([[-4]]);
    expect(scalar.singularValues[0]).toBeCloseTo(4);
    expect(scalar.rank).toBe(1);
    expect(scalar.reconstructionResidual).toBeLessThan(1e-12);

    for (const matrix of [
      [
        [1, 2],
        [3, 4],
        [5, 6],
      ],
      [
        [1, 2, 3],
        [4, 5, 6],
      ],
    ] as const) {
      const result = svdRealMatrix(matrix);
      expect(result.rank).toBe(2);
      expect(result.singularValues).toHaveLength(2);
      expect(result.reconstructionResidual).toBeLessThan(1e-12);
      expect(result.orthogonalityResidual).toBeLessThan(1e-12);
    }
  });

  it("reports rank deficiency and scale-aware ill conditioning", () => {
    const deficient = svdRealMatrix([
      [1, 2, 3],
      [2, 4, 6],
    ]);
    expect(deficient.rank).toBe(1);
    expect(deficient.condition).toBe(Infinity);
    expect(deficient.reconstructionResidual).toBeLessThan(1e-12);

    const illConditioned = svdRealMatrix([
      [1, 0],
      [0, 1e-12],
    ]);
    expect(illConditioned.rank).toBe(1);
    expect(illConditioned.condition).toBe(Infinity);
  });

  it("builds a right polar decomposition A = QP", () => {
    for (const matrix of [
      [
        [1, 2],
        [3, 5],
        [0, 4],
      ],
      [
        [1, 2, 0],
        [0, 1, 3],
      ],
    ] as const) {
      const result = rightPolarDecompositionReal(matrix);
      expect(result.Q).toHaveLength(matrix.length);
      expect(result.Q[0]).toHaveLength(matrix[0].length);
      expect(result.P).toHaveLength(matrix[0].length);
      expect(result.polarReconstructionResidual).toBeLessThan(1e-12);
      expect(result.polarOrthogonalityResidual).toBeLessThan(1e-12);
      expect(result.symmetryResidual).toBeLessThan(1e-12);
    }
  });
});

describe("normal spectral decomposition adapter", () => {
  it("handles a one-dimensional normal operator", () => {
    const result = spectralDecomposeNormal([[5]]);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.classification).toMatchObject({
      dimension: 1,
      normal: true,
      selfAdjoint: true,
    });
    expect(result.eigenvalues).toEqual([complex(5)]);
    expect(result.reconstructionResidual).toBeLessThan(1e-12);
  });

  it("classifies a real rotation as normal but not self-adjoint", () => {
    const rotation = [
      [0, -1],
      [1, 0],
    ] as const;
    expect(classifyComplexOperator(rotation)).toMatchObject({
      normal: true,
      selfAdjoint: false,
    });
    const result = spectralDecomposeNormal(rotation);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.eigenvalues.map((value) => Math.abs(value.im))).toEqual([
      1, 1,
    ]);
    expect(result.reconstructionResidual).toBeLessThan(1e-10);
    expect(result.orthogonalityResidual).toBeLessThan(1e-10);
  });

  it("diagonalizes a complex Hermitian operator", () => {
    const hermitian = [
      [complex(2), complex(0, 1)],
      [complex(0, -1), complex(2)],
    ] as const;
    const result = spectralDecomposeNormal(hermitian);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.classification.selfAdjoint).toBe(true);
    expect(result.eigenvalues.map((value) => value.re)).toEqual([1, 3]);
    expect(
      result.eigenvalues.every((value) => Math.abs(value.im) < 1e-12),
    ).toBe(true);
    expect(result.eigenResidual).toBeLessThan(1e-10);
  });

  it("phase-normalizes a 3D normal eigenbasis", () => {
    const normal = [
      [complex(1, 1), complex(0), complex(0)],
      [complex(0), complex(2), complex(0)],
      [complex(0), complex(0), complex(3, -1)],
    ] as const;
    const result = spectralDecomposeNormal(normal);
    expect(result.success).toBe(true);
    if (!result.success) return;
    for (let column = 0; column < 3; column += 1) {
      const entries = result.U.map((row) => row[column]!);
      const pivot = entries.reduce((best, entry) =>
        absComplex(entry) > absComplex(best) ? entry : best,
      );
      expect(pivot.im).toBeCloseTo(0, 12);
      expect(pivot.re).toBeGreaterThanOrEqual(0);
    }
    expect(result.reconstructionResidual).toBeLessThan(1e-10);
  });

  it("stably diagonalizes a 3D normal matrix with a poorly scaled solver vector", () => {
    const normal = [
      [
        complex(-0.39086893267184014, -1.57070107368432),
        complex(-0.2275222844448, 0.013478948409599956),
        complex(-0.6454977781708799, 0.017219179445759902),
      ],
      [
        complex(-0.2275222844448, 0.013478948409599956),
        complex(0.6909969925440002, -1.6067645127880001),
        complex(0.3033630459264, -0.01797193121279994),
      ],
      [
        complex(-0.6454977781708799, 0.017219179445759902),
        complex(0.3033630459264, -0.01797193121279994),
        complex(-0.014328562072160045, -1.5807455950276799),
      ],
    ] as const;

    const result = spectralDecomposeNormal(normal);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.reconstructionResidual).toBeLessThan(1e-10);
    expect(result.orthogonalityResidual).toBeLessThan(1e-10);
    expect(result.eigenResidual).toBeLessThan(1e-10);
  });

  it("returns an explicit failure for a non-normal operator", () => {
    const result = spectralDecomposeNormal([
      [1, 1],
      [0, 1],
    ]);
    expect(result).toMatchObject({
      success: false,
      reason: "not-normal",
      classification: { normal: false, selfAdjoint: false },
    });
  });
});
