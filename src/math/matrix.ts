import { EPSILON, lerpNumber, nearlyEqual } from "./numeric";
import type { Mat2, Vec2 } from "./types";

export const IDENTITY_MAT2: Mat2 = [1, 0, 0, 1];
export const ZERO_MAT2: Mat2 = [0, 0, 0, 0];

export function mat2(m00: number, m01: number, m10: number, m11: number): Mat2 {
  return [m00, m01, m10, m11];
}

export function identityMat2(): Mat2 {
  return IDENTITY_MAT2;
}

export function mat2FromRows(first: Vec2, second: Vec2): Mat2 {
  return [first[0], first[1], second[0], second[1]];
}

export function mat2FromColumns(first: Vec2, second: Vec2): Mat2 {
  return [first[0], second[0], first[1], second[1]];
}

export function rowsOfMat2(matrix: Mat2): readonly [Vec2, Vec2] {
  return [
    [matrix[0], matrix[1]],
    [matrix[2], matrix[3]],
  ];
}

export function columnsOfMat2(matrix: Mat2): readonly [Vec2, Vec2] {
  return [
    [matrix[0], matrix[2]],
    [matrix[1], matrix[3]],
  ];
}

export function addMat2(left: Mat2, right: Mat2): Mat2 {
  return [
    left[0] + right[0],
    left[1] + right[1],
    left[2] + right[2],
    left[3] + right[3],
  ];
}

export function scaleMat2(matrix: Mat2, scalar: number): Mat2 {
  return [
    matrix[0] * scalar,
    matrix[1] * scalar,
    matrix[2] * scalar,
    matrix[3] * scalar,
  ];
}

/** Composition left * right: right is applied to a vector first. */
export function multiplyMat2(left: Mat2, right: Mat2): Mat2 {
  return [
    left[0] * right[0] + left[1] * right[2],
    left[0] * right[1] + left[1] * right[3],
    left[2] * right[0] + left[3] * right[2],
    left[2] * right[1] + left[3] * right[3],
  ];
}

export function applyMat2(matrix: Mat2, vector: Vec2): Vec2 {
  return [
    matrix[0] * vector[0] + matrix[1] * vector[1],
    matrix[2] * vector[0] + matrix[3] * vector[1],
  ];
}

export function interpolateMat2(from: Mat2, to: Mat2, amount: number): Mat2 {
  return [
    lerpNumber(from[0], to[0], amount),
    lerpNumber(from[1], to[1], amount),
    lerpNumber(from[2], to[2], amount),
    lerpNumber(from[3], to[3], amount),
  ];
}

export function transposeMat2(matrix: Mat2): Mat2 {
  return [matrix[0], matrix[2], matrix[1], matrix[3]];
}

export function determinantMat2(matrix: Mat2): number {
  return matrix[0] * matrix[3] - matrix[1] * matrix[2];
}

export function traceMat2(matrix: Mat2): number {
  return matrix[0] + matrix[3];
}

export function maxAbsMat2(matrix: Mat2): number {
  return Math.max(
    Math.abs(matrix[0]),
    Math.abs(matrix[1]),
    Math.abs(matrix[2]),
    Math.abs(matrix[3]),
  );
}

export function inverseMat2(matrix: Mat2, epsilon = EPSILON): Mat2 | null {
  const scale = maxAbsMat2(matrix);
  if (scale === 0 || !Number.isFinite(scale)) {
    return null;
  }

  const a = matrix[0] / scale;
  const b = matrix[1] / scale;
  const c = matrix[2] / scale;
  const d = matrix[3] / scale;
  const normalizedDeterminant = a * d - b * c;
  if (Math.abs(normalizedDeterminant) <= epsilon) {
    return null;
  }

  const factor = 1 / (scale * normalizedDeterminant);
  return [d * factor, -b * factor, -c * factor, a * factor];
}

export function rankMat2(matrix: Mat2, epsilon = EPSILON): 0 | 1 | 2 {
  const scale = maxAbsMat2(matrix);
  if (scale === 0 || !Number.isFinite(scale)) {
    return 0;
  }

  const normalizedDeterminant =
    (matrix[0] / scale) * (matrix[3] / scale) -
    (matrix[1] / scale) * (matrix[2] / scale);
  const roundoffTolerance = Math.min(Math.abs(epsilon), Number.EPSILON * 16);
  return Math.abs(normalizedDeterminant) > roundoffTolerance ? 2 : 1;
}

export function nearlyEqualMat2(
  left: Mat2,
  right: Mat2,
  epsilon = EPSILON,
): boolean {
  return (
    nearlyEqual(left[0], right[0], epsilon) &&
    nearlyEqual(left[1], right[1], epsilon) &&
    nearlyEqual(left[2], right[2], epsilon) &&
    nearlyEqual(left[3], right[3], epsilon)
  );
}
