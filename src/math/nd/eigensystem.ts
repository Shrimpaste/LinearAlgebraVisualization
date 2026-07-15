import { EigenvalueDecomposition, Matrix } from "ml-matrix";
import type { ComplexScalar, Dimension, RealMatrix, RealVector } from "./types";
import {
  applyRealMatrix,
  inverseRealMatrix,
  multiplyRealMatrices,
  rankRealMatrix,
} from "./real";
import { ND_EPSILON, validateRealMatrix } from "./validation";

export interface CertifiedRealEigenpair {
  readonly value: number;
  readonly vector: RealVector;
  readonly residual: number;
}

export interface RealEigensystemResult {
  readonly dimension: Dimension;
  readonly eigenvalues: readonly ComplexScalar[];
  readonly realEigenpairs: readonly CertifiedRealEigenpair[];
  readonly realEigenbasis: RealMatrix | null;
  readonly eigenbasisCoordinates: RealMatrix | null;
  readonly eigenbasisResidual: number | null;
  readonly status: "real-eigenbasis" | "defective" | "complex" | "uncertified";
}

function clean(value: number, tolerance: number) {
  if (!Number.isFinite(value))
    throw new Error("eigensolver returned a non-finite value");
  return Math.abs(value) <= tolerance ? 0 : Number(value.toPrecision(15));
}

function norm(vector: readonly number[]) {
  return Math.hypot(...vector);
}

function maxAbs(matrix: RealMatrix) {
  return Math.max(0, ...matrix.flatMap((row) => row.map(Math.abs)));
}

function canonicalize(
  vector: readonly number[],
  tolerance: number,
): RealVector | null {
  const length = norm(vector);
  if (!Number.isFinite(length) || length <= tolerance) return null;
  const normalized = vector.map((value) => value / length);
  let pivot = 0;
  normalized.forEach((value, index) => {
    if (Math.abs(value) > Math.abs(normalized[pivot]!)) pivot = index;
  });
  const sign = normalized[pivot]! < 0 ? -1 : 1;
  return normalized.map((value) => clean(value * sign, tolerance));
}

function residual(
  matrix: RealMatrix,
  value: number,
  vector: RealVector,
  matrixScale: number,
) {
  const mapped = applyRealMatrix(matrix, vector);
  const difference = mapped.map(
    (entry, index) => entry - value * vector[index]!,
  );
  return (
    norm(difference) / Math.max(Number.MIN_VALUE, matrixScale + Math.abs(value))
  );
}

function columnsMatrix(columns: readonly RealVector[]): RealMatrix {
  return Array.from({ length: columns[0]?.length ?? 0 }, (_, row) =>
    columns.map((column) => column[row]!),
  );
}

function diagonalizationResidual(
  coordinates: RealMatrix,
  eigenpairs: readonly CertifiedRealEigenpair[],
  matrixScale: number,
) {
  const error = Math.max(
    ...coordinates.flatMap((row, rowIndex) =>
      row.map((value, columnIndex) =>
        Math.abs(
          value - (rowIndex === columnIndex ? eigenpairs[rowIndex]!.value : 0),
        ),
      ),
    ),
  );
  const scale = Math.max(
    Number.MIN_VALUE,
    matrixScale,
    ...eigenpairs.map((pair) => Math.abs(pair.value)),
  );
  return error / scale;
}

/** Deterministic, JSON-safe eigensolver for real 1-3D endomorphisms. */
export function solveRealEigensystem(
  matrix: RealMatrix,
  epsilon = ND_EPSILON,
): RealEigensystemResult {
  const shape = validateRealMatrix(matrix, "operator matrix");
  if (shape.rows !== shape.columns)
    throw new RangeError("eigensystems require a square matrix");
  const dimension = shape.rows;
  const matrixScale = maxAbs(matrix);
  const solverScale = matrixScale === 0 ? 1 : matrixScale;
  const tolerance = Math.max(epsilon * 100, Number.EPSILON * 512);
  const eigenvalueTolerance = tolerance * solverScale;
  const decomposition = new EigenvalueDecomposition(
    new Matrix(matrix.map((row) => row.map((value) => value / solverScale))),
  );
  const vectors = decomposition.eigenvectorMatrix.to2DArray();
  const eigenvalues = decomposition.realEigenvalues.map((re, index) => ({
    re: clean(re * solverScale, eigenvalueTolerance),
    im: clean(
      decomposition.imaginaryEigenvalues[index]! * solverScale,
      eigenvalueTolerance,
    ),
  }));
  const realEigenpairs: CertifiedRealEigenpair[] = [];

  eigenvalues.forEach((value, column) => {
    if (value.im !== 0) return;
    const vector = canonicalize(
      Array.from({ length: dimension }, (_, row) => vectors[row]![column]!),
      tolerance,
    );
    if (!vector) return;
    const pairResidual = residual(matrix, value.re, vector, matrixScale);
    if (pairResidual <= tolerance) {
      realEigenpairs.push({ value: value.re, vector, residual: pairResidual });
    }
  });

  // ml-matrix returns eigenpairs in solver order; impose a stable public order.
  realEigenpairs.sort((left, right) =>
    right.value !== left.value
      ? right.value - left.value
      : left.vector.findIndex((value) => value !== 0) -
        right.vector.findIndex((value) => value !== 0),
  );
  eigenvalues.sort((left, right) =>
    right.re !== left.re ? right.re - left.re : right.im - left.im,
  );

  const candidate =
    realEigenpairs.length === dimension
      ? columnsMatrix(realEigenpairs.map((pair) => pair.vector))
      : null;
  const inverse =
    candidate !== null && rankRealMatrix(candidate, epsilon * 100) === dimension
      ? inverseRealMatrix(candidate)
      : null;
  const candidateCoordinates =
    candidate && inverse
      ? multiplyRealMatrices(multiplyRealMatrices(inverse, matrix), candidate)
      : null;
  const eigenbasisResidual = candidateCoordinates
    ? Math.max(
        ...realEigenpairs.map((pair) => pair.residual),
        diagonalizationResidual(
          candidateCoordinates,
          realEigenpairs,
          matrixScale,
        ),
      )
    : null;
  const realEigenbasis =
    candidate &&
    candidateCoordinates &&
    (eigenbasisResidual ?? Infinity) <= tolerance
      ? candidate
      : null;
  const eigenbasisCoordinates = realEigenbasis ? candidateCoordinates : null;
  const hasComplex = eigenvalues.some((value) => value.im !== 0);

  return {
    dimension,
    eigenvalues,
    realEigenpairs,
    realEigenbasis,
    eigenbasisCoordinates,
    eigenbasisResidual,
    status: realEigenbasis
      ? "real-eigenbasis"
      : hasComplex
        ? "complex"
        : candidateCoordinates
          ? "uncertified"
          : realEigenpairs.length > 0
            ? "defective"
            : "uncertified",
  };
}
