import { describe, expect, it } from "vitest";
import {
  deriveSpan,
  migrateSpanState,
  resizeSpanDimension,
  resizeSpanState,
  selectSpanBasisIndices,
  spanDefaults,
  type SpanState,
} from "./model";

describe("span scene model", () => {
  it("selects the deterministic input-order maximal independent subset in R1-R3", () => {
    expect(selectSpanBasisIndices([[0], [2], [-4]], 1)).toEqual([1]);
    expect(
      selectSpanBasisIndices(
        [
          [0, 0],
          [2, 0],
          [-4, 0],
          [1, 1],
          [0, 3],
        ],
        2,
      ),
    ).toEqual([1, 3]);
    expect(
      selectSpanBasisIndices(
        [
          [1, 0, 0],
          [2, 0, 0],
          [0, 1, 0],
          [1, 1, 0],
          [0, 0, 3],
          [1, 1, 1],
        ],
        3,
      ),
    ).toEqual([0, 2, 4]);
  });

  it("preserves tiny nonzero vectors and scale-normalized independence", () => {
    expect(
      selectSpanBasisIndices(
        [
          [1e-300, 0, 0],
          [2e-300, 0, 0],
          [0, 1e300, 0],
          [0, 0, 1e-200],
        ],
        3,
      ),
    ).toEqual([0, 2, 3]);
    expect(
      selectSpanBasisIndices(
        [
          [1e-12, 1e-12],
          [1e12, 1e12 + 1],
          [0, 3e12],
        ],
        2,
      ),
    ).toEqual([0, 2]);
  });

  it("classifies ranks in every supported ambient dimension", () => {
    const scalar = deriveSpan({
      ...spanDefaults,
      dimension: 1,
      vectors: [[0], [2]],
      coefficients: [1, 1],
      target: [4],
    });
    expect(scalar).toMatchObject({
      rank: 1,
      classification: "整个空间 R1",
      targetInSpan: true,
    });
    const line3 = deriveSpan({
      ...spanDefaults,
      dimension: 3,
      vectors: [
        [1, 2, 3],
        [-2, -4, -6],
      ],
      coefficients: [1, 1],
      target: [0, 1, 0],
    });
    expect(line3).toMatchObject({
      rank: 1,
      classification: "一条直线",
      targetInSpan: false,
    });
    const plane3 = deriveSpan({
      ...spanDefaults,
      dimension: 3,
      vectors: [
        [1, 0, 0],
        [0, 1, 0],
        [2, 2, 0],
      ],
      coefficients: [1, 1, 1],
      target: [4, -2, 0],
    });
    expect(plane3).toMatchObject({
      rank: 2,
      classification: "一个平面",
      targetInSpan: true,
    });
    const full3 = deriveSpan({
      ...spanDefaults,
      dimension: 3,
      vectors: [
        [1, 0, 0],
        [0, 2, 0],
        [0, 0, 3],
      ],
      coefficients: [0, 0, 0],
      target: [1, 2, 3],
    });
    expect(full3).toMatchObject({
      rank: 3,
      classification: "整个空间 R3",
      determinant: 6,
      targetInSpan: true,
    });
  });

  it("uses every vector and coefficient in arbitrary dimension", () => {
    const state: SpanState = {
      ...spanDefaults,
      dimension: 3,
      vectors: [
        [1, 0, 2],
        [0, 2, -1],
        [-2, 1, 3],
        [4, 0, 0],
      ],
      coefficients: [2, -1, 0.5, -0.25],
      target: [0, 0, 0],
    };
    expect(deriveSpan(state).combination).toEqual([0, -1.5, 6.5]);
  });

  it("reports unique versus non-unique target representations", () => {
    const unique = deriveSpan({
      ...spanDefaults,
      dimension: 2,
      vectors: [
        [2, 0],
        [0, 4],
      ],
      coefficients: [0, 0],
      target: [6, 8],
    });
    expect(unique.targetSolution).toEqual({ kind: "unique", solution: [3, 2] });
    const redundant = deriveSpan({
      ...spanDefaults,
      dimension: 2,
      vectors: [
        [2, 0],
        [0, 4],
        [2, 4],
      ],
      coefficients: [0, 0, 0],
      target: [6, 8],
    });
    expect(redundant.targetSolution).toEqual({
      kind: "infinite",
      solution: [3, 2],
    });
  });

  it("migrates deployed legacy and v1 state to persisted v2", () => {
    expect(
      migrateSpanState({
        first: [2, 1],
        second: [-1, 3],
        target: [4, -2],
        alpha: 1.5,
        beta: -0.25,
        showLattice: false,
        showTarget: false,
      }),
    ).toEqual({
      version: 2,
      dimension: 2,
      vectors: [
        [2, 1],
        [-1, 3],
      ],
      coefficients: [1.5, -0.25],
      target: [4, -2],
      showLattice: false,
      showTarget: false,
    });
    expect(
      migrateSpanState({
        version: 1,
        vectors: [
          [1, 0],
          [0, 1],
          [2, 3],
        ],
        coefficients: [2, 3, 4],
        target: [5, 6],
      }),
    ).toMatchObject({
      version: 2,
      dimension: 2,
      vectors: [
        [1, 0],
        [0, 1],
        [2, 3],
      ],
      coefficients: [2, 3, 4],
      target: [5, 6],
    });
  });

  it("normalizes v2 data and rejects future schemas", () => {
    const normalized = migrateSpanState({
      version: 2,
      dimension: 3,
      vectors: [
        [1, 0],
        [0, 1, 2],
        [2, Number.NaN, 4],
      ],
      coefficients: [2, Number.POSITIVE_INFINITY],
      target: [Number.NaN, 3],
    });
    expect(normalized).toMatchObject({ version: 2, dimension: 3 });
    expect(normalized.vectors).toEqual([
      [1, 0, 0.4],
      [0, 1, 2],
      [2, -0.8, 4],
    ]);
    expect(normalized.coefficients).toEqual([2, 0.85, 0]);
    expect(normalized.target).toEqual([-1.1, 3, 0]);
    expect(migrateSpanState({ version: 3, vectors: [[1]] })).toBe(spanDefaults);
  });

  it("resizes vectors and dimension while preserving edits", () => {
    const one = resizeSpanState(spanDefaults, 1);
    const six = resizeSpanState(one, 6);
    expect(six.vectors).toHaveLength(6);
    expect(six.coefficients).toEqual([1.1, 0, 0, 0, 0, 0]);
    const three = resizeSpanDimension(six, 3);
    expect(three.dimension).toBe(3);
    expect(three.vectors[0]).toEqual([1.8, 0.65, 0.4]);
    expect(resizeSpanDimension(three, 1).vectors[0]).toEqual([1.8]);
  });
});
