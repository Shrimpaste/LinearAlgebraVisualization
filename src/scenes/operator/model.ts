import {
  classifyComplexOperator,
  spectralDecomposeNormal,
  type ComplexMatrix,
  type ComplexScalar,
  type Dimension,
  type Field,
} from "../../math/nd";

export interface OperatorState {
  readonly version: 1;
  readonly field: Field;
  readonly dimension: Dimension;
  readonly matrix: ComplexMatrix;
}

export interface OperatorPreset {
  readonly label: string;
  readonly field: Field;
  readonly dimension: Dimension;
  readonly matrix: ComplexMatrix;
}

function scalar(re: number, im = 0): ComplexScalar {
  return { re, im };
}

function identityMatrix(dimension: Dimension, diagonal = 1): ComplexMatrix {
  return Array.from({ length: dimension }, (_, row) =>
    Array.from({ length: dimension }, (_, column) =>
      scalar(row === column ? diagonal : 0),
    ),
  );
}

function atLeastTwo(dimension: Dimension): Dimension {
  return dimension === 1 ? 2 : dimension;
}

function realSymmetricMatrix(dimension: Dimension): ComplexMatrix {
  const matrix = identityMatrix(dimension).map((row) => [...row]);
  for (let index = 0; index < dimension; index += 1) {
    matrix[index]![index] = scalar(2 + index);
  }
  for (let index = 0; index < dimension - 1; index += 1) {
    matrix[index]![index + 1] = scalar(0.65 - index * 0.15);
    matrix[index + 1]![index] = scalar(0.65 - index * 0.15);
  }
  return matrix;
}

function complexHermitianMatrix(dimension: Dimension): ComplexMatrix {
  const matrix = realSymmetricMatrix(dimension).map((row) => [...row]);
  matrix[0]![1] = scalar(0.35, 0.8);
  matrix[1]![0] = scalar(0.35, -0.8);
  if (dimension === 3) {
    matrix[1]![2] = scalar(-0.25, 0.4);
    matrix[2]![1] = scalar(-0.25, -0.4);
  }
  return matrix;
}

function realRotationMatrix(dimension: Dimension): ComplexMatrix {
  const matrix = identityMatrix(dimension).map((row) => [...row]);
  matrix[0]![0] = scalar(0);
  matrix[0]![1] = scalar(-1);
  matrix[1]![0] = scalar(1);
  matrix[1]![1] = scalar(0);
  if (dimension === 3) matrix[2]![2] = scalar(0.75);
  return matrix;
}

function complexDiagonalMatrix(dimension: Dimension): ComplexMatrix {
  const diagonal = [scalar(1, 1), scalar(2, -0.5), scalar(-0.75, 0.8)];
  return Array.from({ length: dimension }, (_, row) =>
    Array.from({ length: dimension }, (_, column) =>
      row === column ? diagonal[row]! : scalar(0),
    ),
  );
}

function nonNormalShearMatrix(dimension: Dimension): ComplexMatrix {
  const matrix = identityMatrix(dimension).map((row) => [...row]);
  matrix[0]![1] = scalar(1.15);
  if (dimension === 3) matrix[1]![2] = scalar(-0.55);
  return matrix;
}

export const operatorDefaults: OperatorState = {
  version: 1,
  field: "R",
  dimension: 2,
  matrix: realSymmetricMatrix(2),
};

export function operatorPresetsForDimension(
  dimension: Dimension,
): readonly OperatorPreset[] {
  const coupledDimension = atLeastTwo(dimension);
  return [
    {
      label: "实对称 / Hermitian",
      field: "R",
      dimension,
      matrix: realSymmetricMatrix(dimension),
    },
    {
      label: "自伴复耦合",
      field: "C",
      dimension: coupledDimension,
      matrix: complexHermitianMatrix(coupledDimension),
    },
    {
      label: "实旋转",
      field: "R",
      dimension: coupledDimension,
      matrix: realRotationMatrix(coupledDimension),
    },
    {
      label: "复对角 normal",
      field: "C",
      dimension,
      matrix: complexDiagonalMatrix(dimension),
    },
    {
      label: "非 normal 剪切",
      field: "R",
      dimension: coupledDimension,
      matrix: nonNormalShearMatrix(coupledDimension),
    },
    {
      label: "重根标量",
      field: "R",
      dimension: coupledDimension,
      matrix: identityMatrix(coupledDimension, 2),
    },
  ];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function safeDimension(value: unknown, fallback: Dimension): Dimension {
  return value === 1 || value === 2 || value === 3 ? value : fallback;
}

function finiteNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function coerceScalar(value: unknown, fallback: ComplexScalar): ComplexScalar {
  if (typeof value === "number") return scalar(finiteNumber(value));
  const record = asRecord(value);
  if (!record) return fallback;
  return scalar(
    finiteNumber(record.re ?? record.real, fallback.re),
    finiteNumber(record.im ?? record.imag, fallback.im),
  );
}

function inferDimension(value: unknown): Dimension {
  if (Array.isArray(value)) {
    if (value.length >= 1 && value.length <= 3) {
      if (Array.isArray(value[0])) return value.length as Dimension;
      const root = Math.sqrt(value.length);
      if (root === 1 || root === 2 || root === 3) return root;
    }
  }
  const record = asRecord(value);
  return safeDimension(record?.rows, operatorDefaults.dimension);
}

function coerceMatrix(
  value: unknown,
  dimension: Dimension,
  field: Field,
): ComplexMatrix {
  const record = asRecord(value);
  const raw = record && Array.isArray(record.entries) ? record.entries : value;
  const rows = Array.isArray(raw) ? raw : [];
  const nested = rows.length > 0 && Array.isArray(rows[0]);
  return Array.from({ length: dimension }, (_, row) =>
    Array.from({ length: dimension }, (_, column) => {
      const entry = nested
        ? (rows[row] as unknown[] | undefined)?.[column]
        : rows[row * dimension + column];
      const fallback = scalar(row === column ? 1 : 0);
      const coerced = coerceScalar(entry, fallback);
      return field === "R" ? scalar(coerced.re) : coerced;
    }),
  );
}

export function migrateOperatorState(stored: unknown): OperatorState {
  const record = asRecord(stored);
  if (!record) return operatorDefaults;
  if (record.version !== undefined && record.version !== 1) {
    return operatorDefaults;
  }
  const field: Field = record.field === "C" ? "C" : "R";
  const inferred = inferDimension(record.matrix);
  const dimension = safeDimension(record.dimension, inferred);
  return {
    version: 1,
    field,
    dimension,
    matrix: coerceMatrix(record.matrix, dimension, field),
  };
}

function clearImaginary(matrix: ComplexMatrix): ComplexMatrix {
  return matrix.map((row) => row.map((entry) => scalar(entry.re)));
}

export function changeOperatorField(
  state: OperatorState,
  field: Field,
): OperatorState {
  if (field === state.field) return state;
  return {
    ...state,
    field,
    matrix: field === "R" ? clearImaginary(state.matrix) : state.matrix,
  };
}

export function resizeOperatorState(
  state: OperatorState,
  dimension: Dimension,
): OperatorState {
  const resized = Array.from({ length: dimension }, (_, row) =>
    Array.from({ length: dimension }, (_, column) => {
      const existing = state.matrix[row]?.[column];
      return existing
        ? scalar(existing.re, existing.im)
        : scalar(row === column ? 1 : 0);
    }),
  );
  return { ...state, dimension, matrix: resized };
}

export function applyOperatorPreset(
  state: OperatorState,
  preset: OperatorPreset,
): OperatorState {
  return {
    ...state,
    field: preset.field,
    dimension: preset.dimension,
    matrix: preset.matrix.map((row) => row.map((entry) => ({ ...entry }))),
  };
}

function hasRepeatedEigenvalue(values: readonly ComplexScalar[]) {
  for (let left = 0; left < values.length; left += 1) {
    for (let right = left + 1; right < values.length; right += 1) {
      const first = values[left]!;
      const second = values[right]!;
      const distance = Math.hypot(first.re - second.re, first.im - second.im);
      const scale = Math.max(
        1,
        Math.hypot(first.re, first.im),
        Math.hypot(second.re, second.im),
      );
      if (distance <= scale * 1e-8) return true;
    }
  }
  return false;
}

export function deriveOperator(state: OperatorState) {
  const classification = classifyComplexOperator(state.matrix);
  const spectral = spectralDecomposeNormal(state.matrix);
  return {
    classification,
    spectral,
    repeated: spectral.success && hasRepeatedEigenvalue(spectral.eigenvalues),
  } as const;
}
