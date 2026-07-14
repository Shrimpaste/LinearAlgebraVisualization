import {
  IDENTITY_MAT2,
  determinantMat2,
  maxAbsMat2,
  scaleMat2,
  traceMat2,
} from "./matrix";
import { EPSILON } from "./numeric";
import { solve2 } from "./solve";
import type { Basis2, Mat2, Vec2 } from "./types";
import {
  canonicalizeDirection,
  normalizeVec2,
  perpendicularVec2,
} from "./vector";

export interface RealEigenpair {
  readonly value: number;
  readonly vector: Vec2;
  readonly algebraicMultiplicity: 1;
  readonly geometricMultiplicity: 1;
}

export interface ComplexEigenvalue {
  readonly real: number;
  readonly imaginary: number;
}

interface EigenAnalysisBase {
  readonly trace: number;
  readonly determinant: number;
  readonly discriminant: number;
  /** Coefficients of x^2 - trace*x + determinant. */
  readonly characteristicPolynomial: readonly [1, number, number];
}

export interface TwoRealEigenAnalysis extends EigenAnalysisBase {
  readonly kind: "two-real";
  readonly eigenpairs: readonly [RealEigenpair, RealEigenpair];
  readonly isDiagonalizableOverReal: true;
}

export interface RepeatedEigenAnalysis extends EigenAnalysisBase {
  readonly kind: "repeated";
  readonly eigenvalue: number;
  readonly algebraicMultiplicity: 2;
  readonly geometricMultiplicity: 2;
  readonly eigenspaceBasis: Basis2;
  readonly isDiagonalizableOverReal: true;
}

export interface DefectiveEigenAnalysis extends EigenAnalysisBase {
  readonly kind: "defective";
  readonly eigenvalue: number;
  readonly algebraicMultiplicity: 2;
  readonly geometricMultiplicity: 1;
  readonly eigenvector: Vec2;
  readonly generalizedEigenvector: Vec2 | null;
  readonly isDiagonalizableOverReal: false;
}

export interface ComplexEigenAnalysis extends EigenAnalysisBase {
  readonly kind: "complex";
  readonly eigenvalues: readonly [ComplexEigenvalue, ComplexEigenvalue];
  readonly realPart: number;
  readonly imaginaryMagnitude: number;
  readonly rotationSense: "clockwise" | "counterclockwise";
  readonly isDiagonalizableOverReal: false;
}

export type EigenAnalysis =
  | TwoRealEigenAnalysis
  | RepeatedEigenAnalysis
  | DefectiveEigenAnalysis
  | ComplexEigenAnalysis;

function shiftedMatrix(matrix: Mat2, eigenvalue: number): Mat2 {
  return [matrix[0] - eigenvalue, matrix[1], matrix[2], matrix[3] - eigenvalue];
}

function eigenvectorFor(
  matrix: Mat2,
  eigenvalue: number,
  epsilon: number,
): Vec2 {
  const shifted = shiftedMatrix(matrix, eigenvalue);
  const firstRow: Vec2 = [shifted[0], shifted[1]];
  const secondRow: Vec2 = [shifted[2], shifted[3]];
  const firstNorm = Math.hypot(firstRow[0], firstRow[1]);
  const secondNorm = Math.hypot(secondRow[0], secondRow[1]);
  const row = firstNorm >= secondNorm ? firstRow : secondRow;
  const scale = Math.max(maxAbsMat2(matrix), Math.abs(eigenvalue));
  if (
    Math.hypot(row[0], row[1]) <=
    epsilon * Math.max(Number.MIN_VALUE, scale)
  ) {
    return [1, 0];
  }

  const normalized = normalizeVec2(perpendicularVec2(row), epsilon);
  return canonicalizeDirection(normalized ?? [1, 0], epsilon);
}

function stableRealEigenvalues(
  trace: number,
  determinant: number,
  root: number,
): readonly [number, number] {
  const primary = (trace + (trace >= 0 ? root : -root)) / 2;
  const secondary = primary === 0 ? trace - primary : determinant / primary;
  return primary >= secondary ? [primary, secondary] : [secondary, primary];
}

export function analyzeEigenvalues(
  matrix: Mat2,
  epsilon = EPSILON,
): EigenAnalysis {
  const trace = traceMat2(matrix);
  const determinant = determinantMat2(matrix);
  const matrixScale = maxAbsMat2(matrix);
  const normalizedMatrix: Mat2 =
    matrixScale === 0 ? [0, 0, 0, 0] : scaleMat2(matrix, 1 / matrixScale);
  const normalizedTrace = traceMat2(normalizedMatrix);
  const normalizedDeterminant = determinantMat2(normalizedMatrix);
  const normalizedDiagonalDifference =
    normalizedMatrix[0] - normalizedMatrix[3];
  const normalizedDiscriminant =
    normalizedDiagonalDifference * normalizedDiagonalDifference +
    4 * normalizedMatrix[1] * normalizedMatrix[2];
  const diagonalDifference = matrix[0] - matrix[3];
  const discriminant =
    diagonalDifference * diagonalDifference + 4 * matrix[1] * matrix[2];
  const discriminantTolerance = epsilon ** 2;
  const base: EigenAnalysisBase = {
    trace,
    determinant,
    discriminant,
    characteristicPolynomial: [1, -trace, determinant],
  };

  if (normalizedDiscriminant > discriminantTolerance) {
    const values = stableRealEigenvalues(
      normalizedTrace,
      normalizedDeterminant,
      Math.sqrt(normalizedDiscriminant),
    );
    return {
      ...base,
      kind: "two-real",
      eigenpairs: [
        {
          value: values[0] * matrixScale,
          vector: eigenvectorFor(normalizedMatrix, values[0], epsilon),
          algebraicMultiplicity: 1,
          geometricMultiplicity: 1,
        },
        {
          value: values[1] * matrixScale,
          vector: eigenvectorFor(normalizedMatrix, values[1], epsilon),
          algebraicMultiplicity: 1,
          geometricMultiplicity: 1,
        },
      ],
      isDiagonalizableOverReal: true,
    };
  }

  if (normalizedDiscriminant < -discriminantTolerance) {
    const realPart = (normalizedTrace / 2) * matrixScale;
    const imaginaryMagnitude =
      (Math.sqrt(-normalizedDiscriminant) / 2) * matrixScale;
    const rotationSignal =
      normalizedMatrix[2] !== 0 ? normalizedMatrix[2] : -normalizedMatrix[1];
    return {
      ...base,
      kind: "complex",
      eigenvalues: [
        { real: realPart, imaginary: imaginaryMagnitude },
        { real: realPart, imaginary: -imaginaryMagnitude },
      ],
      realPart,
      imaginaryMagnitude,
      rotationSense: rotationSignal >= 0 ? "counterclockwise" : "clockwise",
      isDiagonalizableOverReal: false,
    };
  }

  const normalizedEigenvalue = normalizedTrace / 2;
  const eigenvalue = normalizedEigenvalue * matrixScale;
  const difference = shiftedMatrix(matrix, eigenvalue);
  const normalizedDifference = shiftedMatrix(
    normalizedMatrix,
    normalizedEigenvalue,
  );
  const differenceScale = maxAbsMat2(normalizedDifference);
  if (differenceScale <= epsilon) {
    return {
      ...base,
      kind: "repeated",
      eigenvalue,
      algebraicMultiplicity: 2,
      geometricMultiplicity: 2,
      eigenspaceBasis: [
        [1, 0],
        [0, 1],
      ],
      isDiagonalizableOverReal: true,
    };
  }

  const eigenvector = eigenvectorFor(
    normalizedMatrix,
    normalizedEigenvalue,
    epsilon,
  );
  const generalizedSolution = solve2(difference, eigenvector, epsilon);
  return {
    ...base,
    kind: "defective",
    eigenvalue,
    algebraicMultiplicity: 2,
    geometricMultiplicity: 1,
    eigenvector,
    generalizedEigenvector:
      generalizedSolution.kind === "infinite"
        ? generalizedSolution.particular
        : generalizedSolution.kind === "unique"
          ? generalizedSolution.solution
          : null,
    isDiagonalizableOverReal: false,
  };
}

export function eigenDecompositionMatrix(analysis: EigenAnalysis): Mat2 | null {
  if (analysis.kind === "two-real") {
    const [first, second] = analysis.eigenpairs;
    return [
      first.vector[0],
      second.vector[0],
      first.vector[1],
      second.vector[1],
    ];
  }
  return analysis.kind === "repeated" ? IDENTITY_MAT2 : null;
}

export function diagonalEigenvalueMatrix(analysis: EigenAnalysis): Mat2 | null {
  if (analysis.kind === "two-real") {
    return [analysis.eigenpairs[0].value, 0, 0, analysis.eigenpairs[1].value];
  }
  return analysis.kind === "repeated"
    ? scaleMat2(IDENTITY_MAT2, analysis.eigenvalue)
    : null;
}
