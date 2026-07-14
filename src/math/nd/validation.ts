import type {
  ComplexMatrix,
  ComplexScalar,
  ComplexVector,
  Dimension,
  MatrixShape,
  RealMatrix,
  RealVector,
} from "./types";

export const ND_EPSILON = 1e-10;

export function toDimension(value: number, label = "dimension"): Dimension {
  if (!Number.isInteger(value) || value < 1 || value > 3) {
    throw new RangeError(`${label} must be an integer between 1 and 3`);
  }
  return value as Dimension;
}

function assertFinite(value: number, label: string) {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${label} must contain only finite numbers`);
  }
}

export function validateRealVector(
  vector: RealVector,
  label = "vector",
): Dimension {
  if (!Array.isArray(vector)) {
    throw new TypeError(`${label} must be an array`);
  }
  const dimension = toDimension(vector.length, `${label} length`);
  vector.forEach((value) => assertFinite(value, label));
  return dimension;
}

export function validateRealMatrix(
  matrix: RealMatrix,
  label = "matrix",
): MatrixShape {
  if (!Array.isArray(matrix)) {
    throw new TypeError(`${label} must be an array of rows`);
  }
  const rows = toDimension(matrix.length, `${label} row count`);
  const firstRow = matrix[0];
  if (!Array.isArray(firstRow)) {
    throw new TypeError(`${label} must contain array rows`);
  }
  const columns = toDimension(firstRow.length, `${label} column count`);
  matrix.forEach((row) => {
    if (!Array.isArray(row) || row.length !== columns) {
      throw new RangeError(`${label} must be rectangular`);
    }
    row.forEach((value) => assertFinite(value, label));
  });
  return { rows, columns };
}

export function validateComplexScalar(scalar: ComplexScalar, label = "scalar") {
  if (
    scalar === null ||
    typeof scalar !== "object" ||
    typeof scalar.re !== "number" ||
    typeof scalar.im !== "number"
  ) {
    throw new TypeError(`${label} must have numeric re and im components`);
  }
  assertFinite(scalar.re, label);
  assertFinite(scalar.im, label);
}

export function validateComplexVector(
  vector: ComplexVector,
  label = "vector",
): Dimension {
  if (!Array.isArray(vector)) {
    throw new TypeError(`${label} must be an array`);
  }
  const dimension = toDimension(vector.length, `${label} length`);
  vector.forEach((value) => validateComplexScalar(value, label));
  return dimension;
}

export function validateComplexMatrix(
  matrix: ComplexMatrix,
  label = "matrix",
): MatrixShape {
  if (!Array.isArray(matrix)) {
    throw new TypeError(`${label} must be an array of rows`);
  }
  const rows = toDimension(matrix.length, `${label} row count`);
  const firstRow = matrix[0];
  if (!Array.isArray(firstRow)) {
    throw new TypeError(`${label} must contain array rows`);
  }
  const columns = toDimension(firstRow.length, `${label} column count`);
  matrix.forEach((row) => {
    if (!Array.isArray(row) || row.length !== columns) {
      throw new RangeError(`${label} must be rectangular`);
    }
    row.forEach((value) => validateComplexScalar(value, label));
  });
  return { rows, columns };
}

export function assertSameShape(left: MatrixShape, right: MatrixShape) {
  if (left.rows !== right.rows || left.columns !== right.columns) {
    throw new RangeError("matrix shapes must match");
  }
}

export function scaledTolerance(scale: number, epsilon = ND_EPSILON) {
  if (!Number.isFinite(epsilon) || epsilon < 0) {
    throw new RangeError("epsilon must be a finite non-negative number");
  }
  return Math.abs(scale) * epsilon;
}

export function normalizedResidual(numerator: number, scale: number) {
  if (numerator === 0) return 0;
  return numerator / Math.max(Number.MIN_VALUE, Math.abs(scale));
}
