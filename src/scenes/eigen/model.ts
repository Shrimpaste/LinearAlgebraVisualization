import {
  analyzeRealBasis,
  identityRealMatrix,
  inverseRealMatrix,
  multiplyRealMatrices,
  solveRealEigensystem,
  applyRealMatrix,
  type Dimension,
  type RealMatrix,
  type RealVector,
} from "../../math/nd";

export type EigenBasisMode = "standard" | "custom";

export interface EigenState {
  readonly version: 2;
  readonly dimension: Dimension;
  readonly matrix: RealMatrix;
  readonly basisMode: EigenBasisMode;
  readonly basis: RealMatrix;
  readonly probe?: RealVector;
  readonly reveal?: boolean;
}

export const eigenDefaults: EigenState = {
  version: 2,
  dimension: 2,
  matrix: [
    [2, 1],
    [1, 2],
  ],
  basisMode: "standard",
  basis: identityRealMatrix(2),
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function finite(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function dimension(value: unknown): Dimension {
  return value === 1 || value === 2 || value === 3 ? value : 2;
}

function coerceMatrix(
  value: unknown,
  size: Dimension,
  fallback: RealMatrix,
): RealMatrix {
  const rows = Array.isArray(value) ? value : [];
  return Array.from({ length: size }, (_, row) => {
    const source = Array.isArray(rows[row]) ? rows[row] : [];
    return Array.from({ length: size }, (_, column) =>
      finite(
        source[column],
        fallback[row]?.[column] ?? (row === column ? 1 : 0),
      ),
    );
  });
}

function legacyMat2(value: unknown, fallback: RealMatrix): RealMatrix {
  if (!Array.isArray(value)) return fallback;
  return [
    [finite(value[0], fallback[0]![0]!), finite(value[1], fallback[0]![1]!)],
    [finite(value[2], fallback[1]![0]!), finite(value[3], fallback[1]![1]!)],
  ];
}

/** Migrates v1 while deliberately dropping seed/iteration/field/orbit state. */
export function migrateEigenState(stored: unknown): EigenState {
  const record = asRecord(stored);
  if (!record) return eigenDefaults;
  if (
    record.version !== undefined &&
    record.version !== 1 &&
    record.version !== 2
  ) {
    return eigenDefaults;
  }
  if (record.version !== 2) {
    return {
      version: 2,
      dimension: 2,
      matrix: legacyMat2(record.matrix, eigenDefaults.matrix),
      basisMode: record.basisMode === "custom" ? "custom" : "standard",
      basis: legacyMat2(record.basis, identityRealMatrix(2)),
    };
  }
  const size = dimension(record.dimension);
  return {
    version: 2,
    dimension: size,
    matrix: coerceMatrix(record.matrix, size, identityRealMatrix(size)),
    basisMode: record.basisMode === "custom" ? "custom" : "standard",
    basis: coerceMatrix(record.basis, size, identityRealMatrix(size)),
    probe: Array.from({ length: size }, (_, index) =>
      finite(
        Array.isArray(record.probe) ? record.probe[index] : undefined,
        index === 0 ? 1.5 : 0.4,
      ),
    ),
    reveal: record.reveal !== false,
  };
}

export function resizeEigenState(
  state: EigenState,
  size: Dimension,
): EigenState {
  const resizeWithIdentity = (matrix: RealMatrix) =>
    Array.from({ length: size }, (_, row) =>
      Array.from(
        { length: size },
        (_, column) => matrix[row]?.[column] ?? (row === column ? 1 : 0),
      ),
    );
  return {
    ...state,
    dimension: size,
    matrix: resizeWithIdentity(state.matrix),
    basis: resizeWithIdentity(state.basis),
    probe: Array.from(
      { length: size },
      (_, index) => state.probe?.[index] ?? (index === 0 ? 1.5 : 0.4),
    ),
  };
}

/** Converts the editable matrix when changing coordinates, preserving T. */
export function changeEigenBasisMode(
  state: EigenState,
  mode: EigenBasisMode,
): EigenState | null {
  if (mode === state.basisMode) return state;
  const inverse = inverseRealMatrix(state.basis);
  if (!inverse) return null;
  const matrix =
    mode === "custom"
      ? multiplyRealMatrices(
          multiplyRealMatrices(inverse, state.matrix),
          state.basis,
        )
      : multiplyRealMatrices(
          multiplyRealMatrices(state.basis, state.matrix),
          inverse,
        );
  return { ...state, basisMode: mode, matrix };
}

export function setBasisVector(
  basis: RealMatrix,
  index: number,
  vector: RealVector,
): RealMatrix {
  return basis.map((row, rowIndex) =>
    row.map((value, column) =>
      column === index ? (vector[rowIndex] ?? 0) : value,
    ),
  );
}

export function basisVector(basis: RealMatrix, index: number): RealVector {
  return basis.map((row) => row[index] ?? 0);
}

export function eigenPresets(
  size: Dimension,
): readonly { label: string; value: RealMatrix }[] {
  if (size === 1)
    return [
      { label: "伸缩", value: [[2]] },
      { label: "翻转", value: [[-1]] },
    ] as const;
  if (size === 2)
    return [
      {
        label: "双实根",
        value: [
          [2, 1],
          [1, 2],
        ],
      },
      {
        label: "重根",
        value: [
          [1.4, 0],
          [0, 1.4],
        ],
      },
      {
        label: "缺陷矩阵",
        value: [
          [1, 1],
          [0, 1],
        ],
      },
      {
        label: "纯旋转",
        value: [
          [0, -1],
          [1, 0],
        ],
      },
    ] as const;
  return [
    {
      label: "三实轴",
      value: [
        [3, 0, 0],
        [0, 2, 0],
        [0, 0, 1],
      ],
    },
    {
      label: "耦合实根",
      value: [
        [3, 1, 0],
        [0, 2, 1],
        [0, 0, 1],
      ],
    },
    {
      label: "缺陷矩阵",
      value: [
        [2, 1, 0],
        [0, 2, 0],
        [0, 0, -1],
      ],
    },
    {
      label: "旋转 + 实轴",
      value: [
        [0, -1, 0],
        [1, 0, 0],
        [0, 0, 2],
      ],
    },
  ] as const;
}

export function deriveEigen(state: EigenState) {
  const basisAnalysis = analyzeRealBasis(state.basis);
  const inverse = inverseRealMatrix(state.basis);
  const physicalMatrix =
    state.basisMode === "standard"
      ? state.matrix
      : inverse
        ? multiplyRealMatrices(
            multiplyRealMatrices(state.basis, state.matrix),
            inverse,
          )
        : null;
  const eigensystem = physicalMatrix
    ? solveRealEigensystem(physicalMatrix)
    : null;
  return { basisAnalysis, physicalMatrix, eigensystem } as const;
}

export function eigenProbe(
  matrix: RealMatrix,
  vector: RealVector,
  progress = 1,
) {
  const mapped = applyRealMatrix(matrix, vector);
  const norm = Math.hypot(...vector);
  const mappedNorm = Math.hypot(...mapped);
  const dot = vector.reduce((sum, value, i) => sum + value * mapped[i]!, 0);
  const lambda = norm > 0 ? dot / (norm * norm) : 0;
  const residual =
    norm > 0
      ? Math.hypot(...mapped.map((value, i) => value - lambda * vector[i]!)) /
        Math.max(mappedNorm, norm)
      : Infinity;
  return {
    mapped,
    animated: vector.map((value, i) => value + (mapped[i]! - value) * progress),
    lambda,
    residual,
    isEigenvector: norm > 1e-10 && residual < 0.015,
  };
}
