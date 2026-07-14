import { lazy } from "react";
import type { SceneMeta } from "./types";
import { DeterminantScene } from "../scenes/determinant/DeterminantScene";
import { EigenScene } from "../scenes/eigen/EigenScene";
import { InnerProductScene } from "../scenes/inner-product/InnerProductScene";
import { SpanScene } from "../scenes/span/SpanScene";
import { TransformScene } from "../scenes/transform/TransformScene";

const OperatorScene = lazy(() =>
  import("../scenes/operator/OperatorScene").then((module) => ({
    default: module.OperatorScene,
  })),
);
const DecompositionScene = lazy(() =>
  import("../scenes/decomposition/DecompositionScene").then((module) => ({
    default: module.DecompositionScene,
  })),
);

export const scenes: readonly SceneMeta[] = [
  {
    id: "span",
    index: "01",
    label: "向量张成",
    shortLabel: "张成",
    subtitle: "从一个方向，到整个平面",
    component: SpanScene,
  },
  {
    id: "transform",
    index: "02",
    label: "线性变换",
    shortLabel: "变换",
    subtitle: "观察矩阵如何重塑空间",
    component: TransformScene,
  },
  {
    id: "eigen",
    index: "03",
    label: "特征系统",
    shortLabel: "特征",
    subtitle: "寻找变换中不偏转的方向",
    component: EigenScene,
  },
  {
    id: "inner-product",
    index: "04",
    label: "内积空间",
    shortLabel: "内积",
    subtitle: "重定义长度、角度与投影",
    component: InnerProductScene,
  },
  {
    id: "determinant",
    index: "05",
    label: "行列式",
    shortLabel: "行列式",
    subtitle: "读取面积缩放与空间定向",
    component: DeterminantScene,
  },
  {
    id: "operator",
    index: "06",
    label: "谱分解",
    shortLabel: "谱定理",
    subtitle: "检验自伴与正规，并构造酉对角化",
    component: OperatorScene,
  },
  {
    id: "decomposition",
    index: "07",
    label: "矩阵分解",
    shortLabel: "SVD / 极",
    subtitle: "拆解主方向、伸缩与定向",
    component: DecompositionScene,
  },
] as const;

export function isSceneId(value: string): value is SceneMeta["id"] {
  return scenes.some((scene) => scene.id === value);
}
