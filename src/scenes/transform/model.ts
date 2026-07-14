import {
  IDENTITY_MAT2,
  analyzeBasis,
  applyMat2,
  determinantMat2,
  effectiveMatrix,
  rankMat2,
  traceMat2,
  type Basis2,
  type Mat2,
  type Vec2,
} from "../../math";

export type BasisMode = "standard" | "custom";

export interface TransformState {
  matrix: Mat2;
  vector: Vec2;
  basisMode: BasisMode;
  basis: Basis2;
  showGrid: boolean;
  showCircle: boolean;
  showTrail: boolean;
}

export const transformDefaults: TransformState = {
  matrix: [1.35, 0.65, -0.25, 1.05],
  vector: [1.5, 1],
  basisMode: "standard",
  basis: [
    [1, 0],
    [0, 1],
  ],
  showGrid: true,
  showCircle: true,
  showTrail: true,
};

export const transformPresets: readonly { label: string; value: Mat2 }[] = [
  { label: "旋转 30°", value: [Math.sqrt(3) / 2, -0.5, 0.5, Math.sqrt(3) / 2] },
  { label: "水平剪切", value: [1, 1, 0, 1] },
  { label: "非均匀缩放", value: [1.8, 0, 0, 0.55] },
  { label: "镜像翻转", value: [-1, 0, 0, 1] },
  { label: "斜投影", value: [1, 0.6, 0, 0] },
  { label: "单位变换", value: IDENTITY_MAT2 },
];

export function deriveTransform(state: TransformState) {
  const basisAnalysis = analyzeBasis(state.basis);
  const effective =
    state.basisMode === "custom"
      ? effectiveMatrix(state.matrix, state.basis)
      : state.matrix;
  const valid = effective !== null;
  const determinant = effective === null ? null : determinantMat2(effective);
  const rank = effective === null ? null : rankMat2(effective);
  const output = effective === null ? null : applyMat2(effective, state.vector);
  const orientation =
    rank === null
      ? "无效"
      : rank < 2
        ? "坍缩"
        : determinant! < 0
          ? "翻转"
          : "保持";
  return {
    valid,
    matrix: effective,
    output,
    determinant,
    trace: effective === null ? null : traceMat2(effective),
    rank,
    orientation,
    basisAnalysis,
  } as const;
}
