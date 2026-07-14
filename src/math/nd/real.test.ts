import { describe, expect, it } from "vitest";
import {
  analyzeRealBasis,
  applyRealMatrix,
  conditionNumberRealMatrix,
  determinantRealMatrix,
  effectiveRealMap,
  identityRealMatrix,
  interpolateRealMatrices,
  inverseRealMatrix,
  multiplyRealMatrices,
  rankRealMatrix,
  resizeRealMatrix,
  resizeRealVector,
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
