import { describe, expect, it } from "vitest";
import { IDENTITY_MAT2, type Mat2 } from "../../math";
import {
  deriveEigen,
  eigenDefaults,
  migrateEigenState,
  type EigenState,
} from "./model";

function expectMatrixClose(actual: Mat2 | null, expected: Mat2) {
  expect(actual).not.toBeNull();
  expected.forEach((value, index) => {
    expect(actual![index]).toBeCloseTo(value, 10);
  });
}

describe("eigen scene basis model", () => {
  it("migrates the deployed unversioned state into the standard basis", () => {
    const migrated = migrateEigenState({
      matrix: [3, 1, 0, 2],
      seed: [2, -1],
      iterations: 12,
      showField: false,
      showOrbit: false,
    });

    expect(migrated).toEqual({
      version: 1,
      matrix: [3, 1, 0, 2],
      basisMode: "standard",
      basis: IDENTITY_MAT2,
      seed: [2, -1],
      iterations: 9,
      showField: false,
      showOrbit: false,
    });
    expect(migrateEigenState({ version: 99 })).toBe(eigenDefaults);
  });

  it("computes the same endomorphism in B coordinates as B^-1 A B", () => {
    const state: EigenState = {
      ...eigenDefaults,
      matrix: [2, 0, 0, 3],
      basisMode: "custom",
      basis: [1, 1, 0, 1],
    };
    const derived = deriveEigen(state);

    expect(derived.basisAnalysis.isBasis).toBe(true);
    expectMatrixClose(derived.coordinateMatrix, [2, -1, 0, 3]);
    expect(derived.coordinateAnalysis).not.toBeNull();
    expect(derived.coordinateAnalysis!.trace).toBeCloseTo(
      derived.analysis.trace,
      10,
    );
    expect(derived.coordinateAnalysis!.determinant).toBeCloseTo(
      derived.analysis.determinant,
      10,
    );
    expect(derived.analysis.kind).toBe("two-real");
    expect(derived.coordinateAnalysis!.kind).toBe("two-real");
    if (
      derived.analysis.kind === "two-real" &&
      derived.coordinateAnalysis!.kind === "two-real"
    ) {
      expect(
        derived.coordinateAnalysis!.eigenpairs.map((pair) => pair.value),
      ).toEqual(derived.analysis.eigenpairs.map((pair) => pair.value));
    }

    const lambdaThree = derived.eigenvectors.find(
      (entry) => Math.abs(entry.eigenvalue - 3) < 1e-10,
    );
    expect(lambdaThree?.vector).toEqual([0, 1]);
    expect(lambdaThree?.basisCoordinates?.[0]).toBeCloseTo(-1, 10);
    expect(lambdaThree?.basisCoordinates?.[1]).toBeCloseTo(1, 10);
  });

  it("blocks coordinate matrices and vectors when B is not a basis", () => {
    const derived = deriveEigen({
      ...eigenDefaults,
      basisMode: "custom",
      basis: [1, 2, 2, 4],
    });

    expect(derived.analysis.kind).toBe("two-real");
    expect(derived.basisAnalysis).toMatchObject({
      isBasis: false,
      rank: 1,
      orientation: "degenerate",
    });
    expect(derived.coordinateMatrix).toBeNull();
    expect(derived.coordinateAnalysis).toBeNull();
    expect(
      derived.eigenvectors.every((entry) => entry.basisCoordinates === null),
    ).toBe(true);
  });

  it("ignores a stored custom candidate while standard-basis mode is active", () => {
    const derived = deriveEigen({
      ...eigenDefaults,
      basisMode: "standard",
      basis: [1, 2, 2, 4],
    });

    expect(derived.basisAnalysis.isBasis).toBe(true);
    expectMatrixClose(derived.coordinateMatrix, eigenDefaults.matrix);
    expect(derived.eigenvectors[0]!.basisCoordinates).toEqual(
      derived.eigenvectors[0]!.vector,
    );
  });
});
