import {
  absComplex,
  addComplex,
  adjointComplexMatrix,
  applyComplexMatrix,
  classifyComplexOperator,
  conjugateComplex,
  multiplyComplex,
  multiplyComplexMatrices,
  scaleComplexVector,
  spectralDecomposeNormal,
  subtractComplex,
  type ComplexMatrix,
  type ComplexScalar,
  type ComplexVector,
  type Dimension,
  type Field,
} from "../../math/nd";

export type OperatorLessonMode = "structure" | "apply";
export type OperatorComponentFocus = "all" | "1" | "2" | "3";

export interface OperatorState {
  readonly version: 2;
  readonly field: Field;
  readonly dimension: Dimension;
  readonly matrix: ComplexMatrix;
  readonly vector: ComplexVector;
  readonly lessonMode: OperatorLessonMode;
  readonly focus: OperatorComponentFocus;
}

export interface OperatorPreset {
  readonly label: string;
  readonly field: Field;
  readonly dimension: Dimension;
  readonly matrix: ComplexMatrix;
  readonly vector: ComplexVector;
}

export interface OperatorSpectralApplication {
  readonly coordinates: ComplexVector;
  readonly weightedCoordinates: ComplexVector;
  readonly contributions: readonly ComplexVector[];
  readonly output: ComplexVector;
  readonly directOutput: ComplexVector;
  readonly residual: number;
}

export interface OperatorEigenspace {
  readonly eigenvalue: ComplexScalar;
  readonly indices: readonly number[];
  readonly projector: ComplexMatrix;
  readonly projectedVector: ComplexVector;
  readonly mappedProjection: ComplexVector;
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

function teachingVector(dimension: Dimension): ComplexVector {
  const entries = [scalar(1.25), scalar(-0.8), scalar(0.65)];
  return entries.slice(0, dimension);
}

function atLeastTwo(dimension: Dimension): Dimension {
  return dimension === 1 ? 2 : dimension;
}

function realSymmetricMatrix(dimension: Dimension): ComplexMatrix {
  if (dimension === 1) return [[scalar(2)]];
  if (dimension === 2) {
    return [
      [scalar(2), scalar(1)],
      [scalar(1), scalar(2)],
    ];
  }
  return [
    [scalar(2), scalar(1), scalar(0)],
    [scalar(1), scalar(2), scalar(0)],
    [scalar(0), scalar(0), scalar(4)],
  ];
}

function complexHermitianMatrix(dimension: Dimension): ComplexMatrix {
  if (dimension === 1) return [[scalar(2)]];
  const matrix: ComplexScalar[][] = [
    [scalar(2), scalar(0, 1)],
    [scalar(0, -1), scalar(2)],
  ];
  if (dimension === 3) {
    matrix[0]!.push(scalar(0));
    matrix[1]!.push(scalar(0));
    matrix.push([scalar(0), scalar(0), scalar(4)]);
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

function nonOrthogonalEigenbasisMatrix(dimension: Dimension): ComplexMatrix {
  const matrix = identityMatrix(dimension).map((row) => [...row]);
  if (dimension >= 2) {
    matrix[0]![0] = scalar(1);
    matrix[0]![1] = scalar(1);
    matrix[1]![1] = scalar(2);
  }
  if (dimension === 3) matrix[2]![2] = scalar(3);
  return matrix;
}

function repeatedEigenspaceMatrix(dimension: Dimension): ComplexMatrix {
  const matrix = identityMatrix(dimension, 2).map((row) => [...row]);
  if (dimension === 3) matrix[2]![2] = scalar(5);
  return matrix;
}

export const operatorDefaults: OperatorState = {
  version: 2,
  field: "R",
  dimension: 2,
  matrix: realSymmetricMatrix(2),
  vector: teachingVector(2),
  lessonMode: "apply",
  focus: "all",
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
      vector: teachingVector(dimension),
    },
    {
      label: "自伴复耦合",
      field: "C",
      dimension: coupledDimension,
      matrix: complexHermitianMatrix(coupledDimension),
      vector: teachingVector(coupledDimension),
    },
    {
      label: "实旋转",
      field: "R",
      dimension: coupledDimension,
      matrix: realRotationMatrix(coupledDimension),
      vector: teachingVector(coupledDimension),
    },
    {
      label: "复对角 normal",
      field: "C",
      dimension,
      matrix: complexDiagonalMatrix(dimension),
      vector: teachingVector(dimension).map((entry, index) =>
        scalar(entry.re, index === 0 ? 0.5 : index === 2 ? -0.35 : 0),
      ),
    },
    {
      label: "非 normal 剪切",
      field: "R",
      dimension: coupledDimension,
      matrix: nonNormalShearMatrix(coupledDimension),
      vector: teachingVector(coupledDimension),
    },
    {
      label: "重复特征子空间",
      field: "R",
      dimension: coupledDimension,
      matrix: repeatedEigenspaceMatrix(coupledDimension),
      vector: teachingVector(coupledDimension),
    },
    {
      label: "非正交特征基",
      field: "R",
      dimension: coupledDimension,
      matrix: nonOrthogonalEigenbasisMatrix(coupledDimension),
      vector: teachingVector(coupledDimension),
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

function coerceVector(
  value: unknown,
  dimension: Dimension,
  field: Field,
): ComplexVector {
  const record = asRecord(value);
  const raw = record && Array.isArray(record.entries) ? record.entries : value;
  const entries = Array.isArray(raw) ? raw : [];
  const fallback = teachingVector(dimension);
  return Array.from({ length: dimension }, (_, index) => {
    const coerced = coerceScalar(entries[index], fallback[index]!);
    return field === "R" ? scalar(coerced.re) : coerced;
  });
}

export function migrateOperatorState(stored: unknown): OperatorState {
  const record = asRecord(stored);
  if (!record) return operatorDefaults;
  if (
    record.version !== undefined &&
    record.version !== 1 &&
    record.version !== 2
  ) {
    return operatorDefaults;
  }
  const field: Field = record.field === "C" ? "C" : "R";
  const inferred = inferDimension(record.matrix);
  const dimension = safeDimension(record.dimension, inferred);
  return {
    version: 2,
    field,
    dimension,
    matrix: coerceMatrix(record.matrix, dimension, field),
    vector: coerceVector(record.vector, dimension, field),
    lessonMode: record.lessonMode === "structure" ? "structure" : "apply",
    focus:
      record.focus === "1" ||
      (record.focus === "2" && dimension >= 2) ||
      (record.focus === "3" && dimension === 3)
        ? record.focus
        : "all",
  };
}

function clearImaginary(matrix: ComplexMatrix): ComplexMatrix {
  return matrix.map((row) => row.map((entry) => scalar(entry.re)));
}

function clearVectorImaginary(vector: ComplexVector): ComplexVector {
  return vector.map((entry) => scalar(entry.re));
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
    vector: field === "R" ? clearVectorImaginary(state.vector) : state.vector,
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
  const fallback = teachingVector(dimension);
  const vector = Array.from({ length: dimension }, (_, index) => {
    const existing = state.vector[index] ?? fallback[index]!;
    return scalar(existing.re, state.field === "R" ? 0 : existing.im);
  });
  const focus =
    state.focus === "3" && dimension < 3
      ? "all"
      : state.focus === "2" && dimension < 2
        ? "all"
        : state.focus;
  return { ...state, dimension, matrix: resized, vector, focus };
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
    vector: preset.vector.map((entry) => ({ ...entry })),
    focus: "all",
  };
}

function sameEigenvalue(left: ComplexScalar, right: ComplexScalar) {
  const distance = Math.hypot(left.re - right.re, left.im - right.im);
  const scale = Math.max(1, absComplex(left), absComplex(right));
  return distance <= scale * 1e-8;
}

function spectralColumn(matrix: ComplexMatrix, column: number): ComplexVector {
  return matrix.map((row) => row[column]!);
}

function zeroMatrix(dimension: Dimension): ComplexScalar[][] {
  return Array.from({ length: dimension }, () =>
    Array.from({ length: dimension }, () => scalar(0)),
  );
}

function addOuterProduct(target: ComplexScalar[][], vector: ComplexVector) {
  vector.forEach((rowValue, row) => {
    vector.forEach((columnValue, column) => {
      target[row]![column] = addComplex(
        target[row]![column]!,
        multiplyComplex(rowValue, conjugateComplex(columnValue)),
      );
    });
  });
}

function vectorResidual(left: ComplexVector, right: ComplexVector) {
  const difference = Math.hypot(
    ...left.map((value, index) =>
      absComplex(subtractComplex(value, right[index]!)),
    ),
  );
  const leftNorm = Math.hypot(...left.map(absComplex));
  const rightNorm = Math.hypot(...right.map(absComplex));
  return difference / Math.max(1, leftNorm, rightNorm);
}

function deriveSpectralApplication(
  matrix: ComplexMatrix,
  vector: ComplexVector,
  eigenvalues: ComplexVector,
  U: ComplexMatrix,
): OperatorSpectralApplication {
  const coordinates = applyComplexMatrix(adjointComplexMatrix(U), vector);
  const weightedCoordinates = coordinates.map((coordinate, index) =>
    multiplyComplex(eigenvalues[index]!, coordinate),
  );
  const contributions = weightedCoordinates.map((coordinate, index) =>
    scaleComplexVector(coordinate, spectralColumn(U, index)),
  );
  const output = applyComplexMatrix(U, weightedCoordinates);
  const directOutput = applyComplexMatrix(matrix, vector);
  return {
    coordinates,
    weightedCoordinates,
    contributions,
    output,
    directOutput,
    residual: vectorResidual(output, directOutput),
  };
}

function deriveEigenspaces(
  dimension: Dimension,
  vector: ComplexVector,
  eigenvalues: ComplexVector,
  U: ComplexMatrix,
): readonly OperatorEigenspace[] {
  const groups: number[][] = [];
  eigenvalues.forEach((value, index) => {
    const group = groups.find((indices) =>
      sameEigenvalue(eigenvalues[indices[0]!]!, value),
    );
    if (group) group.push(index);
    else groups.push([index]);
  });
  return groups.map((indices) => {
    const projector = zeroMatrix(dimension);
    indices.forEach((index) =>
      addOuterProduct(projector, spectralColumn(U, index)),
    );
    const projectedVector = applyComplexMatrix(projector, vector);
    const eigenvalue = eigenvalues[indices[0]!]!;
    return {
      eigenvalue,
      indices,
      projector,
      projectedVector,
      mappedProjection: scaleComplexVector(eigenvalue, projectedVector),
    };
  });
}

export function deriveOperator(state: OperatorState) {
  const classification = classifyComplexOperator(state.matrix);
  const spectral = spectralDecomposeNormal(state.matrix);
  const adjoint = adjointComplexMatrix(state.matrix);
  const leftProduct = multiplyComplexMatrices(adjoint, state.matrix);
  const rightProduct = multiplyComplexMatrices(state.matrix, adjoint);
  const commutator = leftProduct.map((row, rowIndex) =>
    row.map((entry, columnIndex) =>
      subtractComplex(entry, rightProduct[rowIndex]![columnIndex]!),
    ),
  );
  if (!spectral.success) {
    return {
      classification,
      spectral,
      repeated: false,
      application: null,
      eigenspaces: [],
      commutator,
    } as const;
  }
  const application = deriveSpectralApplication(
    state.matrix,
    state.vector,
    spectral.eigenvalues,
    spectral.U,
  );
  const eigenspaces = deriveEigenspaces(
    state.dimension,
    state.vector,
    spectral.eigenvalues,
    spectral.U,
  );
  return {
    classification,
    spectral,
    repeated: eigenspaces.some((space) => space.indices.length > 1),
    application,
    eigenspaces,
    commutator,
  } as const;
}
