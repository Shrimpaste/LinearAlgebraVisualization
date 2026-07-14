import {
  applyMat2,
  determinantMat2,
  inverseMat2,
  mat2FromColumns,
  multiplyMat2,
  rankMat2,
} from "./matrix";
import { EPSILON } from "./numeric";
import { solve2 } from "./solve";
import type { Basis2, Mat2, Vec2 } from "./types";

export const STANDARD_BASIS: Basis2 = [
  [1, 0],
  [0, 1],
];

export type BasisOrientation = "positive" | "negative" | "degenerate";

export interface BasisAnalysis {
  readonly matrix: Mat2;
  readonly determinant: number;
  readonly rank: 0 | 1 | 2;
  readonly isBasis: boolean;
  readonly orientation: BasisOrientation;
}

export function basisMatrix(basis: Basis2): Mat2 {
  return mat2FromColumns(basis[0], basis[1]);
}

export function analyzeBasis(basis: Basis2, epsilon = EPSILON): BasisAnalysis {
  const matrix = basisMatrix(basis);
  const determinant = determinantMat2(matrix);
  const rank = rankMat2(matrix, epsilon);
  return {
    matrix,
    determinant,
    rank,
    isBasis: rank === 2,
    orientation:
      rank < 2 ? "degenerate" : determinant > 0 ? "positive" : "negative",
  };
}

export function coordinatesToStandard(coordinates: Vec2, basis: Basis2): Vec2 {
  return applyMat2(basisMatrix(basis), coordinates);
}

export function coordinatesFromStandard(
  vector: Vec2,
  basis: Basis2,
  epsilon = EPSILON,
): Vec2 | null {
  const solution = solve2(basisMatrix(basis), vector, epsilon);
  return solution.kind === "unique" ? solution.solution : null;
}

export function changeOfBasisMatrix(
  fromBasis: Basis2,
  toBasis: Basis2,
  epsilon = EPSILON,
): Mat2 | null {
  if (analyzeBasis(fromBasis, epsilon).rank < 2) {
    return null;
  }
  const inverseTarget = inverseMat2(basisMatrix(toBasis), epsilon);
  if (inverseTarget === null) {
    return null;
  }
  return multiplyMat2(inverseTarget, basisMatrix(fromBasis));
}

export function convertBasisCoordinates(
  coordinates: Vec2,
  fromBasis: Basis2,
  toBasis: Basis2,
  epsilon = EPSILON,
): Vec2 | null {
  const conversion = changeOfBasisMatrix(fromBasis, toBasis, epsilon);
  return conversion === null ? null : applyMat2(conversion, coordinates);
}

/** Represents a standard-coordinate operator in domain/codomain coordinates. */
export function matrixInBases(
  standardMatrix: Mat2,
  domainBasis: Basis2,
  codomainBasis: Basis2 = domainBasis,
  epsilon = EPSILON,
): Mat2 | null {
  const inverseCodomain = inverseMat2(basisMatrix(codomainBasis), epsilon);
  if (inverseCodomain === null || analyzeBasis(domainBasis, epsilon).rank < 2) {
    return null;
  }
  return multiplyMat2(
    multiplyMat2(inverseCodomain, standardMatrix),
    basisMatrix(domainBasis),
  );
}

/** Converts a coordinate matrix back to its effective standard-coordinate map. */
export function effectiveMatrix(
  coordinateMatrix: Mat2,
  domainBasis: Basis2,
  codomainBasis: Basis2 = domainBasis,
  epsilon = EPSILON,
): Mat2 | null {
  const inverseDomain = inverseMat2(basisMatrix(domainBasis), epsilon);
  if (inverseDomain === null || analyzeBasis(codomainBasis, epsilon).rank < 2) {
    return null;
  }
  return multiplyMat2(
    multiplyMat2(basisMatrix(codomainBasis), coordinateMatrix),
    inverseDomain,
  );
}
