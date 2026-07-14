import {
  absComplex,
  complex,
  complexInnerProduct,
  identityComplexMatrix,
  scaleComplexVector,
  subtractComplex,
  validateInnerProduct,
  type ComplexMatrix,
  type ComplexScalar,
  type ComplexVector,
  type Dimension,
  type Field,
  type RealMatrix,
} from "../../math/nd";

export type InnerProductMode = "projection" | "gram-schmidt" | "axioms";
export type MetricPreset =
  | "euclidean"
  | "x-weighted"
  | "correlated"
  | "hermitian"
  | "phase-coupled"
  | "custom";

export interface InnerProductState {
  readonly version: 2;
  readonly field: Field;
  readonly dimension: Dimension;
  readonly first: ComplexVector;
  readonly second: ComplexVector;
  readonly mode: InnerProductMode;
  readonly metricPreset: MetricPreset;
  readonly metric: ComplexMatrix;
  readonly showMetricCircle: boolean;
}

export const innerProductDefaults: InnerProductState = {
  version: 2,
  field: "R",
  dimension: 2,
  first: [complex(2.1), complex(1.2)],
  second: [complex(1.55), complex(-0.35)],
  mode: "projection",
  metricPreset: "euclidean",
  metric: identityComplexMatrix(2),
  showMetricCircle: true,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function finite(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function dimension(value: unknown, fallback: Dimension): Dimension {
  return value === 1 || value === 2 || value === 3 ? value : fallback;
}

function scalar(value: unknown, fallback: ComplexScalar): ComplexScalar {
  if (typeof value === "number") return complex(finite(value, fallback.re));
  const record = asRecord(value);
  return record
    ? complex(finite(record.re, fallback.re), finite(record.im, fallback.im))
    : fallback;
}

function vector(
  value: unknown,
  size: Dimension,
  fallback: ComplexVector,
): ComplexVector {
  const source = Array.isArray(value) ? value : [];
  return Array.from({ length: size }, (_, index) =>
    scalar(source[index], fallback[index] ?? complex(0)),
  );
}

function matrix(
  value: unknown,
  size: Dimension,
  fallback: ComplexMatrix,
): ComplexMatrix {
  const source = Array.isArray(value) ? value : [];
  return Array.from({ length: size }, (_, row) => {
    const sourceRow = Array.isArray(source[row]) ? source[row] : [];
    return Array.from({ length: size }, (_, column) =>
      scalar(
        sourceRow[column],
        fallback[row]?.[column] ?? complex(row === column ? 1 : 0),
      ),
    );
  });
}

function legacyMetric(value: unknown): ComplexMatrix {
  const source = Array.isArray(value) ? value : [];
  return [
    [complex(finite(source[0], 1)), complex(finite(source[1], 0))],
    [complex(finite(source[2], 0)), complex(finite(source[3], 1))],
  ];
}

function migrateMetricPreset(
  value: unknown,
  field: Field,
  hasStoredMetric: boolean,
): MetricPreset {
  const allowed: readonly MetricPreset[] =
    field === "R"
      ? ["euclidean", "x-weighted", "correlated", "custom"]
      : ["euclidean", "hermitian", "phase-coupled", "custom"];
  if (allowed.some((preset) => preset === value)) {
    return value as MetricPreset;
  }
  return hasStoredMetric ? "custom" : "euclidean";
}

export function migrateInnerProductState(stored: unknown): InnerProductState {
  const record = asRecord(stored);
  if (!record) return innerProductDefaults;
  if (
    record.version !== undefined &&
    record.version !== 1 &&
    record.version !== 2
  ) {
    return innerProductDefaults;
  }
  if (record.version !== 2) {
    return {
      ...innerProductDefaults,
      first: vector(record.first, 2, innerProductDefaults.first),
      second: vector(record.second, 2, innerProductDefaults.second),
      mode: record.mode === "gram-schmidt" ? "gram-schmidt" : "projection",
      metricPreset:
        record.metricPreset === "x-weighted" ||
        record.metricPreset === "correlated" ||
        record.metricPreset === "custom"
          ? record.metricPreset
          : "euclidean",
      metric: legacyMetric(record.metric),
      showMetricCircle:
        typeof record.showMetricCircle === "boolean"
          ? record.showMetricCircle
          : true,
    };
  }
  const size = dimension(record.dimension, 2);
  const field: Field = record.field === "C" ? "C" : "R";
  const fallbackMetric = identityComplexMatrix(size);
  const nextMetric = matrix(record.metric, size, fallbackMetric);
  return {
    version: 2,
    field,
    dimension: size,
    first: normalizeFieldVector(
      vector(record.first, size, innerProductDefaults.first),
      field,
    ),
    second: normalizeFieldVector(
      vector(record.second, size, innerProductDefaults.second),
      field,
    ),
    mode:
      record.mode === "gram-schmidt" || record.mode === "axioms"
        ? record.mode
        : "projection",
    metricPreset: migrateMetricPreset(
      record.metricPreset,
      field,
      record.metric !== undefined,
    ),
    metric: normalizeFieldMatrix(nextMetric, field),
    showMetricCircle:
      typeof record.showMetricCircle === "boolean"
        ? record.showMetricCircle
        : true,
  };
}

function normalizeFieldVector(
  value: ComplexVector,
  field: Field,
): ComplexVector {
  return value.map((entry) =>
    field === "R" ? complex(entry.re) : complex(entry.re, entry.im),
  );
}

function normalizeFieldMatrix(
  value: ComplexMatrix,
  field: Field,
): ComplexMatrix {
  return value.map((row) => normalizeFieldVector(row, field));
}

function resizeVector(
  value: ComplexVector,
  size: Dimension,
  field: Field,
): ComplexVector {
  return normalizeFieldVector(
    Array.from(
      { length: size },
      (_, index) =>
        value[index] ?? complex(index === 0 ? 1 : index === 1 ? 0.5 : -0.25),
    ),
    field,
  );
}

function resizeMatrix(
  value: ComplexMatrix,
  size: Dimension,
  field: Field,
): ComplexMatrix {
  return normalizeFieldMatrix(
    Array.from({ length: size }, (_, row) =>
      Array.from(
        { length: size },
        (_, column) => value[row]?.[column] ?? complex(row === column ? 1 : 0),
      ),
    ),
    field,
  );
}

export function resizeInnerProductState(
  state: InnerProductState,
  size: Dimension,
): InnerProductState {
  return {
    ...state,
    dimension: size,
    first: resizeVector(state.first, size, state.field),
    second: resizeVector(state.second, size, state.field),
    metric: resizeMatrix(state.metric, size, state.field),
    metricPreset: "custom",
  };
}

export function changeInnerProductField(
  state: InnerProductState,
  field: Field,
): InnerProductState {
  if (state.field === field) return state;
  const metricPreset: MetricPreset = field === "R" ? "euclidean" : "hermitian";
  return {
    ...state,
    field,
    first: normalizeFieldVector(state.first, field),
    second: normalizeFieldVector(state.second, field),
    metric: metricForPreset(metricPreset, field, state.dimension),
    metricPreset,
  };
}

function realPreset(
  size: Dimension,
  diagonal: readonly number[],
  coupling = 0,
): ComplexMatrix {
  return Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, column) =>
      complex(
        row === column
          ? (diagonal[row] ?? 1)
          : Math.abs(row - column) === 1
            ? coupling
            : 0,
      ),
    ),
  );
}

export function metricForPreset(
  preset: Exclude<MetricPreset, "custom">,
  field: Field,
  size: Dimension,
): ComplexMatrix {
  if (preset === "euclidean") return identityComplexMatrix(size);
  if (preset === "x-weighted") return realPreset(size, [2.2, 0.7, 1.35]);
  if (preset === "correlated") return realPreset(size, [1.6, 1.35, 1.2], 0.35);
  if (preset === "hermitian") {
    const value = realPreset(size, [2, 2.4, 1.8]);
    if (field === "C" && size >= 2) {
      const copy = value.map((row) => [...row]);
      copy[0]![1] = complex(0.25, 0.55);
      copy[1]![0] = complex(0.25, -0.55);
      return copy;
    }
    return value;
  }
  const value = realPreset(size, [1.8, 2.1, 1.5]);
  if (size >= 2) {
    const copy = value.map((row) => [...row]);
    copy[0]![1] = complex(0.2, field === "C" ? 0.7 : 0);
    copy[1]![0] = complex(0.2, field === "C" ? -0.7 : 0);
    return copy;
  }
  return value;
}

export function metricPresetOptions(field: Field) {
  return field === "R"
    ? [
        { value: "euclidean", label: "欧氏内积 I" },
        { value: "x-weighted", label: "x 方向加权" },
        { value: "correlated", label: "相关度量" },
        { value: "custom", label: "自定义 G" },
      ]
    : [
        { value: "euclidean", label: "标准 Hermitian" },
        { value: "hermitian", label: "Hermitian 耦合" },
        { value: "phase-coupled", label: "相位耦合" },
        { value: "custom", label: "自定义 G" },
      ];
}

function divideComplex(
  numerator: ComplexScalar,
  denominator: ComplexScalar,
): ComplexScalar | null {
  const scale = denominator.re ** 2 + denominator.im ** 2;
  if (scale <= Number.MIN_VALUE) return null;
  return complex(
    (numerator.re * denominator.re + numerator.im * denominator.im) / scale,
    (numerator.im * denominator.re - numerator.re * denominator.im) / scale,
  );
}

function subtractVectors(
  left: ComplexVector,
  right: ComplexVector,
): ComplexVector {
  return left.map((entry, index) =>
    subtractComplex(entry, right[index] ?? complex(0)),
  );
}

function norm(value: ComplexVector, metric: ComplexMatrix): number | null {
  const square = complexInnerProduct(value, value, metric);
  return Math.abs(square.im) <= 1e-8 && square.re >= 0
    ? Math.sqrt(Math.max(0, square.re))
    : null;
}

function projection(
  value: ComplexVector,
  onto: ComplexVector,
  metric: ComplexMatrix,
) {
  const denominator = complexInnerProduct(onto, onto, metric);
  const coefficient = divideComplex(
    complexInnerProduct(value, onto, metric),
    denominator,
  );
  if (!coefficient) return null;
  const projected = scaleComplexVector(coefficient, onto);
  return {
    coefficient,
    projection: projected,
    residual: subtractVectors(value, projected),
  };
}

function gramSchmidt(
  first: ComplexVector,
  second: ComplexVector,
  metric: ComplexMatrix,
) {
  const orthonormal: ComplexVector[] = [];
  for (const input of [first, second]) {
    const inputNorm = norm(input, metric);
    if (inputNorm === null || inputNorm === 0) continue;
    let residual = input;
    for (let pass = 0; pass < 2; pass += 1) {
      orthonormal.forEach((basis) => {
        const removed = projection(residual, basis, metric);
        if (removed) residual = removed.residual;
      });
    }
    const residualNorm = norm(residual, metric);
    if (residualNorm === null || residualNorm <= inputNorm * 1e-10) continue;
    orthonormal.push(scaleComplexVector(complex(1 / residualNorm), residual));
  }
  return {
    rank: orthonormal.length as 0 | 1 | 2,
    orthonormal: orthonormal as readonly ComplexVector[],
  };
}

function toRealMatrix(metric: ComplexMatrix): RealMatrix {
  return metric.map((row) => row.map((entry) => entry.re));
}

export function deriveInnerProduct(state: InnerProductState) {
  const validation = validateInnerProduct(
    state.field,
    state.field === "R" ? toRealMatrix(state.metric) : state.metric,
  );
  const valid = validation.valid;
  const innerProduct = valid
    ? complexInnerProduct(state.first, state.second, state.metric)
    : null;
  const firstNorm = valid ? norm(state.first, state.metric) : null;
  const secondNorm = valid ? norm(state.second, state.metric) : null;
  const projected = valid
    ? projection(state.first, state.second, state.metric)
    : null;
  const orthogonalized = valid
    ? gramSchmidt(state.first, state.second, state.metric)
    : { rank: 0 as const, orthonormal: [] as readonly ComplexVector[] };
  const cosine =
    innerProduct && firstNorm && secondNorm
      ? (state.field === "R" ? innerProduct.re : absComplex(innerProduct)) /
        (firstNorm * secondNorm)
      : null;
  const angle =
    cosine !== null
      ? Math.acos(Math.max(state.field === "R" ? -1 : 0, Math.min(1, cosine)))
      : null;
  return {
    valid,
    validation,
    innerProduct,
    firstNorm,
    secondNorm,
    projection: projected,
    gramSchmidt: orthogonalized,
    angle,
    angleDegrees: angle === null ? null : (angle * 180) / Math.PI,
  } as const;
}
