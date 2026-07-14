import { EPSILON, lerpNumber, nearlyEqual } from "./numeric";
import type { Vec2 } from "./types";

export const ZERO_VEC2: Vec2 = [0, 0];
export const UNIT_X: Vec2 = [1, 0];
export const UNIT_Y: Vec2 = [0, 1];

export function vec2(x: number, y: number): Vec2 {
  return [x, y];
}

export function addVec2(left: Vec2, right: Vec2): Vec2 {
  return [left[0] + right[0], left[1] + right[1]];
}

export function subtractVec2(left: Vec2, right: Vec2): Vec2 {
  return [left[0] - right[0], left[1] - right[1]];
}

export function negateVec2(vector: Vec2): Vec2 {
  return [-vector[0], -vector[1]];
}

export function scaleVec2(vector: Vec2, scalar: number): Vec2 {
  return [vector[0] * scalar, vector[1] * scalar];
}

export function hadamardVec2(left: Vec2, right: Vec2): Vec2 {
  return [left[0] * right[0], left[1] * right[1]];
}

export function dotVec2(left: Vec2, right: Vec2): number {
  return left[0] * right[0] + left[1] * right[1];
}

/** The signed z-component of the 3D cross product of two xy-plane vectors. */
export function crossVec2(left: Vec2, right: Vec2): number {
  return left[0] * right[1] - left[1] * right[0];
}

export function lengthSquaredVec2(vector: Vec2): number {
  return dotVec2(vector, vector);
}

export function lengthVec2(vector: Vec2): number {
  return Math.hypot(vector[0], vector[1]);
}

export function distanceSquaredVec2(left: Vec2, right: Vec2): number {
  return lengthSquaredVec2(subtractVec2(left, right));
}

export function distanceVec2(left: Vec2, right: Vec2): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1]);
}

export function normalizeVec2(vector: Vec2, epsilon = EPSILON): Vec2 | null {
  const length = lengthVec2(vector);
  const componentScale = Math.max(Math.abs(vector[0]), Math.abs(vector[1]));
  if (length === 0 || length <= epsilon * componentScale) {
    return null;
  }
  return [vector[0] / length, vector[1] / length];
}

export function lerpVec2(from: Vec2, to: Vec2, amount: number): Vec2 {
  return [
    lerpNumber(from[0], to[0], amount),
    lerpNumber(from[1], to[1], amount),
  ];
}

export function perpendicularVec2(vector: Vec2): Vec2 {
  return [-vector[1], vector[0]];
}

export function rotateVec2(vector: Vec2, radians: number): Vec2 {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return [
    cosine * vector[0] - sine * vector[1],
    sine * vector[0] + cosine * vector[1],
  ];
}

export function nearlyEqualVec2(
  left: Vec2,
  right: Vec2,
  epsilon = EPSILON,
): boolean {
  return (
    nearlyEqual(left[0], right[0], epsilon) &&
    nearlyEqual(left[1], right[1], epsilon)
  );
}

/** Chooses a deterministic sign for direction-only vectors. */
export function canonicalizeDirection(vector: Vec2, epsilon = EPSILON): Vec2 {
  const [x, y] = vector;
  const result: Vec2 =
    x < -epsilon || (Math.abs(x) <= epsilon && y < 0) ? [-x, -y] : [x, y];
  return [result[0] === 0 ? 0 : result[0], result[1] === 0 ? 0 : result[1]];
}
