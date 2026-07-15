import {
  analyzeRealBasis,
  applyRealMatrix,
  conditionNumberRealMatrix,
  determinantRealMatrix,
  effectiveRealMap,
  identityRealMatrix,
  inverseRealMatrix,
  multiplyRealMatrices,
  rankRealMatrix,
  type Dimension,
  type RealMatrix,
  type RealVector,
} from "../../math/nd";

export type BasisMode = "standard" | "custom";
export type TransformDirection = "forward" | "inverse";
export type TransformMode = "single" | "composition";

export interface TransformState {
  readonly version: 4;
  readonly rows: Dimension;
  readonly columns: Dimension;
  readonly matrix: RealMatrix;
  readonly mode: TransformMode;
  readonly secondMatrix: RealMatrix;
  readonly vector: RealVector;
  readonly basisMode: BasisMode;
  /** For square maps, identifies W with V and uses the ordered domain basis in both spaces. */
  readonly sharedBasis: boolean;
  readonly domainBasis: RealMatrix;
  readonly codomainBasis: RealMatrix;
  readonly direction: TransformDirection;
  readonly showGrid: boolean;
  readonly showSphere: boolean;
  readonly showTrail: boolean;
}

export const transformDefaults: TransformState = {
  version: 4,
  rows: 2,
  columns: 2,
  matrix: [
    [1.35, 0.65],
    [-0.25, 1.05],
  ],
  mode: "single",
  secondMatrix: [
    [0.9, -0.45],
    [0.45, 0.9],
  ],
  vector: [1.5, 1],
  basisMode: "standard",
  sharedBasis: false,
  domainBasis: identityRealMatrix(2),
  codomainBasis: identityRealMatrix(2),
  direction: "forward",
  showGrid: true,
  showSphere: true,
  showTrail: true,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function safeDimension(value: unknown, fallback: Dimension): Dimension {
  return value === 1 || value === 2 || value === 3 ? value : fallback;
}

function finiteNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function coerceVector(
  value: unknown,
  dimension: Dimension,
  fallback: RealVector,
): RealVector {
  const source = Array.isArray(value) ? value : [];
  return Array.from({ length: dimension }, (_, index) =>
    finiteNumber(source[index], fallback[index] ?? 0),
  );
}

function coerceMatrix(
  value: unknown,
  rows: Dimension,
  columns: Dimension,
  fallback: RealMatrix,
): RealMatrix {
  const source = Array.isArray(value) ? value : [];
  return Array.from({ length: rows }, (_, row) => {
    const sourceRow = Array.isArray(source[row]) ? source[row] : [];
    return Array.from({ length: columns }, (_, column) =>
      finiteNumber(sourceRow[column], fallback[row]?.[column] ?? 0),
    );
  });
}

function legacyBasisMatrix(value: unknown): RealMatrix {
  if (!Array.isArray(value) || value.length !== 2) return identityRealMatrix(2);
  const first = Array.isArray(value[0]) ? value[0] : [];
  const second = Array.isArray(value[1]) ? value[1] : [];
  return [
    [finiteNumber(first[0], 1), finiteNumber(second[0], 0)],
    [finiteNumber(first[1], 0), finiteNumber(second[1], 1)],
  ];
}

function legacyMatrix(value: unknown): RealMatrix {
  if (!Array.isArray(value)) return transformDefaults.matrix;
  return [
    [finiteNumber(value[0], 1), finiteNumber(value[1], 0)],
    [finiteNumber(value[2], 0), finiteNumber(value[3], 1)],
  ];
}

export function migrateTransformState(stored: unknown): TransformState {
  const record = asRecord(stored);
  if (!record) return transformDefaults;

  if (
    record.version !== undefined &&
    record.version !== 1 &&
    record.version !== 2 &&
    record.version !== 3 &&
    record.version !== 4
  ) {
    return transformDefaults;
  }

  if (record.version !== 2 && record.version !== 3 && record.version !== 4) {
    const basis = legacyBasisMatrix(record.basis);
    return {
      ...transformDefaults,
      matrix: legacyMatrix(record.matrix),
      vector: coerceVector(record.vector, 2, transformDefaults.vector),
      basisMode: record.basisMode === "custom" ? "custom" : "standard",
      sharedBasis: record.basisMode === "custom",
      domainBasis: basis,
      codomainBasis: basis,
      showGrid:
        typeof record.showGrid === "boolean"
          ? record.showGrid
          : transformDefaults.showGrid,
      showSphere:
        typeof record.showCircle === "boolean"
          ? record.showCircle
          : transformDefaults.showSphere,
      showTrail:
        typeof record.showTrail === "boolean"
          ? record.showTrail
          : transformDefaults.showTrail,
    };
  }

  const rows = safeDimension(record.rows, 2);
  const columns = safeDimension(record.columns, 2);
  const matrixFallback = rectangularIdentity(rows, columns);
  const mode =
    record.version !== 2 && record.mode === "composition" && rows === columns
      ? "composition"
      : "single";
  return {
    version: 4,
    rows,
    columns,
    matrix: coerceMatrix(record.matrix, rows, columns, matrixFallback),
    mode,
    secondMatrix: coerceMatrix(
      record.secondMatrix,
      rows,
      columns,
      identityRealMatrix(rows),
    ),
    vector: coerceVector(record.vector, columns, [1.5, 1, 0.5]),
    basisMode: record.basisMode === "custom" ? "custom" : "standard",
    sharedBasis:
      rows === columns &&
      (record.version === 4
        ? record.sharedBasis === true
        : record.basisMode === "custom" &&
          JSON.stringify(record.domainBasis) ===
            JSON.stringify(record.codomainBasis)),
    domainBasis: coerceMatrix(
      record.domainBasis,
      columns,
      columns,
      identityRealMatrix(columns),
    ),
    codomainBasis: coerceMatrix(
      record.codomainBasis,
      rows,
      rows,
      identityRealMatrix(rows),
    ),
    direction:
      rows === columns && record.direction === "inverse"
        ? "inverse"
        : "forward",
    showGrid:
      typeof record.showGrid === "boolean"
        ? record.showGrid
        : transformDefaults.showGrid,
    showSphere:
      typeof record.showSphere === "boolean"
        ? record.showSphere
        : transformDefaults.showSphere,
    showTrail:
      typeof record.showTrail === "boolean"
        ? record.showTrail
        : transformDefaults.showTrail,
  };
}

export function rectangularIdentity(
  rows: Dimension,
  columns: Dimension,
): RealMatrix {
  return Array.from({ length: rows }, (_, row) =>
    Array.from({ length: columns }, (_, column) => (row === column ? 1 : 0)),
  );
}

function resizeWithIdentity(
  matrix: RealMatrix,
  rows: Dimension,
  columns: Dimension,
): RealMatrix {
  return Array.from({ length: rows }, (_, row) =>
    Array.from(
      { length: columns },
      (_, column) => matrix[row]?.[column] ?? (row === column ? 1 : 0),
    ),
  );
}

export function resizeTransformState(
  state: TransformState,
  rows: Dimension,
  columns: Dimension,
): TransformState {
  return {
    ...state,
    rows,
    columns,
    matrix: resizeWithIdentity(state.matrix, rows, columns),
    mode:
      rows === columns && state.mode === "composition"
        ? "composition"
        : "single",
    secondMatrix: resizeWithIdentity(state.secondMatrix, rows, columns),
    vector: Array.from(
      { length: columns },
      (_, index) => state.vector[index] ?? (index === 2 ? 0.5 : 1),
    ),
    domainBasis: resizeWithIdentity(state.domainBasis, columns, columns),
    codomainBasis: resizeWithIdentity(state.codomainBasis, rows, rows),
    sharedBasis: rows === columns ? state.sharedBasis : false,
    direction:
      rows === columns && state.direction === "inverse" ? "inverse" : "forward",
  };
}

export function transformPresetsForShape(rows: Dimension, columns: Dimension) {
  const identity = rectangularIdentity(rows, columns);
  const scaled = identity.map((row, rowIndex) =>
    row.map((entry, columnIndex) =>
      rowIndex === columnIndex
        ? entry * ([1.7, 0.65, 1.25][rowIndex] ?? 1)
        : entry,
    ),
  );
  const mixed = identity.map((row) => [...row]);
  if (rows >= 2 && columns >= 2) {
    mixed[0]![0] = Math.sqrt(3) / 2;
    mixed[0]![1] = -0.5;
    mixed[1]![0] = 0.5;
    mixed[1]![1] = Math.sqrt(3) / 2;
  }
  if (rows === 3 && columns === 3) {
    mixed[2]![2] = 1;
  }
  if (rows === 1 || columns === 1) mixed[0]![0] = -1;
  const coupled = identity.map((row) => [...row]);
  if (rows >= 1 && columns >= 2) coupled[0]![1] = 0.8;
  if (rows >= 2 && columns >= 3) coupled[1]![2] = -0.55;
  const structural = identity.map((row) => [...row]);
  if (rows === columns) {
    structural[0]![0] = rows === 1 ? 0.5 : -1;
  }
  const collapsed = identity.map((row) => [...row]);
  const diagonal = Math.min(rows, columns) - 1;
  collapsed[diagonal]![diagonal] = 0;

  return [
    { label: "单位映射", value: identity },
    { label: "轴向缩放", value: scaled },
    {
      label: rows >= 2 && columns >= 2 ? "平面旋转" : "符号翻转",
      value: mixed,
    },
    { label: "方向耦合", value: coupled },
    {
      label:
        rows !== columns
          ? rows > columns
            ? "维度嵌入"
            : "坐标投影"
          : rows === 1
            ? "半倍压缩"
            : "镜像翻转",
      value: rows === columns ? structural : identity,
    },
    { label: "秩亏映射", value: collapsed },
  ] as const;
}

export function changeTransformBasisMode(
  state: TransformState,
  basisMode: BasisMode,
): TransformState {
  if (basisMode === state.basisMode) return state;

  const domainBasis = state.domainBasis;
  const codomainBasis =
    state.sharedBasis && state.rows === state.columns
      ? domainBasis
      : state.codomainBasis;
  const inverseDomain = inverseRealMatrix(domainBasis);
  const inverseCodomain = inverseRealMatrix(codomainBasis);
  if (!inverseDomain || !inverseCodomain) return state;

  const convert = (matrix: RealMatrix) =>
    basisMode === "custom"
      ? multiplyRealMatrices(
          multiplyRealMatrices(inverseCodomain, matrix),
          domainBasis,
        )
      : multiplyRealMatrices(
          multiplyRealMatrices(codomainBasis, matrix),
          inverseDomain,
        );

  return {
    ...state,
    basisMode,
    codomainBasis,
    matrix: convert(state.matrix),
    secondMatrix: convert(state.secondMatrix),
  };
}

export function changeTransformSharedBasis(
  state: TransformState,
  sharedBasis: boolean,
): TransformState {
  if (
    sharedBasis === state.sharedBasis ||
    state.rows !== state.columns ||
    state.basisMode !== "custom"
  ) {
    return state.rows === state.columns
      ? { ...state, sharedBasis }
      : { ...state, sharedBasis: false };
  }

  const oldCodomain = state.sharedBasis
    ? state.domainBasis
    : state.codomainBasis;
  const newCodomain = sharedBasis ? state.domainBasis : state.codomainBasis;
  const inverseNewCodomain = inverseRealMatrix(newCodomain);
  if (!inverseNewCodomain || !analyzeRealBasis(oldCodomain).isBasis)
    return state;
  const convert = (matrix: RealMatrix) =>
    multiplyRealMatrices(
      multiplyRealMatrices(inverseNewCodomain, oldCodomain),
      matrix,
    );

  return {
    ...state,
    sharedBasis,
    matrix: convert(state.matrix),
    secondMatrix: convert(state.secondMatrix),
  };
}

export function deriveTransform(state: TransformState) {
  const domainBasis =
    state.basisMode === "custom"
      ? state.domainBasis
      : identityRealMatrix(state.columns);
  const configuredCodomainBasis =
    state.sharedBasis && state.rows === state.columns
      ? state.domainBasis
      : state.codomainBasis;
  const codomainBasis =
    state.basisMode === "custom"
      ? configuredCodomainBasis
      : identityRealMatrix(state.rows);
  const domainBasisAnalysis = analyzeRealBasis(domainBasis);
  const codomainBasisAnalysis = analyzeRealBasis(codomainBasis);
  const firstEffective =
    state.basisMode === "custom"
      ? effectiveRealMap(state.matrix, domainBasis, codomainBasis)
      : state.matrix;
  const square = state.rows === state.columns;
  const compositionEnabled = state.mode === "composition" && square;
  const secondEffective = compositionEnabled
    ? state.basisMode === "custom"
      ? effectiveRealMap(state.secondMatrix, domainBasis, codomainBasis)
      : state.secondMatrix
    : null;
  const effective = compositionEnabled
    ? firstEffective && secondEffective
      ? multiplyRealMatrices(secondEffective, firstEffective)
      : null
    : firstEffective;
  const inverse = square && effective ? inverseRealMatrix(effective) : null;
  const inverseAvailable = inverse !== null;
  const selectedMatrix = state.direction === "inverse" ? inverse : effective;
  const stageOneMatrix = compositionEnabled
    ? state.direction === "inverse"
      ? secondEffective
        ? inverseRealMatrix(secondEffective)
        : null
      : firstEffective
    : null;
  const valid = selectedMatrix !== null;
  const rank = effective === null ? null : rankRealMatrix(effective);
  const determinant =
    effective !== null && square ? determinantRealMatrix(effective) : null;
  const trace =
    effective !== null && square
      ? effective.reduce((sum, row, index) => sum + row[index]!, 0)
      : null;
  const condition =
    effective === null ? null : conditionNumberRealMatrix(effective);
  const output = selectedMatrix
    ? applyRealMatrix(selectedMatrix, state.vector)
    : null;
  const orientation =
    effective === null || rank === null
      ? "无效"
      : rank < Math.min(state.rows, state.columns)
        ? "秩亏"
        : state.rows > state.columns
          ? "嵌入"
          : state.rows < state.columns
            ? "投影"
            : determinant !== null && determinant < 0
              ? "翻转"
              : "保持";

  return {
    valid,
    square,
    compositionEnabled,
    matrix: selectedMatrix,
    stageOneMatrix,
    firstForwardMatrix: firstEffective,
    secondForwardMatrix: secondEffective,
    forwardMatrix: effective,
    inverse,
    inverseAvailable,
    output,
    determinant,
    trace,
    rank,
    condition,
    orientation,
    domainBasisAnalysis,
    codomainBasisAnalysis,
    basisAnalysis: domainBasisAnalysis,
  } as const;
}
