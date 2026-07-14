import {
  identityRealMatrix,
  multiplyRealMatrices,
  rightPolarDecompositionReal,
  svdRealMatrix,
  transposeRealMatrix,
  type Dimension,
  type RealMatrix,
} from "../../math/nd";

export type DecompositionMode = "svd" | "polar";
export type DecompositionStage = "input" | "first" | "second" | "output";

export interface DecompositionState {
  readonly version: 1;
  readonly rows: Dimension;
  readonly columns: Dimension;
  readonly matrix: RealMatrix;
  readonly mode: DecompositionMode;
  readonly stage: DecompositionStage;
  readonly showGrid: boolean;
  readonly showSphere: boolean;
  readonly showTrail: boolean;
}

export interface DecompositionPresetValue {
  readonly rows: Dimension;
  readonly columns: Dimension;
  readonly matrix: RealMatrix;
}

export interface DecompositionStageDescriptor {
  readonly id: DecompositionStage;
  readonly label: string;
  readonly symbol: string;
  readonly matrix: RealMatrix;
  readonly inputDimension: Dimension;
  readonly outputDimension: Dimension;
}

export const decompositionDefaults: DecompositionState = {
  version: 1,
  rows: 2,
  columns: 2,
  matrix: [
    [1.45, 0.65],
    [-0.35, 0.9],
  ],
  mode: "svd",
  stage: "output",
  showGrid: true,
  showSphere: true,
  showTrail: true,
};

const rotationAngle = Math.PI / 6;
const cosine = Math.cos(rotationAngle);
const sine = Math.sin(rotationAngle);

export const decompositionPresets: readonly {
  readonly label: string;
  readonly value: DecompositionPresetValue;
}[] = [
  {
    label: "满秩",
    value: {
      rows: 2,
      columns: 2,
      matrix: [
        [1.8, 0.45],
        [-0.25, 0.95],
      ],
    },
  },
  {
    label: "秩亏",
    value: {
      rows: 2,
      columns: 2,
      matrix: [
        [1, 2],
        [0.5, 1],
      ],
    },
  },
  {
    label: "宽矩阵",
    value: {
      rows: 2,
      columns: 3,
      matrix: [
        [1.4, 0.3, -0.45],
        [0.2, 1.1, 0.8],
      ],
    },
  },
  {
    label: "高矩阵",
    value: {
      rows: 3,
      columns: 2,
      matrix: [
        [1.3, 0.2],
        [0.3, 1.1],
        [0.7, -0.4],
      ],
    },
  },
  {
    label: "旋转 + 缩放",
    value: {
      rows: 2,
      columns: 2,
      matrix: [
        [1.65 * cosine, -0.65 * sine],
        [1.65 * sine, 0.65 * cosine],
      ],
    },
  },
] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function safeDimension(value: unknown, fallback: Dimension): Dimension {
  return value === 1 || value === 2 || value === 3 ? value : fallback;
}

function safeNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function rectangularIdentity(rows: Dimension, columns: Dimension): RealMatrix {
  return Array.from({ length: rows }, (_, row) =>
    Array.from({ length: columns }, (_, column) => (row === column ? 1 : 0)),
  );
}

function coerceMatrix(
  value: unknown,
  rows: Dimension,
  columns: Dimension,
  fallback: RealMatrix,
): RealMatrix {
  const record = asRecord(value);
  const source = Array.isArray(value)
    ? value
    : Array.isArray(record?.entries)
      ? record.entries
      : [];
  const nested = source.some(Array.isArray);
  return Array.from({ length: rows }, (_, row) =>
    Array.from({ length: columns }, (_, column) => {
      const candidate = nested
        ? Array.isArray(source[row])
          ? source[row][column]
          : undefined
        : source[row * columns + column];
      return safeNumber(candidate, fallback[row]?.[column] ?? 0);
    }),
  );
}

export function migrateDecompositionState(stored: unknown): DecompositionState {
  const record = asRecord(stored);
  if (!record) return decompositionDefaults;
  if (record.version !== undefined && record.version !== 1) {
    return decompositionDefaults;
  }

  const rows = safeDimension(record.rows, decompositionDefaults.rows);
  const columns = safeDimension(record.columns, decompositionDefaults.columns);
  const fallback = rectangularIdentity(rows, columns);
  const stage =
    record.stage === "input" ||
    record.stage === "first" ||
    record.stage === "second" ||
    record.stage === "output"
      ? record.stage
      : decompositionDefaults.stage;

  return {
    version: 1,
    rows,
    columns,
    matrix: coerceMatrix(record.matrix, rows, columns, fallback),
    mode: record.mode === "polar" ? "polar" : "svd",
    stage,
    showGrid:
      typeof record.showGrid === "boolean"
        ? record.showGrid
        : decompositionDefaults.showGrid,
    showSphere:
      typeof record.showSphere === "boolean"
        ? record.showSphere
        : decompositionDefaults.showSphere,
    showTrail:
      typeof record.showTrail === "boolean"
        ? record.showTrail
        : decompositionDefaults.showTrail,
  };
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

export function resizeDecompositionState(
  state: DecompositionState,
  rows: Dimension,
  columns: Dimension,
): DecompositionState {
  return {
    ...state,
    rows,
    columns,
    matrix: resizeWithIdentity(state.matrix, rows, columns),
    stage: "input",
  };
}

export function applyDecompositionPreset(
  state: DecompositionState,
  preset: DecompositionPresetValue,
): DecompositionState {
  return {
    ...state,
    rows: preset.rows,
    columns: preset.columns,
    matrix: preset.matrix.map((row) => [...row]),
    stage: "output",
  };
}

function buildSvdStages(
  state: DecompositionState,
  U: RealMatrix,
  sigma: RealMatrix,
  V: RealMatrix,
): readonly DecompositionStageDescriptor[] {
  const innerDimension = Math.min(state.rows, state.columns) as Dimension;
  const transposedV = transposeRealMatrix(V);
  const stretched = multiplyRealMatrices(sigma, transposedV);
  const reconstructed = multiplyRealMatrices(U, stretched);
  return [
    {
      id: "input",
      label: "输入",
      symbol: "I",
      matrix: identityRealMatrix(state.columns),
      inputDimension: state.columns,
      outputDimension: state.columns,
    },
    {
      id: "first",
      label: "Vᵀ 对齐",
      symbol: "Vᵀ",
      matrix: transposedV,
      inputDimension: state.columns,
      outputDimension: innerDimension,
    },
    {
      id: "second",
      label: "Σ 伸缩",
      symbol: "ΣVᵀ",
      matrix: stretched,
      inputDimension: state.columns,
      outputDimension: innerDimension,
    },
    {
      id: "output",
      label: "U 输出",
      symbol: "UΣVᵀ",
      matrix: reconstructed,
      inputDimension: state.columns,
      outputDimension: state.rows,
    },
  ];
}

function buildPolarStages(
  state: DecompositionState,
  Q: RealMatrix,
  P: RealMatrix,
): readonly DecompositionStageDescriptor[] {
  const reconstructed = multiplyRealMatrices(Q, P);
  return [
    {
      id: "input",
      label: "输入",
      symbol: "I",
      matrix: identityRealMatrix(state.columns),
      inputDimension: state.columns,
      outputDimension: state.columns,
    },
    {
      id: "first",
      label: "P 伸缩",
      symbol: "P",
      matrix: P,
      inputDimension: state.columns,
      outputDimension: state.columns,
    },
    {
      id: "second",
      label: "Q 定向",
      symbol: "QP",
      matrix: reconstructed,
      inputDimension: state.columns,
      outputDimension: state.rows,
    },
    {
      id: "output",
      label: "QP 重构",
      symbol: "A",
      matrix: state.matrix,
      inputDimension: state.columns,
      outputDimension: state.rows,
    },
  ];
}

export function deriveDecomposition(state: DecompositionState) {
  const svd = svdRealMatrix(state.matrix);
  const polar = rightPolarDecompositionReal(state.matrix);
  const stages =
    state.mode === "svd"
      ? buildSvdStages(state, svd.U, svd.sigma, svd.V)
      : buildPolarStages(state, polar.Q, polar.P);
  const currentStage = stages.find((stage) => stage.id === state.stage)!;
  const innerDimension = Math.min(state.rows, state.columns);
  const rankDeficient = svd.rank < innerDimension;
  const partialIsometry = state.rows !== state.columns || rankDeficient;

  return {
    svd,
    polar,
    stages,
    currentStage,
    rankDeficient,
    partialIsometry,
  } as const;
}
