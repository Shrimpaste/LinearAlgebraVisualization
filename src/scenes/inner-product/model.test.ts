import { describe, expect, it } from "vitest";
import { complex } from "../../math/nd";
import {
  changeInnerProductField,
  deriveInnerProduct,
  innerProductDefaults,
  metricForPreset,
  migrateInnerProductState,
  resizeInnerProductState,
} from "./model";

describe("inner-product scene model", () => {
  it("migrates the deployed real 2D metric state", () => {
    const migrated = migrateInnerProductState({
      first: [2, 1],
      second: [1, -1],
      mode: "gram-schmidt",
      metricPreset: "custom",
      metric: [2, 0.5, 0.5, 1],
      showMetricCircle: false,
    });
    expect(migrated).toMatchObject({
      version: 2,
      field: "R",
      dimension: 2,
      first: [complex(2), complex(1)],
      mode: "gram-schmidt",
      metric: [
        [complex(2), complex(0.5)],
        [complex(0.5), complex(1)],
      ],
      showMetricCircle: false,
    });
    expect(migrateInnerProductState({ version: 3, field: "C" })).toBe(
      innerProductDefaults,
    );
  });

  it("normalizes cross-field v2 presets to custom without losing the metric", () => {
    const realMetric = [
      [complex(2), complex(0.25)],
      [complex(0.25), complex(1.5)],
    ];
    const migratedReal = migrateInnerProductState({
      version: 2,
      field: "R",
      dimension: 2,
      metricPreset: "hermitian",
      metric: realMetric,
    });
    expect(migratedReal.metricPreset).toBe("custom");
    expect(migratedReal.metric).toEqual(realMetric);

    const complexMetric = [
      [complex(2), complex(0.2, 0.4)],
      [complex(0.2, -0.4), complex(1.25)],
    ];
    const migratedComplex = migrateInnerProductState({
      version: 2,
      field: "C",
      dimension: 2,
      metricPreset: "correlated",
      metric: complexMetric,
    });
    expect(migratedComplex.metricPreset).toBe("custom");
    expect(migratedComplex.metric).toEqual(complexMetric);
  });

  it("validates a complex Hermitian positive metric and all four axioms", () => {
    const state = changeInnerProductField(innerProductDefaults, "C");
    const metric = metricForPreset("hermitian", "C", 2);
    const derived = deriveInnerProduct({
      ...state,
      metric,
      metricPreset: "hermitian",
    });
    expect(derived.valid).toBe(true);
    expect(derived.validation.positiveDefinite.passed).toBe(true);
    expect(derived.validation.firstSlotAdditivity.passed).toBe(true);
    expect(derived.validation.firstSlotHomogeneity.passed).toBe(true);
    expect(derived.validation.conjugateSymmetry.passed).toBe(true);
    expect(derived.gramSchmidt.rank).toBe(2);
  });

  it("keeps vector orientation in R and uses ray angle in C", () => {
    const opposite = {
      ...innerProductDefaults,
      first: [complex(1), complex(0)],
      second: [complex(-1), complex(0)],
    };

    expect(deriveInnerProduct(opposite).angleDegrees).toBeCloseTo(180);
    expect(
      deriveInnerProduct({ ...opposite, field: "C" }).angleDegrees,
    ).toBeCloseTo(0);
  });

  it("separates linearity from failed conjugate symmetry", () => {
    const state = changeInnerProductField(innerProductDefaults, "C");
    const derived = deriveInnerProduct({
      ...state,
      metricPreset: "custom",
      metric: [
        [complex(1), complex(0, 1)],
        [complex(0, 1), complex(1)],
      ],
    });
    expect(derived.valid).toBe(false);
    expect(derived.validation.firstSlotAdditivity.passed).toBe(true);
    expect(derived.validation.firstSlotHomogeneity.passed).toBe(true);
    expect(derived.validation.conjugateSymmetry.passed).toBe(false);
    expect(derived.innerProduct).toBeNull();
  });

  it("resizes vectors and metrics and clears imaginary parts in R", () => {
    const complexState = changeInnerProductField(innerProductDefaults, "C");
    const resized = resizeInnerProductState(complexState, 3);
    expect(resized.first).toHaveLength(3);
    expect(resized.metric).toHaveLength(3);
    expect(resized.metric[2]![2]).toEqual(complex(1));

    const real = changeInnerProductField(
      {
        ...resized,
        first: [complex(1, 2), complex(2, -1), complex(3, 0.5)],
      },
      "R",
    );
    expect(real.first.every((entry) => entry.im === 0)).toBe(true);
  });

  it("preserves a custom metric when selecting the current field again", () => {
    const realMetric = [
      [complex(3), complex(0.4)],
      [complex(0.4), complex(1.5)],
    ];
    const realState = {
      ...innerProductDefaults,
      metricPreset: "custom" as const,
      metric: realMetric,
    };
    expect(changeInnerProductField(realState, "R")).toBe(realState);

    const complexState = {
      ...changeInnerProductField(realState, "C"),
      metricPreset: "custom" as const,
      metric: [
        [complex(2), complex(0.2, 0.6)],
        [complex(0.2, -0.6), complex(2.5)],
      ],
    };
    expect(changeInnerProductField(complexState, "C")).toBe(complexState);
  });

  it("skips a zero leading vector instead of discarding later directions", () => {
    const derived = deriveInnerProduct({
      ...innerProductDefaults,
      first: [complex(0), complex(0)],
      second: [complex(1), complex(0)],
    });

    expect(derived.gramSchmidt.rank).toBe(1);
    expect(derived.gramSchmidt.orthonormal[0]).toEqual([
      complex(1),
      complex(0),
    ]);
  });

  it("keeps Gram-Schmidt rank invariant under uniform scaling", () => {
    const scaled = (factor: number) =>
      deriveInnerProduct({
        ...innerProductDefaults,
        first: [complex(factor), complex(0)],
        second: [complex(0), complex(2 * factor)],
      }).gramSchmidt;

    expect(scaled(1).rank).toBe(2);
    expect(scaled(1e-12).rank).toBe(2);
    expect(scaled(1e12).rank).toBe(2);
  });
});
