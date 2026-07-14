export const EPSILON = 1e-10;

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function lerpNumber(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

export function inverseLerp(
  from: number,
  to: number,
  value: number,
  epsilon = EPSILON,
): number | null {
  const span = to - from;
  return nearlyZero(span, Math.max(Math.abs(from), Math.abs(to)), epsilon)
    ? null
    : (value - from) / span;
}

export function nearlyEqual(
  left: number,
  right: number,
  epsilon = EPSILON,
): boolean {
  return (
    Math.abs(left - right) <=
    epsilon * Math.max(1, Math.abs(left), Math.abs(right))
  );
}

export function nearlyZero(
  value: number,
  scale = 1,
  epsilon = EPSILON,
): boolean {
  return (
    Math.abs(value) <= epsilon * Math.max(Number.MIN_VALUE, Math.abs(scale))
  );
}

export function scaledTolerance(
  values: readonly number[],
  epsilon = EPSILON,
): number {
  let scale = 0;
  for (const value of values) {
    scale = Math.max(scale, Math.abs(value));
  }
  return epsilon * Math.max(Number.MIN_VALUE, scale);
}

export function safeAcos(value: number): number {
  return Math.acos(clamp(value, -1, 1));
}

export function snapNearZero(
  value: number,
  scale = 1,
  epsilon = EPSILON,
): number {
  return nearlyZero(value, scale, epsilon) ? 0 : value;
}

export function finiteOr(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}
