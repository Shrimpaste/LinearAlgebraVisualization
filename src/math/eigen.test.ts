import { describe, expect, it } from "vitest";
import {
  analyzeEigenvalues,
  applyMat2,
  diagonalEigenvalueMatrix,
  eigenDecompositionMatrix,
  multiplyMat2,
  nearlyEqualMat2,
  scaleVec2,
} from "./index";

describe("2D eigen analysis", () => {
  it("finds two real eigenpairs and satisfies A v = lambda v", () => {
    const matrix = [3, 1, 0, 2] as const;
    const analysis = analyzeEigenvalues(matrix);
    expect(analysis.kind).toBe("two-real");
    if (analysis.kind !== "two-real") return;
    expect(analysis.eigenpairs.map(({ value }) => value)).toEqual([3, 2]);
    analysis.eigenpairs.forEach(({ value, vector }) => {
      const transformed = applyMat2(matrix, vector);
      const expected = scaleVec2(vector, value);
      expect(transformed[0]).toBeCloseTo(expected[0], 10);
      expect(transformed[1]).toBeCloseTo(expected[1], 10);
    });
    const eigenvectors = eigenDecompositionMatrix(analysis);
    const diagonal = diagonalEigenvalueMatrix(analysis);
    expect(eigenvectors).not.toBeNull();
    expect(diagonal).not.toBeNull();
    expect(
      nearlyEqualMat2(
        multiplyMat2(matrix, eigenvectors!),
        multiplyMat2(eigenvectors!, diagonal!),
      ),
    ).toBe(true);
  });

  it("distinguishes a repeated scalar operator from a defective operator", () => {
    const repeated = analyzeEigenvalues([4, 0, 0, 4]);
    expect(repeated).toMatchObject({
      kind: "repeated",
      eigenvalue: 4,
      algebraicMultiplicity: 2,
      geometricMultiplicity: 2,
      isDiagonalizableOverReal: true,
    });

    const defective = analyzeEigenvalues([3, 1, 0, 3]);
    expect(defective.kind).toBe("defective");
    if (defective.kind !== "defective") return;
    expect(defective.eigenvalue).toBe(3);
    expect(defective.geometricMultiplicity).toBe(1);
    expect(defective.eigenvector).toEqual([1, 0]);
    expect(defective.generalizedEigenvector).not.toBeNull();
    const shifted = [0, 1, 0, 0] as const;
    const mapped = applyMat2(shifted, defective.generalizedEigenvector!);
    expect(mapped[0]).toBeCloseTo(defective.eigenvector[0]);
    expect(mapped[1]).toBeCloseTo(defective.eigenvector[1]);
  });

  it("reports complex conjugate eigenvalues and rotation sense", () => {
    const counterclockwise = analyzeEigenvalues([0, -1, 1, 0]);
    expect(counterclockwise).toMatchObject({
      kind: "complex",
      realPart: 0,
      imaginaryMagnitude: 1,
      rotationSense: "counterclockwise",
      isDiagonalizableOverReal: false,
    });
    if (counterclockwise.kind === "complex") {
      expect(counterclockwise.eigenvalues).toEqual([
        { real: 0, imaginary: 1 },
        { real: 0, imaginary: -1 },
      ]);
    }
    expect(analyzeEigenvalues([0, 1, -1, 0])).toMatchObject({
      kind: "complex",
      rotationSense: "clockwise",
    });
  });

  it("resolves a small complex pair on top of a large scalar component", () => {
    const analysis = analyzeEigenvalues([100, -0.0001, 0.0001, 100]);

    expect(analysis.kind).toBe("complex");
    if (analysis.kind === "complex") {
      expect(analysis.realPart).toBeCloseTo(100, 10);
      expect(analysis.imaginaryMagnitude).toBeCloseTo(0.0001, 10);
    }
  });

  it("classifies the same rotation at extreme finite scales", () => {
    for (const scale of [1e-200, 1e200]) {
      const analysis = analyzeEigenvalues([0, -scale, scale, 0]);
      expect(analysis.kind).toBe("complex");
      if (analysis.kind === "complex") {
        expect(analysis.realPart).toBe(0);
        expect(analysis.imaginaryMagnitude).toBe(scale);
      }
    }
  });

  it("resolves nearby but distinct real eigenvalues", () => {
    const analysis = analyzeEigenvalues([100, 0.0001, 0, 100.0001]);

    expect(analysis.kind).toBe("two-real");
    if (analysis.kind === "two-real") {
      expect(analysis.eigenpairs[0].value).toBeCloseTo(100.0001, 8);
      expect(analysis.eigenpairs[1].value).toBeCloseTo(100, 8);
    }
  });

  it("uses a cancellation-resistant formula for separated real roots", () => {
    const analysis = analyzeEigenvalues([1e12, 0, 0, 1]);
    expect(analysis.kind).toBe("two-real");
    if (analysis.kind === "two-real") {
      expect(analysis.eigenpairs[0].value).toBe(1e12);
      expect(analysis.eigenpairs[1].value).toBe(1);
    }
  });
});
