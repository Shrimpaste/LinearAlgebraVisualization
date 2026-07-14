import { describe, expect, it } from "vitest";
import {
  analyzeMetric,
  analyzeMetricAngle,
  analyzeMetricProjection,
  angleUnderMetric,
  dotVec2,
  gramSchmidt,
  gramSchmidt2,
  metricInnerProduct,
  metricNorm,
  projectOntoMetric,
} from "./index";

describe("SPD metric geometry", () => {
  it("validates symmetric positive-definite matrices with useful diagnostics", () => {
    expect(analyzeMetric([2, 1, 1, 3])).toMatchObject({
      kind: "spd",
      determinant: 5,
      leadingPrincipalMinor: 2,
      isPositiveDefinite: true,
    });
    expect(analyzeMetric([1, 2, 0, 1])).toMatchObject({
      kind: "not-symmetric",
      isPositiveDefinite: false,
    });
    expect(analyzeMetric([1, 2, 2, 1])).toMatchObject({
      kind: "not-positive-definite",
      isPositiveDefinite: false,
    });
    expect(analyzeMetric([1e6, 0, 0, 1e-6])).toMatchObject({
      kind: "spd",
      isPositiveDefinite: true,
    });
    expect(analyzeMetric([1e20, 1, 0, 1e20])).toMatchObject({
      kind: "not-symmetric",
      isPositiveDefinite: false,
    });
  });

  it("computes inner products and norms in a weighted geometry", () => {
    const metric = [4, 0, 0, 1] as const;
    expect(metricInnerProduct([1, 2], [3, 4], metric)).toBe(20);
    expect(metricNorm([3, 4], metric)).toBeCloseTo(Math.sqrt(52));
    expect(metricNorm([1, 0], [1, 2, 2, 1])).toBeNull();
  });

  it("projects with respect to the metric and exposes orthogonality", () => {
    const metric = [2, 1, 1, 2] as const;
    const analysis = analyzeMetricProjection([2, 0], [1, 1], metric);
    expect(analysis).not.toBeNull();
    expect(analysis!.coefficient).toBeCloseTo(1);
    expect(analysis!.projection[0]).toBeCloseTo(1);
    expect(analysis!.projection[1]).toBeCloseTo(1);
    expect(analysis!.residual[0]).toBeCloseTo(1);
    expect(analysis!.residual[1]).toBeCloseTo(-1);
    expect(analysis!.residualInnerProduct).toBeCloseTo(0);
    expect(projectOntoMetric([2, 0], [1, 1], metric)?.[0]).toBeCloseTo(1);
    expect(projectOntoMetric([2, 0], [1, 1], metric)?.[1]).toBeCloseTo(1);
    expect(projectOntoMetric([1, 2], [0, 0], metric)).toBeNull();
  });

  it("computes Euclidean and weighted angles with clamped cosine", () => {
    expect(angleUnderMetric([1, 0], [0, 1])).toBeCloseTo(Math.PI / 2);
    const weighted = analyzeMetricAngle([1, 0], [0, 1], [2, 1, 1, 2]);
    expect(weighted).not.toBeNull();
    expect(weighted!.cosine).toBeCloseTo(0.5);
    expect(weighted!.degrees).toBeCloseTo(60);
    expect(angleUnderMetric([0, 0], [1, 0])).toBeNull();
  });

  it("orthonormalizes independent inputs and records each subtraction", () => {
    const result = gramSchmidt2([1, 1], [1, 0]);
    expect(result.kind).toBe("complete");
    expect(result.rank).toBe(2);
    expect(result.steps[0]?.projections).toHaveLength(0);
    expect(result.steps[1]?.projections).toHaveLength(1);
    const [first, second] = result.orthonormal;
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(dotVec2(first!, second!)).toBeCloseTo(0);
    expect(metricInnerProduct(first!, first!)).toBeCloseTo(1);
    expect(metricInnerProduct(second!, second!)).toBeCloseTo(1);
  });

  it("uses the selected metric for Gram-Schmidt", () => {
    const metric = [2, 1, 1, 2] as const;
    const result = gramSchmidt2([1, 0], [0, 1], metric);
    expect(result.kind).toBe("complete");
    expect(
      metricInnerProduct(
        result.orthonormal[0]!,
        result.orthonormal[1]!,
        metric,
      ),
    ).toBeCloseTo(0);
  });

  it("reports dependent inputs and invalid metrics explicitly", () => {
    const dependent = gramSchmidt([
      [1, 2],
      [2, 4],
      [0, 1],
    ]);
    expect(dependent.kind).toBe("dependent");
    expect(dependent.rank).toBe(2);
    expect(dependent.rejectedIndices).toContain(1);

    const invalid = gramSchmidt2([1, 0], [0, 1], [1, 2, 2, 1]);
    expect(invalid.kind).toBe("invalid-metric");
    expect(invalid.rank).toBe(0);
    expect(invalid.rejectedIndices).toEqual([0, 1]);
  });

  it("keeps representable geometry stable for a very large metric", () => {
    const metric = [1e308, 0, 0, 1e308] as const;
    expect(metricNorm([2, 0], metric)).toBeCloseTo(2e154, 10);

    const angle = analyzeMetricAngle([2, 0], [2, 0], metric);
    expect(angle?.degrees).toBeCloseTo(0, 10);

    const projection = analyzeMetricProjection([2, 0], [2, 0], metric);
    expect(projection?.coefficient).toBeCloseTo(1, 10);
    expect(projection?.projection).toEqual([2, 0]);

    const orthonormal = gramSchmidt2([2, 0], [0, 2], metric);
    expect(orthonormal.kind).toBe("complete");
    expect(orthonormal.rank).toBe(2);
    expect(
      metricInnerProduct(
        orthonormal.orthonormal[0]!,
        orthonormal.orthonormal[0]!,
        metric,
      ),
    ).toBeCloseTo(1, 10);
  });
});
