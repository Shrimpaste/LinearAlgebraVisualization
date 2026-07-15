import { EPSILON } from "../../math";
import type { Dimension, RealMatrix, RealVector } from "../../math/nd";

export type SpanVectorCount = 1 | 2 | 3 | 4 | 5 | 6;
export type SpanRank = 0 | 1 | 2 | 3;

export interface SpanState {
  readonly version: 2;
  readonly dimension: Dimension;
  readonly vectors: readonly RealVector[];
  readonly coefficients: readonly number[];
  readonly target: RealVector;
  readonly showLattice: boolean;
  readonly showTarget: boolean;
}

const vectorSeeds: readonly RealVector[] = [
  [1.8, 0.65, 0.4],
  [-0.45, 1.55, 0.7],
  [1.1, -0.8, 1.35],
  [-1.25, -0.35, 0.55],
  [0.35, 1.75, -0.8],
  [1.55, 0.15, -1.1],
];

export const spanDefaults: SpanState = {
  version: 2,
  dimension: 2,
  vectors: vectorSeeds.slice(0, 2).map((vector) => vector.slice(0, 2)),
  coefficients: [1.1, 0.85],
  target: [-1.1, 2.1],
  showLattice: true,
  showTarget: true,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function finiteNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toDimension(value: unknown, fallback: Dimension = 2): Dimension {
  return value === 1 || value === 2 || value === 3 ? value : fallback;
}

function vectorCount(value: number): SpanVectorCount {
  return Math.min(6, Math.max(1, Math.trunc(value))) as SpanVectorCount;
}

function seedVector(index: number, dimension: Dimension): RealVector {
  return Array.from(
    { length: dimension },
    (_, component) => vectorSeeds[index]?.[component] ?? 0,
  );
}

function coerceVector(
  value: unknown,
  fallback: RealVector,
  dimension: Dimension,
): RealVector {
  const source = Array.isArray(value) ? value : [];
  return Array.from({ length: dimension }, (_, index) =>
    finiteNumber(source[index], fallback[index] ?? 0),
  );
}

function normalizeVectors(
  value: unknown,
  dimension: Dimension,
): readonly RealVector[] {
  const source =
    Array.isArray(value) && value.length > 0 ? value : spanDefaults.vectors;
  const count = vectorCount(source.length);
  return Array.from({ length: count }, (_, index) =>
    coerceVector(source[index], seedVector(index, dimension), dimension),
  );
}

function normalizeCoefficients(
  value: unknown,
  count: SpanVectorCount,
  fallback: readonly number[] = [],
) {
  const source = Array.isArray(value) ? value : [];
  return Array.from({ length: count }, (_, index) =>
    finiteNumber(source[index], fallback[index] ?? (index < 2 ? 1 : 0)),
  );
}

function migrateLegacySpanState(record: Record<string, unknown>): SpanState {
  const dimension: Dimension = 2;
  const vectors = [
    coerceVector(record.first, spanDefaults.vectors[0]!, dimension),
    coerceVector(record.second, spanDefaults.vectors[1]!, dimension),
  ];
  const coefficientRecord = asRecord(record.coefficient);
  const legacyCoefficients = Array.isArray(record.coefficients)
    ? record.coefficients
    : Array.isArray(record.coefficient)
      ? record.coefficient
      : [
          record.alpha ?? coefficientRecord?.alpha ?? record.coefficient,
          record.beta ?? coefficientRecord?.beta,
        ];
  return {
    version: 2,
    dimension,
    vectors,
    coefficients: normalizeCoefficients(legacyCoefficients, 2, [1.1, 0.85]),
    target: coerceVector(record.target, spanDefaults.target, dimension),
    showLattice:
      typeof record.showLattice === "boolean"
        ? record.showLattice
        : spanDefaults.showLattice,
    showTarget:
      typeof record.showTarget === "boolean"
        ? record.showTarget
        : spanDefaults.showTarget,
  };
}

export function migrateSpanState(stored: unknown): SpanState {
  const record = asRecord(stored);
  if (!record) return spanDefaults;
  if (record.version === undefined || record.version === 0) {
    return migrateLegacySpanState(record);
  }
  if (record.version !== 1 && record.version !== 2) return spanDefaults;

  const dimension = toDimension(record.dimension, 2);
  const vectors = normalizeVectors(record.vectors, dimension);
  const count = vectorCount(vectors.length);
  return {
    version: 2,
    dimension,
    vectors,
    coefficients: normalizeCoefficients(
      record.coefficients,
      count,
      spanDefaults.coefficients,
    ),
    target: coerceVector(record.target, spanDefaults.target, dimension),
    showLattice:
      typeof record.showLattice === "boolean"
        ? record.showLattice
        : spanDefaults.showLattice,
    showTarget:
      typeof record.showTarget === "boolean"
        ? record.showTarget
        : spanDefaults.showTarget,
  };
}

export function resizeSpanState(
  state: SpanState,
  count: SpanVectorCount,
): SpanState {
  return {
    ...state,
    vectors: Array.from(
      { length: count },
      (_, index) => state.vectors[index] ?? seedVector(index, state.dimension),
    ),
    coefficients: Array.from(
      { length: count },
      (_, index) => state.coefficients[index] ?? 0,
    ),
  };
}

export function resizeSpanDimension(
  state: SpanState,
  dimension: Dimension,
): SpanState {
  return {
    ...state,
    dimension,
    vectors: state.vectors.map((vector, index) =>
      Array.from(
        { length: dimension },
        (_, component) =>
          vector[component] ?? vectorSeeds[index]?.[component] ?? 0,
      ),
    ),
    target: Array.from(
      { length: dimension },
      (_, component) =>
        state.target[component] ?? spanDefaults.target[component] ?? 0,
    ),
  };
}

function maxComponent(vector: RealVector) {
  return vector.reduce(
    (maximum, value) => Math.max(maximum, Math.abs(value)),
    0,
  );
}

function normalized(vector: RealVector): number[] | null {
  const scale = maxComponent(vector);
  return scale === 0 ? null : vector.map((value) => value / scale);
}

function dot(left: readonly number[], right: readonly number[]) {
  return left.reduce(
    (sum, value, index) => sum + value * (right[index] ?? 0),
    0,
  );
}

/** Input-order greedy maximal independent subset with per-vector scale normalization. */
export function selectSpanBasisIndices(
  vectors: readonly RealVector[],
  dimension: Dimension = (vectors[0]?.length ?? 2) as Dimension,
) {
  const basisIndices: number[] = [];
  const orthonormal: number[][] = [];
  for (
    let index = 0;
    index < vectors.length && basisIndices.length < dimension;
    index += 1
  ) {
    const candidate = normalized(vectors[index]!);
    if (!candidate) continue;
    const residual = [...candidate];
    for (const direction of orthonormal) {
      const projection = dot(residual, direction);
      for (let component = 0; component < dimension; component += 1) {
        residual[component] =
          (residual[component] ?? 0) - projection * (direction[component] ?? 0);
      }
    }
    const length = Math.hypot(...residual);
    if (length <= EPSILON) continue;
    orthonormal.push(residual.map((value) => value / length));
    basisIndices.push(index);
  }
  return basisIndices as readonly number[];
}

function solveBasisCoordinates(
  basis: readonly RealVector[],
  target: RealVector,
): readonly number[] | null {
  if (basis.length === 0) {
    return maxComponent(target) === 0 ? [] : null;
  }
  const rows = target.length;
  const columns = basis.length;
  const augmented = Array.from({ length: rows }, (_, row) => [
    ...basis.map((vector) => vector[row] ?? 0),
    target[row] ?? 0,
  ]);
  let pivotRow = 0;
  const pivots: number[] = [];
  for (let column = 0; column < columns && pivotRow < rows; column += 1) {
    let best = pivotRow;
    for (let row = pivotRow + 1; row < rows; row += 1) {
      if (
        Math.abs(augmented[row]![column]!) > Math.abs(augmented[best]![column]!)
      )
        best = row;
    }
    if (augmented[best]![column] === 0) continue;
    [augmented[pivotRow], augmented[best]] = [
      augmented[best]!,
      augmented[pivotRow]!,
    ];
    const pivot = augmented[pivotRow]![column]!;
    for (let entry = column; entry <= columns; entry += 1)
      augmented[pivotRow]![entry]! /= pivot;
    for (let row = 0; row < rows; row += 1) {
      if (row === pivotRow) continue;
      const factor = augmented[row]![column]!;
      for (let entry = column; entry <= columns; entry += 1) {
        augmented[row]![entry]! -= factor * augmented[pivotRow]![entry]!;
      }
    }
    pivots.push(column);
    pivotRow += 1;
  }
  const solution = Array.from({ length: columns }, () => 0);
  pivots.forEach((column, row) => {
    solution[column] = augmented[row]![columns]!;
  });
  const reconstructed = Array.from({ length: rows }, (_, row) =>
    basis.reduce(
      (sum, vector, column) => sum + (vector[row] ?? 0) * solution[column]!,
      0,
    ),
  );
  const scale = Math.max(
    maxComponent(target),
    ...basis.map(maxComponent),
    Number.MIN_VALUE,
  );
  const error = Math.max(
    ...reconstructed.map((value, index) =>
      Math.abs(value - (target[index] ?? 0)),
    ),
  );
  return error <= EPSILON * scale * 8 ? solution : null;
}

function determinant(matrix: RealMatrix): number | null {
  if (matrix.length !== matrix[0]?.length) return null;
  if (matrix.length === 1) return matrix[0]![0] ?? 0;
  if (matrix.length === 2)
    return matrix[0]![0]! * matrix[1]![1]! - matrix[0]![1]! * matrix[1]![0]!;
  return (
    matrix[0]![0]! *
      (matrix[1]![1]! * matrix[2]![2]! - matrix[1]![2]! * matrix[2]![1]!) -
    matrix[0]![1]! *
      (matrix[1]![0]! * matrix[2]![2]! - matrix[1]![2]! * matrix[2]![0]!) +
    matrix[0]![2]! *
      (matrix[1]![0]! * matrix[2]![1]! - matrix[1]![1]! * matrix[2]![0]!)
  );
}

export function deriveSpan(state: SpanState) {
  const basisIndices = selectSpanBasisIndices(state.vectors, state.dimension);
  const rank = basisIndices.length as SpanRank;
  const basisVectors = basisIndices.map((index) => state.vectors[index]!);
  const basisMatrix: RealMatrix = Array.from(
    { length: state.dimension },
    (_, row) => basisVectors.map((vector) => vector[row] ?? 0),
  );
  const combination = Array.from({ length: state.dimension }, (_, component) =>
    state.vectors.reduce(
      (sum, vector, index) =>
        sum + (vector[component] ?? 0) * (state.coefficients[index] ?? 0),
      0,
    ),
  );
  const coordinates = solveBasisCoordinates(basisVectors, state.target);
  const targetSolution =
    coordinates === null
      ? ({ kind: "none" } as const)
      : state.vectors.length === rank
        ? ({ kind: "unique", solution: coordinates } as const)
        : ({ kind: "infinite", solution: coordinates } as const);
  const classification =
    rank === 0
      ? "原点"
      : rank === state.dimension
        ? `整个空间 R${state.dimension}`
        : rank === 1
          ? "一条直线"
          : "一个平面";
  return {
    basisIndices,
    basisVectors,
    basisMatrix,
    determinant: rank === state.dimension ? determinant(basisMatrix) : null,
    rank,
    combination,
    targetSolution,
    targetInSpan: coordinates !== null,
    classification,
    isBasis:
      rank === state.dimension && state.vectors.length === state.dimension,
  } as const;
}
