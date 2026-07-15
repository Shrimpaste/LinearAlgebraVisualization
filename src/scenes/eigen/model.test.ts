import { describe, expect, it } from "vitest";
import {
  changeEigenBasisMode,
  deriveEigen,
  eigenDefaults,
  migrateEigenState,
  resizeEigenState,
  setBasisVector,
} from "./model";

function expectMatrixClose(
  actual: readonly (readonly number[])[],
  expected: readonly (readonly number[])[],
) {
  expected.forEach((row, rowIndex) =>
    row.forEach((value, columnIndex) =>
      expect(actual[rowIndex]![columnIndex]).toBeCloseTo(value, 10),
    ),
  );
}

describe("eigen scene v2 endomorphism model", () => {
  it("migrates v1 and drops all removed power/field state", () => {
    const migrated = migrateEigenState({
      version: 1,
      matrix: [3, 1, 0, 2],
      basis: [1, 1, 0, 1],
      basisMode: "custom",
      seed: [9, 9],
      iterations: 9,
      showField: true,
      showOrbit: true,
    });
    expect(migrated).toEqual({
      version: 2,
      dimension: 2,
      matrix: [
        [3, 1],
        [0, 2],
      ],
      basisMode: "custom",
      basis: [
        [1, 1],
        [0, 1],
      ],
    });
    expect(migrated).not.toHaveProperty("seed");
    expect(migrated).not.toHaveProperty("iterations");
    expect(migrateEigenState({ version: 99 })).toBe(eigenDefaults);
  });

  it("supports dimensions 1-3 and ordered q_i columns", () => {
    const resized = resizeEigenState(eigenDefaults, 3);
    expect(resized.dimension).toBe(3);
    expect(resized.matrix).toHaveLength(3);
    const basis = setBasisVector(resized.basis, 1, [4, 5, 6]);
    expect(basis.map((row) => row[1])).toEqual([4, 5, 6]);
  });

  it("converts displayed matrices on basis toggle without changing T", () => {
    const state = {
      ...eigenDefaults,
      matrix: [
        [2, 0],
        [0, 3],
      ],
      basis: [
        [1, 1],
        [0, 1],
      ],
    };
    const custom = changeEigenBasisMode(state, "custom");
    expect(custom).not.toBeNull();
    expectMatrixClose(custom!.matrix, [
      [2, -1],
      [0, 3],
    ]);
    expectMatrixClose(deriveEigen(custom!).physicalMatrix!, state.matrix);
    const standard = changeEigenBasisMode(custom!, "standard");
    expectMatrixClose(standard!.matrix, state.matrix);
  });

  it("refuses a mode switch with a degenerate shared Q", () => {
    expect(
      changeEigenBasisMode(
        {
          ...eigenDefaults,
          basis: [
            [1, 2],
            [2, 4],
          ],
        },
        "custom",
      ),
    ).toBeNull();
  });

  it("ties P^-1 A P to the displayed certified eigenbasis", () => {
    const derived = deriveEigen({
      ...resizeEigenState(eigenDefaults, 3),
      matrix: [
        [3, 1, 0],
        [0, 2, 1],
        [0, 0, 1],
      ],
    });
    expect(derived.eigensystem?.status).toBe("real-eigenbasis");
    const result = derived.eigensystem!;
    expect(result.realEigenpairs.map((pair) => pair.value)).toEqual([3, 2, 1]);
    result.realEigenpairs.forEach((pair) =>
      expect(pair.residual).toBeLessThan(1e-10),
    );
    expectMatrixClose(result.eigenbasisCoordinates!, [
      [3, 0, 0],
      [0, 2, 0],
      [0, 0, 1],
    ]);
  });

  it("reports explicit defective and complex-real unavailability", () => {
    expect(
      deriveEigen({
        ...eigenDefaults,
        matrix: [
          [1, 1],
          [0, 1],
        ],
      }).eigensystem?.status,
    ).toBe("defective");
    const complex = deriveEigen({
      ...eigenDefaults,
      matrix: [
        [0, -1],
        [1, 0],
      ],
    }).eigensystem!;
    expect(complex.status).toBe("complex");
    expect(complex.eigenvalues).toEqual([
      { re: 0, im: 1 },
      { re: 0, im: -1 },
    ]);
    expect(complex.realEigenbasis).toBeNull();
  });
});
