import {
  determinantMat2,
  mat2FromColumns,
  rankMat2,
  scaleVec2,
  addVec2,
  solve2,
  type Vec2,
} from "../../math";

export interface SpanState {
  first: Vec2;
  second: Vec2;
  target: Vec2;
  alpha: number;
  beta: number;
  showLattice: boolean;
  showTarget: boolean;
}

export const spanDefaults: SpanState = {
  first: [1.8, 0.65],
  second: [-0.45, 1.55],
  target: [-1.1, 2.1],
  alpha: 1.1,
  beta: 0.85,
  showLattice: true,
  showTarget: true,
};

export const spanPresets: readonly {
  label: string;
  first: Vec2;
  second: Vec2;
}[] = [
  { label: "标准基", first: [1, 0], second: [0, 1] },
  { label: "斜基", first: [1.6, 0.5], second: [-0.4, 1.4] },
  { label: "同一直线", first: [1.3, 0.65], second: [-2, -1] },
  { label: "一个零向量", first: [0, 0], second: [0.8, 1.6] },
  { label: "两个零向量", first: [0, 0], second: [0, 0] },
  { label: "近似共线", first: [1, 1], second: [1, 1.04] },
];

export function deriveSpan(state: SpanState) {
  const matrix = mat2FromColumns(state.first, state.second);
  const determinant = determinantMat2(matrix);
  const rank = rankMat2(matrix);
  const combination = addVec2(
    scaleVec2(state.first, state.alpha),
    scaleVec2(state.second, state.beta),
  );
  const targetSolution = solve2(matrix, state.target);
  const classification =
    rank === 2 ? "整个平面 R²" : rank === 1 ? "一条直线" : "原点";
  return {
    matrix,
    determinant,
    rank,
    combination,
    targetSolution,
    classification,
    isBasis: rank === 2,
  } as const;
}
