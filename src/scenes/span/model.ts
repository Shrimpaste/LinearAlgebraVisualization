import {
  EPSILON,
  determinantMat2,
  mat2FromColumns,
  scaleVec2,
  addVec2,
  solve2,
  type Vec2,
} from "../../math";

export type SpanVectorCount = 1 | 2 | 3 | 4 | 5 | 6;

export interface SpanState {
  readonly version: 1;
  readonly vectors: readonly Vec2[];
  readonly coefficients: readonly number[];
  readonly target: Vec2;
  readonly showLattice: boolean;
  readonly showTarget: boolean;
}

export interface SpanPreset {
  readonly label: string;
  readonly vectors: readonly Vec2[];
  readonly coefficients: readonly number[];
}

const vectorSeeds: readonly Vec2[] = [
  [1.8, 0.65],
  [-0.45, 1.55],
  [1.1, -0.8],
  [-1.25, -0.35],
  [0.35, 1.75],
  [1.55, 0.15],
];

export const spanDefaults: SpanState = {
  version: 1,
  vectors: vectorSeeds.slice(0, 2),
  coefficients: [1.1, 0.85],
  target: [-1.1, 2.1],
  showLattice: true,
  showTarget: true,
};

export const spanPresets: readonly SpanPreset[] = [
  {
    label: "标准基",
    vectors: [
      [1, 0],
      [0, 1],
    ],
    coefficients: [1.25, 0.75],
  },
  {
    label: "斜基",
    vectors: [
      [1.6, 0.5],
      [-0.4, 1.4],
    ],
    coefficients: [1, 1],
  },
  {
    label: "同一直线",
    vectors: [
      [1.3, 0.65],
      [-2, -1],
      [0.6, 0.3],
    ],
    coefficients: [1, -0.5, 0.75],
  },
  {
    label: "一个零向量",
    vectors: [
      [0, 0],
      [0.8, 1.6],
    ],
    coefficients: [1, 1],
  },
  {
    label: "两个零向量",
    vectors: [
      [0, 0],
      [0, 0],
    ],
    coefficients: [1, 1],
  },
  {
    label: "冗余生成组",
    vectors: [
      [0, 0],
      [1.5, 0],
      [3, 0],
      [0.4, 1.4],
    ],
    coefficients: [0.5, 1, -0.3, 0.8],
  },
  {
    label: "近似共线",
    vectors: [
      [1, 1],
      [1, 1.04],
      [-0.6, 1.2],
    ],
    coefficients: [1, 0.5, -0.4],
  },
  {
    label: "六向量",
    vectors: vectorSeeds,
    coefficients: [1, 0.6, -0.4, 0.75, -0.25, 0.45],
  },
] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function finiteNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function coerceVector(value: unknown, fallback: Vec2): Vec2 {
  const source = Array.isArray(value) ? value : [];
  return [
    finiteNumber(source[0], fallback[0]),
    finiteNumber(source[1], fallback[1]),
  ];
}

function vectorCount(value: number): SpanVectorCount {
  return Math.min(6, Math.max(1, Math.trunc(value))) as SpanVectorCount;
}

function normalizeVectors(value: unknown): readonly Vec2[] {
  const source =
    Array.isArray(value) && value.length > 0 ? value : spanDefaults.vectors;
  const count = vectorCount(source.length);
  return Array.from({ length: count }, (_, index) =>
    coerceVector(source[index], vectorSeeds[index] ?? [1, 0]),
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
  const vectors = [
    coerceVector(record.first, spanDefaults.vectors[0]!),
    coerceVector(record.second, spanDefaults.vectors[1]!),
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
    version: 1,
    vectors,
    coefficients: normalizeCoefficients(legacyCoefficients, 2, [1.1, 0.85]),
    target: coerceVector(record.target, spanDefaults.target),
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
  if (record.version !== 1) return spanDefaults;

  const vectors = normalizeVectors(record.vectors);
  const count = vectorCount(vectors.length);
  return {
    version: 1,
    vectors,
    coefficients: normalizeCoefficients(
      record.coefficients,
      count,
      spanDefaults.coefficients,
    ),
    target: coerceVector(record.target, spanDefaults.target),
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
      (_, index) => state.vectors[index] ?? vectorSeeds[index]!,
    ),
    coefficients: Array.from(
      { length: count },
      (_, index) => state.coefficients[index] ?? 0,
    ),
  };
}

function maxComponent(vector: Vec2) {
  return Math.max(Math.abs(vector[0]), Math.abs(vector[1]));
}

function addsIndependentDirection(first: Vec2, candidate: Vec2) {
  const firstScale = maxComponent(first);
  const candidateScale = maxComponent(candidate);
  if (firstScale === 0 || candidateScale === 0) return false;
  const normalizedDeterminant =
    (first[0] / firstScale) * (candidate[1] / candidateScale) -
    (first[1] / firstScale) * (candidate[0] / candidateScale);
  return Math.abs(normalizedDeterminant) > EPSILON;
}

export function selectSpanBasisIndices(vectors: readonly Vec2[]) {
  const basisIndices: number[] = [];
  for (let index = 0; index < vectors.length; index += 1) {
    const vector = vectors[index]!;
    if (maxComponent(vector) === 0) continue;
    if (basisIndices.length === 0) {
      basisIndices.push(index);
    } else if (addsIndependentDirection(vectors[basisIndices[0]!]!, vector)) {
      basisIndices.push(index);
      break;
    }
  }
  return basisIndices as readonly number[];
}

export function deriveSpan(state: SpanState) {
  const basisIndices = selectSpanBasisIndices(state.vectors);
  const rank = basisIndices.length as 0 | 1 | 2;
  const firstBasis = state.vectors[basisIndices[0] ?? -1] ?? ([0, 0] as const);
  const secondBasis = state.vectors[basisIndices[1] ?? -1] ?? ([0, 0] as const);
  const basisMatrix = mat2FromColumns(firstBasis, secondBasis);
  const determinant = determinantMat2(basisMatrix);
  const combination = state.vectors.reduce<Vec2>(
    (sum, vector, index) =>
      addVec2(sum, scaleVec2(vector, state.coefficients[index] ?? 0)),
    [0, 0],
  );
  const targetSolution = solve2(basisMatrix, state.target);
  const classification =
    rank === 2 ? "整个平面 R²" : rank === 1 ? "一条直线" : "原点";
  return {
    basisIndices,
    basisMatrix,
    determinant,
    rank,
    combination,
    targetSolution,
    classification,
    isBasis: rank === 2 && state.vectors.length === 2,
  } as const;
}
