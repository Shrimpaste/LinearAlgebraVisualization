import { determinantMat2, maxAbsMat2, rankMat2 } from "./matrix";
import { EPSILON } from "./numeric";
import type { Mat2, Vec2 } from "./types";
import {
  lengthVec2,
  normalizeVec2,
  perpendicularVec2,
  scaleVec2,
  subtractVec2,
} from "./vector";
import { applyMat2 } from "./matrix";

interface Solve2Base {
  readonly coefficientRank: 0 | 1 | 2;
  readonly augmentedRank: 0 | 1 | 2;
  readonly determinant: number;
}

export interface UniqueSolve2Result extends Solve2Base {
  readonly kind: "unique";
  readonly coefficientRank: 2;
  readonly augmentedRank: 2;
  readonly solution: Vec2;
  readonly residual: Vec2;
  readonly residualNorm: number;
}

export interface InfiniteSolve2Result extends Solve2Base {
  readonly kind: "infinite";
  readonly coefficientRank: 0 | 1;
  readonly augmentedRank: 0 | 1;
  /** The Euclidean minimum-norm solution. */
  readonly particular: Vec2;
  readonly nullspaceBasis: readonly Vec2[];
  readonly residual: Vec2;
  readonly residualNorm: number;
}

export interface NoSolve2Result extends Solve2Base {
  readonly kind: "none";
  readonly coefficientRank: 0 | 1;
  readonly augmentedRank: 1 | 2;
  /** Scale-independent largest violated augmented minor. */
  readonly inconsistency: number;
}

export type Solve2Result =
  UniqueSolve2Result | InfiniteSolve2Result | NoSolve2Result;

function residualFor(matrix: Mat2, solution: Vec2, rightHandSide: Vec2): Vec2 {
  return subtractVec2(applyMat2(matrix, solution), rightHandSide);
}

function normalizedAugmentedInconsistency(matrix: Mat2, rhs: Vec2): number {
  const coefficientScale = maxAbsMat2(matrix);
  const rhsScale = Math.max(Math.abs(rhs[0]), Math.abs(rhs[1]));
  if (coefficientScale === 0 || rhsScale === 0) {
    return coefficientScale === 0 && rhsScale > 0 ? 1 : 0;
  }

  const a = matrix[0] / coefficientScale;
  const b = matrix[1] / coefficientScale;
  const c = matrix[2] / coefficientScale;
  const d = matrix[3] / coefficientScale;
  const e = rhs[0] / rhsScale;
  const f = rhs[1] / rhsScale;
  return Math.max(Math.abs(a * f - c * e), Math.abs(b * f - d * e));
}

export function solve2(
  matrix: Mat2,
  rightHandSide: Vec2,
  epsilon = EPSILON,
): Solve2Result {
  const coefficientRank = rankMat2(matrix, epsilon);
  const determinant = determinantMat2(matrix);

  if (coefficientRank === 2) {
    const scale = maxAbsMat2(matrix);
    const a = matrix[0] / scale;
    const b = matrix[1] / scale;
    const c = matrix[2] / scale;
    const d = matrix[3] / scale;
    const e = rightHandSide[0] / scale;
    const f = rightHandSide[1] / scale;
    const normalizedDeterminant = a * d - b * c;
    const solution: Vec2 = [
      (d * e - b * f) / normalizedDeterminant,
      (a * f - c * e) / normalizedDeterminant,
    ];
    const residual = residualFor(matrix, solution, rightHandSide);
    return {
      kind: "unique",
      coefficientRank: 2,
      augmentedRank: 2,
      determinant,
      solution,
      residual,
      residualNorm: lengthVec2(residual),
    };
  }

  const rhsScale = Math.max(
    Math.abs(rightHandSide[0]),
    Math.abs(rightHandSide[1]),
  );
  if (coefficientRank === 0) {
    if (rhsScale > 0) {
      return {
        kind: "none",
        coefficientRank: 0,
        augmentedRank: 1,
        determinant,
        inconsistency: 1,
      };
    }

    return {
      kind: "infinite",
      coefficientRank: 0,
      augmentedRank: 0,
      determinant,
      particular: [0, 0],
      nullspaceBasis: [
        [1, 0],
        [0, 1],
      ],
      residual: [0, 0],
      residualNorm: 0,
    };
  }

  const inconsistency = normalizedAugmentedInconsistency(matrix, rightHandSide);
  if (inconsistency > epsilon) {
    return {
      kind: "none",
      coefficientRank: 1,
      augmentedRank: 2,
      determinant,
      inconsistency,
    };
  }

  const firstRowNorm = Math.hypot(matrix[0], matrix[1]);
  const secondRowNorm = Math.hypot(matrix[2], matrix[3]);
  const row: Vec2 =
    firstRowNorm >= secondRowNorm
      ? [matrix[0], matrix[1]]
      : [matrix[2], matrix[3]];
  const rhs =
    firstRowNorm >= secondRowNorm ? rightHandSide[0] : rightHandSide[1];
  const rowScale = Math.max(Math.abs(row[0]), Math.abs(row[1]));
  const normalizedRow: Vec2 = [row[0] / rowScale, row[1] / rowScale];
  const normalizedRhs = rhs / rowScale;
  const squaredNorm =
    normalizedRow[0] * normalizedRow[0] + normalizedRow[1] * normalizedRow[1];
  const particular = scaleVec2(normalizedRow, normalizedRhs / squaredNorm);
  const nullspaceDirection = normalizeVec2(perpendicularVec2(normalizedRow));
  const nullspaceBasis: readonly Vec2[] =
    nullspaceDirection === null ? [] : [nullspaceDirection];
  const residual = residualFor(matrix, particular, rightHandSide);

  return {
    kind: "infinite",
    coefficientRank: 1,
    augmentedRank: 1,
    determinant,
    particular,
    nullspaceBasis,
    residual,
    residualNorm: lengthVec2(residual),
  };
}
