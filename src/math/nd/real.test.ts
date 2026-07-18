import { describe, expect, it } from "vitest";
import {
  analyzeRealBasis,
  analyzeRealIndependentSubset,
  applyRealMatrix,
  choleskyMetricEmbedding,
  conditionNumberRealMatrix,
  coordinateToStandardRealMap,
  determinantRealMatrix,
  effectiveRealMap,
  identityRealMatrix,
  interpolateRealMatrices,
  inverseRealMatrix,
  multiplyRealMatrices,
  rankRealMatrix,
  resizeRealMatrix,
  resizeRealVector,
  standardToCoordinateRealMap,
  transposeRealMatrix,
  validateRealMatrix,
  validateRealVector,
  zeroRealMatrix,
  zeroRealVector,
} from "./index";

function expectMatrixClose(
  actual: readonly (readonly number[])[],
  expected: readonly (readonly number[])[],
  precision = 10,
) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((row, rowIndex) =>
    row.forEach((value, columnIndex) =>
      expect(value).toBeCloseTo(expected[rowIndex]![columnIndex]!, precision),
    ),
  );
}

describe("N-dimensional real operations", () => {
  it("validates finite 1D, 2D, and 3D shapes", () => {
    expect(validateRealVector([1])).toBe(1);
    expect(
      validateRealMatrix([
        [1, 2],
        [3, 4],
      ]),
    ).toEqual({
      rows: 2,
      columns: 2,
    });
    expect(
      validateRealMatrix([
        [1, 0, 0],
        [0, 1, 0],
      ]),
    ).toEqual({ rows: 2, columns: 3 });
    expect(() => validateRealVector([])).toThrow(RangeError);
    expect(() => validateRealVector([1, 2, 3, 4])).toThrow(RangeError);
    expect(() => validateRealMatrix([[1], [2, 3]])).toThrow(RangeError);
    expect(() => validateRealMatrix([[Number.NaN]])).toThrow(TypeError);
  });

  it("creates and resizes vectors and rectangular matrices", () => {
    expect(zeroRealVector(1)).toEqual([0]);
    expect(zeroRealMatrix(2, 3)).toEqual([
      [0, 0, 0],
      [0, 0, 0],
    ]);
    expect(identityRealMatrix(3)).toEqual([
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]);
    expect(resizeRealVector([2, 3], 3)).toEqual([2, 3, 0]);
    expect(resizeRealVector([2, 3, 4], 1)).toEqual([2]);
    expect(
      resizeRealMatrix(
        [
          [1, 2],
          [3, 4],
        ],
        3,
        3,
      ),
    ).toEqual([
      [1, 2, 0],
      [3, 4, 0],
      [0, 0, 0],
    ]);
  });

  it("multiplies, applies, transposes, and interpolates compatible shapes", () => {
    const left = [
      [1, 2, 3],
      [4, 5, 6],
    ] as const;
    const right = [[1], [0], [-1]] as const;
    expect(multiplyRealMatrices(left, right)).toEqual([[-2], [-2]]);
    expect(applyRealMatrix(left, [1, 0, -1])).toEqual([-2, -2]);
    expect(transposeRealMatrix(left)).toEqual([
      [1, 4],
      [2, 5],
      [3, 6],
    ]);
    expect(interpolateRealMatrices([[1]], [[5]], 0.25)).toEqual([[2]]);
    expect(() => multiplyRealMatrices([[1, 2]], [[1, 2]])).toThrow(RangeError);
  });

  it("builds an isometric coordinate embedding for real Gram metrics", () => {
    const metric = [
      [4, 1, 0.5],
      [1, 3, 0.25],
      [0.5, 0.25, 2],
    ];
    const embedding = choleskyMetricEmbedding(metric);
    expect(embedding).not.toBeNull();
    expectMatrixClose(
      multiplyRealMatrices(transposeRealMatrix(embedding!), embedding!),
      metric,
    );

    const first = [1, -2, 0.5];
    const second = [0.25, 1, 3];
    const embeddedFirst = applyRealMatrix(embedding!, first);
    const embeddedSecond = applyRealMatrix(embedding!, second);
    const visibleInnerProduct = embeddedFirst.reduce(
      (sum, value, index) => sum + value * embeddedSecond[index]!,
      0,
    );
    const metricInnerProduct = applyRealMatrix(metric, first).reduce(
      (sum, value, index) => sum + value * second[index]!,
      0,
    );
    expect(visibleInnerProduct).toBeCloseTo(metricInnerProduct, 10);
    const scaledEmbedding = choleskyMetricEmbedding([
      [1e20, 0, 0],
      [0, 1, 0],
      [0, 0, 1e-20],
    ]);
    expect(scaledEmbedding?.[0]?.[0]).toBeCloseTo(1e10, 2);
    expect(scaledEmbedding?.[1]?.[1]).toBeCloseTo(1, 10);
    expect(scaledEmbedding?.[2]?.[2]).toBeCloseTo(1e-10, 18);
    expect(
      choleskyMetricEmbedding([
        [1, 2],
        [2, 1],
      ]),
    ).toBeNull();
    expect(
      choleskyMetricEmbedding([
        [1, 0],
        [1, 1],
      ]),
    ).toBeNull();
  });

  it("computes determinant, inverse, rank, and scale-aware condition", () => {
    expect(determinantRealMatrix([[4]])).toBe(4);
    expect(inverseRealMatrix([[4]])).toEqual([[0.25]]);

    const matrix = [
      [4, 7],
      [2, 6],
    ] as const;
    const inverse = inverseRealMatrix(matrix);
    expect(inverse).not.toBeNull();
    expectMatrixClose(
      multiplyRealMatrices(matrix, inverse!),
      identityRealMatrix(2),
    );
    expect(determinantRealMatrix(matrix)).toBeCloseTo(10);
    expect(rankRealMatrix(matrix)).toBe(2);
    expect(conditionNumberRealMatrix(matrix)).toBeGreaterThan(1);

    const singular = [
      [1, 2],
      [2, 4],
    ] as const;
    expect(rankRealMatrix(singular)).toBe(1);
    expect(conditionNumberRealMatrix(singular)).toBe(Infinity);
    expect(inverseRealMatrix(singular)).toBeNull();

    const illConditioned = [
      [1, 0],
      [0, 1e-12],
    ] as const;
    expect(rankRealMatrix(illConditioned)).toBe(1);
    expect(inverseRealMatrix(illConditioned)).toBeNull();
    expect(rankRealMatrix(illConditioned, 1e-14)).toBe(2);

    const threeDimensional = [
      [2, 1, 0],
      [0, 3, 1],
      [0, 0, 4],
    ] as const;
    expect(determinantRealMatrix(threeDimensional)).toBeCloseTo(24);
    const inverse3 = inverseRealMatrix(threeDimensional);
    expect(inverse3).not.toBeNull();
    expectMatrixClose(
      multiplyRealMatrices(threeDimensional, inverse3!),
      identityRealMatrix(3),
    );
  });

  it("selects a deterministic dimension-generic maximal independent subset", () => {
    const analysis = analyzeRealIndependentSubset([
      [0, 0, 0],
      [2, 0, 0],
      [-4, 0, 0],
      [1, 1, 0],
      [5, 5, 0],
      [0, 0, 3],
      [1, 2, 3],
    ]);

    expect(analysis).toMatchObject({
      dimension: 3,
      rank: 3,
      indices: [1, 3, 5],
      basisColumns: [
        [2, 0, 0],
        [1, 1, 0],
        [0, 0, 3],
      ],
      basisMatrix: [
        [2, 1, 0],
        [0, 1, 0],
        [0, 0, 3],
      ],
      isSpanning: true,
    });
    expect(analysis.diagnostics.map(({ reason }) => reason)).toEqual([
      "zero",
      "independent",
      "dependent",
      "independent",
      "dependent",
      "independent",
      "dependent",
    ]);
  });

  it("preserves tiny nonzero directions through per-input normalization", () => {
    const analysis = analyzeRealIndependentSubset([
      [1e-300, 1e-300],
      [1e200, 1e200 + 1e190],
      [0, 1e-250],
    ]);
    expect(analysis.indices).toEqual([0, 2]);
    expect(analysis.basisColumns).toEqual([
      [1e-300, 1e-300],
      [0, 1e-250],
    ]);
    expect(analysis.diagnostics[0]).toMatchObject({
      accepted: true,
      inputScale: 1e-300,
    });
  });

  it("handles 1D subsets and validates candidate collections", () => {
    expect(analyzeRealIndependentSubset([[0], [-1e-200], [4]])).toMatchObject({
      dimension: 1,
      rank: 1,
      indices: [1],
      basisMatrix: [[-1e-200]],
    });
    expect(() => analyzeRealIndependentSubset([])).toThrow(RangeError);
    expect(() => analyzeRealIndependentSubset([[1], [1, 2]])).toThrow(
      RangeError,
    );
    expect(() => analyzeRealIndependentSubset([[1]], -1)).toThrow(RangeError);
  });

  it("analyzes bases and evaluates the standard map C A B^-1", () => {
    expect(analyzeRealBasis([[2]])).toMatchObject({
      dimension: 1,
      rank: 1,
      isBasis: true,
      orientation: "positive",
    });
    expect(
      analyzeRealBasis([
        [0, 1],
        [1, 0],
      ]),
    ).toMatchObject({ orientation: "negative", rank: 2 });
    expect(
      analyzeRealBasis([
        [1, 2],
        [2, 4],
      ]),
    ).toMatchObject({ orientation: "degenerate", rank: 1 });

    const coordinateMap = [
      [3, 0],
      [0, 4],
    ] as const;
    const domain = [
      [2, 0],
      [0, 1],
    ] as const;
    const codomain = [
      [1, 1],
      [0, 1],
    ] as const;
    expectMatrixClose(effectiveRealMap(coordinateMap, domain, codomain)!, [
      [1.5, 4],
      [0, 4],
    ]);
    expect(
      effectiveRealMap(coordinateMap, [
        [1, 2],
        [2, 4],
      ]),
    ).toBeNull();
  });

  it("converts maps in both directions for rectangular dimensions 1 through 3", () => {
    const cases = [
      {
        standard: [[6]],
        domain: [[2]],
        codomain: [[3]],
      },
      {
        standard: [
          [2, 4],
          [6, 8],
          [10, 12],
        ],
        domain: [
          [2, 0],
          [0, 4],
        ],
        codomain: [
          [1, 0, 0],
          [0, 2, 0],
          [0, 0, 5],
        ],
      },
      {
        standard: [[2, 6, 10]],
        domain: [
          [1, 0, 0],
          [0, 2, 0],
          [0, 0, 4],
        ],
        codomain: [[5]],
      },
    ] as const;

    cases.forEach(({ standard, domain, codomain }) => {
      const coordinate = standardToCoordinateRealMap(
        standard,
        domain,
        codomain,
      );
      expect(coordinate).not.toBeNull();
      expectMatrixClose(
        coordinateToStandardRealMap(coordinate!, domain, codomain)!,
        standard,
      );
    });

    expect(
      standardToCoordinateRealMap([[1, 2]], identityRealMatrix(2), [[0]]),
    ).toBeNull();
    expect(() =>
      standardToCoordinateRealMap([[1, 2]], identityRealMatrix(3), [[1]]),
    ).toThrow(RangeError);
  });

  it("supports rectangular effective maps with independent domain and codomain bases", () => {
    const threeByTwo = effectiveRealMap(
      [
        [1, 2],
        [3, 4],
        [5, 6],
      ],
      [
        [2, 0],
        [0, 4],
      ],
      [
        [10, 0, 0],
        [0, 20, 0],
        [0, 0, 30],
      ],
    );
    expectMatrixClose(threeByTwo!, [
      [5, 5],
      [30, 20],
      [75, 45],
    ]);

    const twoByThree = effectiveRealMap(
      [
        [1, 2, 3],
        [4, 5, 6],
      ],
      [
        [2, 0, 0],
        [0, 4, 0],
        [0, 0, 5],
      ],
      [
        [10, 0],
        [0, 20],
      ],
    );
    expectMatrixClose(twoByThree!, [
      [5, 5, 6],
      [40, 25, 24],
    ]);

    expect(
      effectiveRealMap(
        [
          [1, 2],
          [3, 4],
          [5, 6],
        ],
        [
          [1, 2],
          [2, 4],
        ],
        identityRealMatrix(3),
      ),
    ).toBeNull();
    expect(
      effectiveRealMap(
        [
          [1, 2],
          [3, 4],
          [5, 6],
        ],
        identityRealMatrix(2),
        [
          [1, 2, 0],
          [2, 4, 0],
          [0, 0, 1],
        ],
      ),
    ).toBeNull();
  });
});
