import { describe, expect, it } from "vitest";
import { multiplyRealMatrices } from "../../math/nd";
import {
  applyDecompositionPreset,
  decompositionDefaults,
  decompositionPresets,
  deriveDecomposition,
  migrateDecompositionState,
  resizeDecompositionState,
  type DecompositionState,
} from "./model";

function shape(matrix: readonly (readonly number[])[]) {
  return [matrix.length, matrix[0]?.length ?? 0] as const;
}

function expectMatrixClose(
  actual: readonly (readonly number[])[],
  expected: readonly (readonly number[])[],
) {
  expect(shape(actual)).toEqual(shape(expected));
  actual.forEach((row, rowIndex) =>
    row.forEach((value, columnIndex) =>
      expect(value).toBeCloseTo(expected[rowIndex]![columnIndex]!, 10),
    ),
  );
}

function stateWith(
  rows: 1 | 2 | 3,
  columns: 1 | 2 | 3,
  matrix: readonly (readonly number[])[],
): DecompositionState {
  return { ...decompositionDefaults, rows, columns, matrix };
}

describe("decomposition scene model", () => {
  it("decomposes tall and wide matrices with shape-correct thin factors", () => {
    const tall = deriveDecomposition(
      stateWith(3, 2, [
        [1, 2],
        [0, 1],
        [2, -1],
      ]),
    );
    expect(shape(tall.svd.U)).toEqual([3, 2]);
    expect(shape(tall.svd.sigma)).toEqual([2, 2]);
    expect(shape(tall.svd.V)).toEqual([2, 2]);
    expect(shape(tall.polar.Q)).toEqual([3, 2]);
    expect(shape(tall.polar.P)).toEqual([2, 2]);
    expect(tall.svd.reconstructionResidual).toBeLessThan(1e-10);

    const wide = deriveDecomposition(
      stateWith(2, 3, [
        [1, 0, 2],
        [0, 1, -1],
      ]),
    );
    expect(shape(wide.svd.U)).toEqual([2, 2]);
    expect(shape(wide.svd.sigma)).toEqual([2, 2]);
    expect(shape(wide.svd.V)).toEqual([3, 2]);
    expect(shape(wide.polar.Q)).toEqual([2, 3]);
    expect(shape(wide.polar.P)).toEqual([3, 3]);
    expect(wide.polar.polarReconstructionResidual).toBeLessThan(1e-10);
  });

  it("marks rectangular and rank-deficient Q as a non-unique partial isometry", () => {
    const deficient = deriveDecomposition(
      stateWith(2, 2, [
        [1, 2],
        [0.5, 1],
      ]),
    );
    expect(deficient.svd.rank).toBe(1);
    expect(deficient.rankDeficient).toBe(true);
    expect(deficient.partialIsometry).toBe(true);
    expect(deficient.svd.condition).toBe(Infinity);

    const rectangular = deriveDecomposition(
      stateWith(3, 2, [
        [1, 0],
        [0, 1],
        [1, 1],
      ]),
    );
    expect(rectangular.rankDeficient).toBe(false);
    expect(rectangular.partialIsometry).toBe(true);
  });

  it("builds legal cumulative stage matrices for SVD and right polar modes", () => {
    const base = stateWith(3, 2, [
      [1, 0],
      [0, 2],
      [1, 1],
    ]);
    const svd = deriveDecomposition(base);
    expect(
      svd.stages.map((stage) => [
        stage.id,
        shape(stage.matrix),
        stage.inputDimension,
        stage.outputDimension,
      ]),
    ).toEqual([
      ["input", [2, 2], 2, 2],
      ["first", [2, 2], 2, 2],
      ["second", [2, 2], 2, 2],
      ["output", [3, 2], 2, 3],
    ]);

    const polar = deriveDecomposition({ ...base, mode: "polar" });
    expect(
      polar.stages.map((stage) => [
        stage.id,
        shape(stage.matrix),
        stage.inputDimension,
        stage.outputDimension,
      ]),
    ).toEqual([
      ["input", [2, 2], 2, 2],
      ["first", [2, 2], 2, 2],
      ["second", [3, 2], 2, 3],
      ["output", [3, 2], 2, 3],
    ]);

    for (const stage of [...svd.stages, ...polar.stages]) {
      expect(stage.matrix).toHaveLength(stage.outputDimension);
      stage.matrix.forEach((row) =>
        expect(row).toHaveLength(stage.inputDimension),
      );
    }

    expect(polar.stages[2]!.symbol).toBe("QP");
    expectMatrixClose(
      polar.stages[2]!.matrix,
      multiplyRealMatrices(polar.polar.Q, polar.polar.P),
    );
    expect(polar.stages[3]!.symbol).toBe("A");
    expect(polar.stages[3]!.matrix).toBe(base.matrix);
  });

  it("resizes safely while preserving overlap and filling new diagonal cells", () => {
    const expanded = resizeDecompositionState(decompositionDefaults, 3, 3);
    expect(expanded.matrix).toEqual([
      [1.45, 0.65, 0],
      [-0.35, 0.9, 0],
      [0, 0, 1],
    ]);
    expect(expanded.stage).toBe("input");

    const narrowed = resizeDecompositionState(expanded, 1, 2);
    expect(narrowed.matrix).toEqual([[1.45, 0.65]]);
  });

  it("migrates malformed JSON-shaped values to finite, valid state", () => {
    const migrated = migrateDecompositionState({
      version: 1,
      rows: 3,
      columns: 2,
      matrix: { entries: [2, Number.NaN, 3, 4, 5, Number.POSITIVE_INFINITY] },
      mode: "polar",
      stage: "unknown",
      showGrid: false,
      showSphere: "yes",
    });

    expect(migrated).toMatchObject({
      version: 1,
      rows: 3,
      columns: 2,
      mode: "polar",
      stage: "output",
      showGrid: false,
      showSphere: true,
    });
    expect(migrated.matrix).toEqual([
      [2, 0],
      [3, 4],
      [5, 0],
    ]);
    expect(migrateDecompositionState(null)).toBe(decompositionDefaults);
    expect(migrateDecompositionState({ version: 2, rows: 3 })).toBe(
      decompositionDefaults,
    );
  });

  it("offers the five required shape presets and applies them immutably", () => {
    expect(decompositionPresets.map((preset) => preset.label)).toEqual([
      "满秩",
      "秩亏",
      "宽矩阵",
      "高矩阵",
      "旋转 + 缩放",
    ]);

    for (const preset of decompositionPresets) {
      expect(shape(preset.value.matrix)).toEqual([
        preset.value.rows,
        preset.value.columns,
      ]);
      preset.value.matrix
        .flat()
        .forEach((entry) => expect(Number.isFinite(entry)).toBe(true));
    }

    const wide = applyDecompositionPreset(
      decompositionDefaults,
      decompositionPresets[2]!.value,
    );
    expect(wide).toMatchObject({ rows: 2, columns: 3, stage: "output" });
    expect(wide.matrix).not.toBe(decompositionPresets[2]!.value.matrix);
  });
});
