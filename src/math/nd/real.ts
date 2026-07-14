import {
  Matrix,
  SingularValueDecomposition,
  determinant as mlDeterminant,
} from "ml-matrix";
import type { Dimension, RealMatrix, RealVector } from "./types";
import {
  ND_EPSILON,
  assertSameShape,
  toDimension,
  validateRealMatrix,
  validateRealVector,
} from "./validation";

interface SingularInfo {
  readonly rank: number;
  readonly condition: number;
  readonly scale: number;
  readonly normalized: Matrix;
  readonly decomposition: SingularValueDecomposition;
  readonly singularValues: readonly number[];
}

export interface RealBasisAnalysis {
  readonly dimension: Dimension;
  readonly determinant: number;
  readonly rank: number;
  readonly condition: number;
  readonly isBasis: boolean;
  readonly orientation: "positive" | "negative" | "degenerate";
}

function maxAbs(matrix: RealMatrix) {
  let scale = 0;
  matrix.forEach((row) =>
    row.forEach((value) => {
      scale = Math.max(scale, Math.abs(value));
    }),
  );
  return scale;
}

function normalizedMatrix(matrix: RealMatrix, scale: number) {
  return new Matrix(
    matrix.map((row) => row.map((value) => (scale === 0 ? 0 : value / scale))),
  );
}

function singularInfo(matrix: RealMatrix, epsilon = ND_EPSILON): SingularInfo {
  const shape = validateRealMatrix(matrix);
  const scale = maxAbs(matrix);
  const normalized = normalizedMatrix(matrix, scale);
  const decomposition = new SingularValueDecomposition(normalized, {
    autoTranspose: true,
  });
  const singularValues = decomposition.diagonal;
  const largest = singularValues[0] ?? 0;
  const threshold = epsilon * Math.max(shape.rows, shape.columns) * largest;
  const rank = singularValues.filter((value) => value > threshold).length;
  const smallest = singularValues[singularValues.length - 1] ?? 0;
  const fullRank = rank === Math.min(shape.rows, shape.columns);
  const condition = fullRank && smallest > 0 ? largest / smallest : Infinity;
  return {
    rank,
    condition,
    scale,
    normalized,
    decomposition,
    singularValues,
  };
}

export function zeroRealVector(dimension: Dimension): RealVector {
  return Array.from({ length: toDimension(dimension) }, () => 0);
}

export function zeroRealMatrix(
  rows: Dimension,
  columns: Dimension = rows,
): RealMatrix {
  const rowCount = toDimension(rows, "row count");
  const columnCount = toDimension(columns, "column count");
  return Array.from({ length: rowCount }, () =>
    Array.from({ length: columnCount }, () => 0),
  );
}

export function identityRealMatrix(dimension: Dimension): RealMatrix {
  const size = toDimension(dimension);
  return Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, column) => (row === column ? 1 : 0)),
  );
}

export function resizeRealVector(
  vector: RealVector,
  dimension: Dimension,
  fill = 0,
): RealVector {
  validateRealVector(vector);
  if (!Number.isFinite(fill)) throw new TypeError("fill must be finite");
  const size = toDimension(dimension);
  return Array.from({ length: size }, (_, index) => vector[index] ?? fill);
}

export function resizeRealMatrix(
  matrix: RealMatrix,
  rows: Dimension,
  columns: Dimension = rows,
  fill = 0,
): RealMatrix {
  validateRealMatrix(matrix);
  if (!Number.isFinite(fill)) throw new TypeError("fill must be finite");
  const rowCount = toDimension(rows, "row count");
  const columnCount = toDimension(columns, "column count");
  return Array.from({ length: rowCount }, (_, row) =>
    Array.from(
      { length: columnCount },
      (_, column) => matrix[row]?.[column] ?? fill,
    ),
  );
}

export function multiplyRealMatrices(
  left: RealMatrix,
  right: RealMatrix,
): RealMatrix {
  const leftShape = validateRealMatrix(left, "left matrix");
  const rightShape = validateRealMatrix(right, "right matrix");
  if (leftShape.columns !== rightShape.rows) {
    throw new RangeError("inner matrix dimensions must match");
  }
  return Array.from({ length: leftShape.rows }, (_, row) =>
    Array.from({ length: rightShape.columns }, (_, column) => {
      let value = 0;
      for (let index = 0; index < leftShape.columns; index += 1) {
        value += left[row]![index]! * right[index]![column]!;
      }
      return value;
    }),
  );
}

export function applyRealMatrix(
  matrix: RealMatrix,
  vector: RealVector,
): RealVector {
  const shape = validateRealMatrix(matrix);
  const dimension = validateRealVector(vector);
  if (shape.columns !== dimension) {
    throw new RangeError("matrix columns must match vector length");
  }
  return matrix.map((row) =>
    row.reduce((sum, value, index) => sum + value * vector[index]!, 0),
  );
}

export function transposeRealMatrix(matrix: RealMatrix): RealMatrix {
  const shape = validateRealMatrix(matrix);
  return Array.from({ length: shape.columns }, (_, row) =>
    Array.from({ length: shape.rows }, (_, column) => matrix[column]![row]!),
  );
}

export function interpolateRealMatrices(
  from: RealMatrix,
  to: RealMatrix,
  amount: number,
): RealMatrix {
  const fromShape = validateRealMatrix(from, "from matrix");
  const toShape = validateRealMatrix(to, "to matrix");
  assertSameShape(fromShape, toShape);
  if (!Number.isFinite(amount)) throw new TypeError("amount must be finite");
  return from.map((row, rowIndex) =>
    row.map(
      (value, columnIndex) =>
        value + (to[rowIndex]![columnIndex]! - value) * amount,
    ),
  );
}

export function determinantRealMatrix(matrix: RealMatrix): number {
  const shape = validateRealMatrix(matrix);
  if (shape.rows !== shape.columns) {
    throw new RangeError("determinant requires a square matrix");
  }
  const scale = maxAbs(matrix);
  if (scale === 0) return 0;
  return mlDeterminant(normalizedMatrix(matrix, scale)) * scale ** shape.rows;
}

export function inverseRealMatrix(
  matrix: RealMatrix,
  epsilon = ND_EPSILON,
): RealMatrix | null {
  const shape = validateRealMatrix(matrix);
  if (shape.rows !== shape.columns) {
    throw new RangeError("inverse requires a square matrix");
  }
  const info = singularInfo(matrix, epsilon);
  if (info.rank !== shape.rows || info.scale === 0) return null;
  return info.decomposition
    .inverse()
    .mul(1 / info.scale)
    .to2DArray();
}

export function rankRealMatrix(matrix: RealMatrix, epsilon = ND_EPSILON) {
  return singularInfo(matrix, epsilon).rank;
}

export function conditionNumberRealMatrix(
  matrix: RealMatrix,
  epsilon = ND_EPSILON,
) {
  return singularInfo(matrix, epsilon).condition;
}

export function analyzeRealBasis(
  basis: RealMatrix,
  epsilon = ND_EPSILON,
): RealBasisAnalysis {
  const shape = validateRealMatrix(basis, "basis");
  if (shape.rows !== shape.columns) {
    throw new RangeError("a basis matrix must be square");
  }
  const info = singularInfo(basis, epsilon);
  const normalizedDeterminant = mlDeterminant(info.normalized);
  const determinant =
    info.scale === 0 ? 0 : normalizedDeterminant * info.scale ** shape.rows;
  const isBasis = info.rank === shape.rows;
  return {
    dimension: shape.rows,
    determinant,
    rank: info.rank,
    condition: info.condition,
    isBasis,
    orientation: !isBasis
      ? "degenerate"
      : normalizedDeterminant < 0
        ? "negative"
        : "positive",
  };
}

/** Converts a coordinate map A into standard coordinates as C A B^-1. */
export function effectiveRealMap(
  coordinateMap: RealMatrix,
  domainBasis: RealMatrix,
  codomainBasis: RealMatrix = domainBasis,
  epsilon = ND_EPSILON,
): RealMatrix | null {
  const mapShape = validateRealMatrix(coordinateMap, "coordinate map");
  const domainShape = validateRealMatrix(domainBasis, "domain basis");
  const codomainShape = validateRealMatrix(codomainBasis, "codomain basis");
  if (
    domainShape.rows !== domainShape.columns ||
    codomainShape.rows !== codomainShape.columns ||
    domainShape.rows !== mapShape.columns ||
    codomainShape.rows !== mapShape.rows
  ) {
    throw new RangeError(
      "domain and codomain bases must match the map's input and output dimensions",
    );
  }
  const inverseDomain = inverseRealMatrix(domainBasis, epsilon);
  if (
    inverseDomain === null ||
    !analyzeRealBasis(codomainBasis, epsilon).isBasis
  ) {
    return null;
  }
  return multiplyRealMatrices(
    multiplyRealMatrices(codomainBasis, coordinateMap),
    inverseDomain,
  );
}
