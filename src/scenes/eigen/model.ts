import {
  IDENTITY_MAT2,
  analyzeBasis,
  analyzeEigenvalues,
  applyMat2,
  columnsOfMat2,
  coordinatesFromStandard,
  lengthVec2,
  matrixInBases,
  normalizeVec2,
  type EigenAnalysis,
  type Mat2,
  type Vec2,
} from "../../math";

export type EigenBasisMode = "standard" | "custom";

export interface EigenState {
  readonly version: 1;
  matrix: Mat2;
  basisMode: EigenBasisMode;
  basis: Mat2;
  seed: Vec2;
  iterations: number;
  showField: boolean;
  showOrbit: boolean;
}

export const eigenDefaults: EigenState = {
  version: 1,
  matrix: [2, 1, 1, 2],
  basisMode: "standard",
  basis: IDENTITY_MAT2,
  seed: [1.4, 0.35],
  iterations: 5,
  showField: true,
  showOrbit: true,
};

export const eigenPresets: readonly { label: string; value: Mat2 }[] = [
  { label: "双实根", value: [2, 1, 1, 2] },
  { label: "鞍点", value: [1.3, 0.5, 0.4, -0.9] },
  { label: "重根", value: [1.4, 0, 0, 1.4] },
  { label: "缺陷矩阵", value: [1, 1, 0, 1] },
  { label: "纯旋转", value: [0, -1, 1, 0] },
  { label: "旋转伸缩", value: [0.9, -0.7, 0.7, 0.9] },
];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function finiteNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function coerceMat2(value: unknown, fallback: Mat2): Mat2 {
  if (!Array.isArray(value)) return fallback;
  return [
    finiteNumber(value[0], fallback[0]),
    finiteNumber(value[1], fallback[1]),
    finiteNumber(value[2], fallback[2]),
    finiteNumber(value[3], fallback[3]),
  ];
}

function coerceVec2(value: unknown, fallback: Vec2): Vec2 {
  if (!Array.isArray(value)) return fallback;
  return [
    finiteNumber(value[0], fallback[0]),
    finiteNumber(value[1], fallback[1]),
  ];
}

export function migrateEigenState(stored: unknown): EigenState {
  const record = asRecord(stored);
  if (!record) return eigenDefaults;
  if (record.version !== undefined && record.version !== 1) {
    return eigenDefaults;
  }

  const iterations = finiteNumber(record.iterations, eigenDefaults.iterations);
  return {
    version: 1,
    matrix: coerceMat2(record.matrix, eigenDefaults.matrix),
    basisMode: record.basisMode === "custom" ? "custom" : "standard",
    basis: coerceMat2(record.basis, eigenDefaults.basis),
    seed: coerceVec2(record.seed, eigenDefaults.seed),
    iterations: Math.min(9, Math.max(1, Math.round(iterations))),
    showField:
      typeof record.showField === "boolean"
        ? record.showField
        : eigenDefaults.showField,
    showOrbit:
      typeof record.showOrbit === "boolean"
        ? record.showOrbit
        : eigenDefaults.showOrbit,
  };
}

interface StandardEigenvector {
  readonly label: string;
  readonly eigenvalue: number;
  readonly vector: Vec2;
}

export interface EigenvectorCoordinateReadout extends StandardEigenvector {
  readonly basisCoordinates: Vec2 | null;
}

function standardEigenvectors(
  analysis: EigenAnalysis,
): readonly StandardEigenvector[] {
  switch (analysis.kind) {
    case "two-real":
      return analysis.eigenpairs.map((pair, index) => ({
        label: index === 0 ? "q₁" : "q₂",
        eigenvalue: pair.value,
        vector: pair.vector,
      }));
    case "repeated":
      return [
        { label: "q₁", eigenvalue: analysis.eigenvalue, vector: [1, 0] },
        { label: "q₂", eigenvalue: analysis.eigenvalue, vector: [0, 1] },
      ];
    case "defective":
      return [
        {
          label: "q",
          eigenvalue: analysis.eigenvalue,
          vector: analysis.eigenvector,
        },
      ];
    case "complex":
      return [];
  }
}

export function deriveEigen(state: EigenState) {
  const analysis = analyzeEigenvalues(state.matrix);
  const activeBasisMatrix =
    state.basisMode === "custom" ? state.basis : IDENTITY_MAT2;
  const activeBasis = columnsOfMat2(activeBasisMatrix);
  const basisAnalysis = analyzeBasis(activeBasis);
  const coordinateMatrix = basisAnalysis.isBasis
    ? matrixInBases(state.matrix, activeBasis)
    : null;
  const coordinateAnalysis =
    coordinateMatrix === null ? null : analyzeEigenvalues(coordinateMatrix);
  const eigenvectors: readonly EigenvectorCoordinateReadout[] =
    standardEigenvectors(analysis).map((entry) => ({
      ...entry,
      basisCoordinates: basisAnalysis.isBasis
        ? coordinatesFromStandard(entry.vector, activeBasis)
        : null,
    }));
  const orbit: Vec2[] = [state.seed];
  let current = state.seed;
  for (let index = 0; index < state.iterations; index += 1) {
    const transformed = applyMat2(state.matrix, current);
    const normalized = normalizeVec2(transformed);
    if (normalized === null) {
      orbit.push([0, 0]);
      break;
    }
    const length = Math.min(2.8, Math.max(1.2, lengthVec2(current)));
    current = [normalized[0] * length, normalized[1] * length];
    orbit.push(current);
  }
  return {
    analysis,
    basisAnalysis,
    coordinateAnalysis,
    coordinateMatrix,
    eigenvectors,
    orbit,
  } as const;
}
