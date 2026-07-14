import {
  analyzeEigenvalues,
  applyMat2,
  lengthVec2,
  normalizeVec2,
  type Mat2,
  type Vec2,
} from "../../math";

export interface EigenState {
  matrix: Mat2;
  seed: Vec2;
  iterations: number;
  showField: boolean;
  showOrbit: boolean;
}

export const eigenDefaults: EigenState = {
  matrix: [2, 1, 1, 2],
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

export function deriveEigen(state: EigenState) {
  const analysis = analyzeEigenvalues(state.matrix);
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
  return { analysis, orbit } as const;
}
