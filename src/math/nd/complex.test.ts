import { describe, expect, it } from "vitest";
import {
  absComplex,
  addComplex,
  addComplexVectors,
  adjointComplexMatrix,
  applyComplexMatrix,
  complex,
  complexInnerProduct,
  conjugateComplex,
  identityComplexMatrix,
  multiplyComplex,
  multiplyComplexMatrices,
  realInnerProduct,
  scaleComplexVector,
  subtractComplex,
  validateComplexMatrix,
  validateInnerProduct,
} from "./index";

describe("N-dimensional complex operations", () => {
  it("implements scalar arithmetic without provider-specific objects", () => {
    const left = complex(2, 3);
    const right = complex(-1, 4);
    expect(addComplex(left, right)).toEqual({ re: 1, im: 7 });
    expect(subtractComplex(left, right)).toEqual({ re: 3, im: -1 });
    expect(multiplyComplex(left, right)).toEqual({ re: -14, im: 5 });
    expect(conjugateComplex(left)).toEqual({ re: 2, im: -3 });
    expect(absComplex(complex(3, 4))).toBe(5);
    expect(() => complex(Number.POSITIVE_INFINITY)).toThrow(TypeError);
  });

  it("applies the adjoint and complex matrix products in 3D", () => {
    const matrix = [
      [complex(1), complex(0, 1), complex(0)],
      [complex(2), complex(1), complex(0, -1)],
      [complex(0), complex(0), complex(2)],
    ] as const;
    expect(validateComplexMatrix(matrix)).toEqual({ rows: 3, columns: 3 });
    const adjoint = adjointComplexMatrix(matrix);
    expect(adjoint[0]![1]).toEqual(complex(2));
    expect(adjoint[1]![0]).toEqual(complex(0, -1));
    const vector = [complex(1), complex(0, 1), complex(2)] as const;
    expect(applyComplexMatrix(identityComplexMatrix(3), vector)).toEqual(
      vector,
    );
    expect(multiplyComplexMatrices(matrix, identityComplexMatrix(3))).toEqual(
      matrix,
    );
  });

  it("uses the first-slot-linear convention", () => {
    const x = [complex(1, 1), complex(2)] as const;
    const y = [complex(2, -1), complex(0, 1)] as const;
    const z = [complex(-1), complex(0.5, 0.25)] as const;
    const alpha = complex(0.5, -2);
    const metric = identityComplexMatrix(2);

    expect(complexInnerProduct(addComplexVectors(x, z), y, metric)).toEqual(
      addComplex(
        complexInnerProduct(x, y, metric),
        complexInnerProduct(z, y, metric),
      ),
    );
    expect(
      complexInnerProduct(scaleComplexVector(alpha, x), y, metric),
    ).toEqual(multiplyComplex(alpha, complexInnerProduct(x, y, metric)));
    expect(complexInnerProduct(x, y, metric)).toEqual(
      conjugateComplex(complexInnerProduct(y, x, metric)),
    );
    expect(realInnerProduct([1, 2], [3, 4])).toBe(11);
  });

  it("validates real and complex inner-product axioms with witnesses", () => {
    const real = validateInnerProduct("R", [
      [2, 1],
      [1, 2],
    ]);
    expect(real.valid).toBe(true);
    expect(real.firstSlotAdditivity.residual).toBeLessThan(1e-12);
    expect(real.firstSlotHomogeneity.residual).toBeLessThan(1e-12);
    expect(real.conjugateSymmetry.residual).toBe(0);

    const hermitian = [
      [complex(2), complex(0, 1)],
      [complex(0, -1), complex(2)],
    ] as const;
    const complexValidation = validateInnerProduct("C", hermitian);
    expect(complexValidation.valid).toBe(true);
    expect(
      complexValidation.positiveDefinite.witness.leadingPrincipalMinors,
    ).toHaveLength(2);

    const nonHermitian = validateInnerProduct("C", [
      [complex(1), complex(1)],
      [complex(0), complex(1)],
    ]);
    expect(nonHermitian.valid).toBe(false);
    expect(nonHermitian.conjugateSymmetry.passed).toBe(false);
    expect(nonHermitian.conjugateSymmetry.residual).toBeGreaterThan(0);

    const indefinite = validateInnerProduct("R", [
      [1, 2],
      [2, 1],
    ]);
    expect(indefinite.positiveDefinite.passed).toBe(false);
    expect(indefinite.positiveDefinite.residual).toBeGreaterThan(0);
  });

  it("supports one and three-dimensional metrics", () => {
    expect(validateInnerProduct("R", [[4]])).toMatchObject({
      dimension: 1,
      valid: true,
    });
    expect(validateInnerProduct("C", identityComplexMatrix(3))).toMatchObject({
      dimension: 3,
      valid: true,
    });
  });
});
