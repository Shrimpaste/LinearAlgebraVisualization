import { describe, expect, it } from "vitest";
import {
  deriveSpan,
  migrateSpanState,
  resizeSpanState,
  selectSpanBasisIndices,
  spanDefaults,
  type SpanState,
} from "./model";

describe("span scene model", () => {
  it("greedily selects the first stable independent subset", () => {
    const vectors = [
      [0, 0],
      [2, 0],
      [-4, 0],
      [1, 1],
      [0, 3],
    ] as const;

    expect(selectSpanBasisIndices(vectors)).toEqual([1, 3]);
    const derived = deriveSpan({
      ...spanDefaults,
      vectors,
      coefficients: [0, 0, 0, 0, 0],
    });
    expect(derived.rank).toBe(2);
    expect(derived.classification).toBe("整个平面 R²");
    expect(derived.determinant).toBe(2);
  });

  it("classifies collinear and zero vector groups without inventing a basis", () => {
    const line = deriveSpan({
      ...spanDefaults,
      vectors: [
        [0, 0],
        [1, 2],
        [-2, -4],
        [0.5, 1],
      ],
      coefficients: [1, 1, 1, 1],
    });
    expect(line.basisIndices).toEqual([1]);
    expect(line.rank).toBe(1);
    expect(line.classification).toBe("一条直线");

    const zero = deriveSpan({
      ...spanDefaults,
      vectors: [
        [0, 0],
        [0, 0],
      ],
      coefficients: [2, -3],
    });
    expect(zero.basisIndices).toEqual([]);
    expect(zero.rank).toBe(0);
    expect(zero.classification).toBe("原点");
  });

  it("skips numerically redundant directions without depending on magnitude", () => {
    expect(
      selectSpanBasisIndices([
        [1e-12, 1e-12],
        [1e12, 1e12 + 1],
        [0, 3e12],
      ]),
    ).toEqual([0, 2]);
  });

  it("uses every vector and coefficient in the displayed combination", () => {
    const state: SpanState = {
      ...spanDefaults,
      vectors: [
        [1, 0],
        [0, 2],
        [-2, 1],
      ],
      coefficients: [2, -1, 0.5],
    };
    expect(deriveSpan(state).combination).toEqual([1, -1.5]);
  });

  it("migrates the deployed first/second and alpha/beta state", () => {
    const migrated = migrateSpanState({
      first: [2, 1],
      second: [-1, 3],
      target: [4, -2],
      alpha: 1.5,
      beta: -0.25,
      showLattice: false,
      showTarget: false,
    });

    expect(migrated).toEqual({
      version: 1,
      vectors: [
        [2, 1],
        [-1, 3],
      ],
      coefficients: [1.5, -0.25],
      target: [4, -2],
      showLattice: false,
      showTarget: false,
    });
  });

  it("normalizes current data and rejects future schemas", () => {
    const normalized = migrateSpanState({
      version: 1,
      vectors: [
        [1, 0],
        [0, 1],
        [2, Number.NaN],
      ],
      coefficients: [2, Number.POSITIVE_INFINITY],
      target: [Number.NaN, 3],
    });
    expect(normalized.vectors).toEqual([
      [1, 0],
      [0, 1],
      [2, -0.8],
    ]);
    expect(normalized.coefficients).toEqual([2, 0.85, 0]);
    expect(normalized.target).toEqual([-1.1, 3]);
    expect(migrateSpanState({ version: 2, vectors: [[1, 0]] })).toBe(
      spanDefaults,
    );
  });

  it("resizes from one to six vectors while preserving existing edits", () => {
    const one = resizeSpanState(spanDefaults, 1);
    expect(one.vectors).toEqual([[1.8, 0.65]]);
    expect(one.coefficients).toEqual([1.1]);

    const six = resizeSpanState(one, 6);
    expect(six.vectors).toHaveLength(6);
    expect(six.vectors[0]).toEqual([1.8, 0.65]);
    expect(six.coefficients).toEqual([1.1, 0, 0, 0, 0, 0]);
  });
});
