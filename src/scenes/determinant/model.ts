import {
  columnsOfMat2,
  determinantMat2,
  rankMat2,
  IDENTITY_MAT2,
  interpolateMat2,
  type Mat2,
} from "../../math";

export interface DeterminantState {
  matrix: Mat2;
  showSource: boolean;
  showGrid: boolean;
  showSweep: boolean;
  animationFrom?: Mat2;
  animationKind?: "linear" | "rotation";
  operation?: string;
}

/** The displayed matrix, distinct from the final target matrix. */
export function determinantFrame(
  state: DeterminantState,
  progress: number,
): Mat2 {
  const t = Math.max(0, Math.min(1, progress));
  if (state.animationKind === "rotation") {
    const angle = Math.atan2(state.matrix[2], state.matrix[0]) * t;
    return [
      Math.cos(angle),
      -Math.sin(angle),
      Math.sin(angle),
      Math.cos(angle),
    ];
  }
  return interpolateMat2(state.animationFrom ?? IDENTITY_MAT2, state.matrix, t);
}

export const determinantDefaults: DeterminantState = {
  matrix: [1.6, 0.55, 0.35, 1.35],
  showSource: true,
  showGrid: true,
  showSweep: true,
};

export const determinantPresets: readonly { label: string; value: Mat2 }[] = [
  { label: "面积 ×2", value: [2, 0, 0, 1] },
  { label: "保持面积", value: [1, 1, 0, 1] },
  { label: "反向", value: [0, 1, 1, 0] },
  { label: "坍缩", value: [1, 2, 0.5, 1] },
  { label: "旋转", value: [0, -1, 1, 0] },
  { label: "微小面积", value: [1, 0.99, 1, 1] },
];

export function deriveDeterminant(state: DeterminantState) {
  const determinant = determinantMat2(state.matrix);
  const [column1, column2] = columnsOfMat2(state.matrix);
  const rank = rankMat2(state.matrix);
  const orientation = rank < 2 ? "无定向" : determinant > 0 ? "正向" : "反向";
  return {
    determinant,
    area: Math.abs(determinant),
    column1,
    column2,
    rank,
    orientation,
  } as const;
}
