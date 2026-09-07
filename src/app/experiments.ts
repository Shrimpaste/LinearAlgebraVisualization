import type { SceneId } from "./types";
import type { StageView } from "./stageSession";
import { stageSessions } from "./stageSession";
import { stateControllers } from "./stateBridge";
import type { RealMatrix } from "../math/nd/types";

export const experimentScenes: readonly SceneId[] = [
  "span",
  "transform",
  "eigen",
  "inner-product",
  "determinant",
  "operator",
  "decomposition",
];
export interface Experiment {
  format: "basis-lab-experiment";
  version: 1;
  scene: SceneId;
  state: unknown;
  view?: StageView;
  name: string;
}
export const sceneKey = (scene: SceneId) => `basis-lab:${scene}`;
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const dim = (value: unknown): value is 1 | 2 | 3 =>
  value === 1 || value === 2 || value === 3;
function scalar(value: unknown, complex = false): boolean {
  return complex
    ? record(value) && finite(value.re) && finite(value.im)
    : finite(value);
}
function vector(value: unknown, size: number, complex = false): boolean {
  return (
    Array.isArray(value) &&
    value.length === size &&
    value.every((entry) => scalar(entry, complex))
  );
}
function matrix(
  value: unknown,
  rows: number,
  columns: number,
  complex = false,
): boolean {
  return (
    Array.isArray(value) &&
    value.length === rows &&
    value.every((row) => vector(row, columns, complex))
  );
}
function requireValid(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}

export async function sceneCodec(scene: SceneId) {
  switch (scene) {
    case "transform": {
      const m = await import("../scenes/transform/model");
      return {
        defaults: m.transformDefaults,
        migrate: m.migrateTransformState,
      };
    }
    case "span": {
      const m = await import("../scenes/span/model");
      return { defaults: m.spanDefaults, migrate: m.migrateSpanState };
    }
    case "eigen": {
      const m = await import("../scenes/eigen/model");
      return { defaults: m.eigenDefaults, migrate: m.migrateEigenState };
    }
    case "inner-product": {
      const m = await import("../scenes/inner-product/model");
      return {
        defaults: m.innerProductDefaults,
        migrate: m.migrateInnerProductState,
      };
    }
    case "operator": {
      const m = await import("../scenes/operator/model");
      return { defaults: m.operatorDefaults, migrate: m.migrateOperatorState };
    }
    case "decomposition": {
      const m = await import("../scenes/decomposition/model");
      return {
        defaults: m.decompositionDefaults,
        migrate: m.migrateDecompositionState,
      };
    }
    case "determinant": {
      const m = await import("../scenes/determinant/model");
      return {
        defaults: m.determinantDefaults,
        migrate: (value: unknown) => {
          const r = value as Record<string, unknown>;
          return {
            ...m.determinantDefaults,
            matrix: r.matrix as typeof m.determinantDefaults.matrix,
            showSource: r.showSource !== false,
            showGrid: r.showGrid !== false,
            showSweep: r.showSweep !== false,
            animationFrom: r.animationFrom as
              typeof m.determinantDefaults.matrix | undefined,
            animationKind:
              r.animationKind === "rotation"
                ? ("rotation" as const)
                : ("linear" as const),
            operation:
              typeof r.operation === "string"
                ? r.operation.slice(0, 300)
                : undefined,
          };
        },
      };
    }
  }
}

/** Validate before migration, so malformed dimensions never silently change the experiment. */
export async function validateExperiment(input: unknown): Promise<Experiment> {
  requireValid(
    record(input) &&
      input.format === "basis-lab-experiment" &&
      input.version === 1,
    "不支持的实验文件格式或版本。",
  );
  requireValid(
    experimentScenes.includes(input.scene as SceneId),
    "未知的实验模块。",
  );
  requireValid(record(input.state), "实验参数必须是对象。");
  const scene = input.scene as SceneId;
  const state = input.state;
  const codec = await sceneCodec(scene);
  const expected = (codec.defaults as { version?: number }).version;
  requireValid(
    state.version === expected,
    "实验参数版本不兼容；请使用当前版本导出的实验。",
  );
  if (scene === "determinant") {
    requireValid(vector(state.matrix, 4), "行列式需要四个有限实数。");
    requireValid(
      state.animationFrom === undefined || vector(state.animationFrom, 4),
      "列操作起点无效。",
    );
    if (state.animationKind === "rotation") {
      const a = state.matrix as number[];
      requireValid(
        Math.abs(a[0]! - a[3]!) < 1e-10 &&
          Math.abs(a[1]! + a[2]!) < 1e-10 &&
          Math.abs(a[0]! ** 2 + a[2]! ** 2 - 1) < 1e-10,
        "旋转路径要求目标是旋转矩阵。",
      );
    }
  } else if (scene === "transform" || scene === "decomposition") {
    requireValid(
      dim(state.rows) && dim(state.columns),
      "输入与输出维数必须为1–3。",
    );
    requireValid(
      matrix(state.matrix, state.rows, state.columns),
      "矩阵形状或数值无效。",
    );
    if (scene === "transform") {
      requireValid(
        vector(state.vector, state.columns) &&
          matrix(state.domainBasis, state.columns, state.columns) &&
          matrix(state.codomainBasis, state.rows, state.rows),
        "向量或坐标基形状无效。",
      );
      requireValid(
        matrix(state.secondMatrix, state.rows, state.columns),
        "第二步矩阵形状无效。",
      );
    }
  } else {
    requireValid(dim(state.dimension), "空间维数必须为1–3。");
    const n = state.dimension;
    if (scene === "span") {
      requireValid(
        Array.isArray(state.vectors) &&
          state.vectors.length >= 1 &&
          state.vectors.length <= 6 &&
          state.vectors.every((entry) => vector(entry, n)),
        "生成向量组无效。",
      );
      requireValid(
        vector(state.coefficients, state.vectors.length) &&
          vector(state.target, n),
        "系数或目标向量无效。",
      );
    } else if (scene === "eigen") {
      requireValid(
        matrix(state.matrix, n, n) && matrix(state.basis, n, n),
        "特征矩阵或共享坐标基无效。",
      );
      requireValid(
        state.probe === undefined || vector(state.probe, n),
        "候选向量无效。",
      );
    } else {
      requireValid(state.field === "R" || state.field === "C", "标量域无效。");
      requireValid(
        matrix(scene === "operator" ? state.matrix : state.metric, n, n, true),
        "复矩阵形状或数值无效。",
      );
      requireValid(
        scene === "operator"
          ? vector(state.vector, n, true)
          : vector(state.first, n, true) && vector(state.second, n, true),
        "复向量形状或数值无效。",
      );
      if (state.field === "R") {
        const values = [
          scene === "operator" ? state.matrix : state.metric,
          state.vector,
          state.first,
          state.second,
        ]
          .flat(3)
          .filter(record);
        requireValid(
          values.every((value) => value.im === 0),
          "实数实验不能包含非零虚部，请明确使用复数域。",
        );
      }
    }
  }
  const view = input.view;
  if (view !== undefined) {
    requireValid(
      record(view) &&
        finite(view.progress) &&
        view.progress >= 0 &&
        view.progress <= 1,
      "动画进度无效。",
    );
    requireValid(
      view.speed === undefined ||
        (finite(view.speed) && view.speed >= 0.25 && view.speed <= 4),
      "播放速度无效。",
    );
    requireValid(
      view.center === undefined || vector(view.center, 2),
      "画布中心无效。",
    );
    requireValid(
      view.scale === undefined ||
        (finite(view.scale) && view.scale > 0 && view.scale <= 10000),
      "缩放无效。",
    );
    requireValid(
      view.camera === undefined || vector(view.camera, 3),
      "相机位置无效。",
    );
    requireValid(
      view.target === undefined || vector(view.target, 3),
      "相机目标无效。",
    );
  }
  return {
    format: "basis-lab-experiment",
    version: 1,
    scene,
    state: codec.migrate(state),
    view: view as StageView | undefined,
    name:
      typeof input.name === "string" ? input.name.slice(0, 80) : "未命名实验",
  };
}

export function captureExperiment(
  scene: SceneId,
  name = "当前实验",
): Experiment {
  const state = stateControllers.get(sceneKey(scene))?.read();
  if (!state) throw new Error("场景仍在加载，请稍后再试。");
  return {
    format: "basis-lab-experiment",
    version: 1,
    scene,
    state,
    view: stageSessions.get(scene)?.capture(),
    name,
  };
}
export function encodeExperiment(experiment: Experiment) {
  const bytes = new TextEncoder().encode(JSON.stringify(experiment));
  return btoa(Array.from(bytes, (value) => String.fromCharCode(value)).join(""))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}
export async function decodeExperiment(encoded: string) {
  requireValid(encoded.length <= 64000, "实验链接过长，请使用JSON文件。");
  const binary = atob(encoded.replaceAll("-", "+").replaceAll("_", "/"));
  return validateExperiment(
    JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(binary, (char) => char.charCodeAt(0)),
      ),
    ),
  );
}
export function openExperiment(experiment: Experiment) {
  window.dispatchEvent(
    new CustomEvent("basis-open-experiment", { detail: experiment }),
  );
}

export async function transferExperiment(
  source: Experiment,
  target: SceneId,
): Promise<Experiment> {
  let physical: RealMatrix;
  if (source.scene === "transform") {
    const m = await import("../scenes/transform/model");
    const derived = m.deriveTransform(m.migrateTransformState(source.state));
    requireValid(derived.valid && derived.matrix, "当前坐标基或映射不可用。");
    physical = derived.matrix;
  } else if (source.scene === "eigen") {
    const m = await import("../scenes/eigen/model");
    const derived = m.deriveEigen(m.migrateEigenState(source.state));
    requireValid(derived.physicalMatrix, "当前共享基不可用。");
    physical = derived.physicalMatrix;
  } else if (source.scene === "determinant") {
    const a = (source.state as { matrix: number[] }).matrix;
    physical = [
      [a[0]!, a[1]!],
      [a[2]!, a[3]!],
    ];
  } else if (source.scene === "decomposition") {
    physical = (source.state as { matrix: RealMatrix }).matrix;
  } else if (source.scene === "operator") {
    const a = (source.state as { matrix: { re: number; im: number }[][] })
      .matrix;
    requireValid(
      a.every((row) => row.every((entry) => entry.im === 0)),
      "该矩阵含非零虚部，不能带入实数模块。",
    );
    physical = a.map((row) => row.map((entry) => entry.re));
  } else
    throw new Error(
      "此模块没有可携带的线性映射，请从变换、特征或分解模块开始。",
    );
  const rows = physical.length,
    columns = physical[0]!.length;
  const codec = await sceneCodec(target);
  let state: unknown;
  if (target === "transform" || target === "decomposition") {
    const model =
      target === "transform" ? await import("../scenes/transform/model") : null;
    if (model)
      state = model.migrateTransformState({
        ...model.transformDefaults,
        rows,
        columns,
        matrix: physical,
        vector: Array(columns).fill(1),
        domainBasis: Array.from({ length: columns }, (_, i) =>
          Array.from({ length: columns }, (_, j) => +(i === j)),
        ),
        codomainBasis: Array.from({ length: rows }, (_, i) =>
          Array.from({ length: rows }, (_, j) => +(i === j)),
        ),
      });
    else state = { ...codec.defaults, rows, columns, matrix: physical };
  } else if (target === "determinant") {
    requireValid(rows === 2 && columns === 2, "行列式画布当前要求2×2实矩阵。");
    state = { ...codec.defaults, matrix: physical.flat() };
  } else if (target === "eigen" || target === "operator") {
    requireValid(
      rows === columns,
      "特征/谱分解要求定义域与陪域为同一个空间的方阵。",
    );
    if (target === "eigen")
      state = {
        ...codec.defaults,
        dimension: rows,
        matrix: physical,
        basis: Array.from({ length: rows }, (_, i) =>
          Array.from({ length: rows }, (_, j) => +(i === j)),
        ),
      };
    else
      state = {
        ...codec.defaults,
        dimension: rows,
        field: "R",
        matrix: physical.map((row) => row.map((re) => ({ re, im: 0 }))),
        vector: Array.from({ length: rows }, () => ({ re: 1, im: 0 })),
      };
  } else throw new Error("目标模块不接受线性映射。");
  return validateExperiment({
    format: "basis-lab-experiment",
    version: 1,
    scene: target,
    state,
    name: "带入的标准坐标映射",
    view: { progress: 1 },
  });
}
