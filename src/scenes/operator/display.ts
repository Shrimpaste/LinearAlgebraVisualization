import type { ComplexMatrix } from "../../math/nd";

const DISPLAY_DECIMALS = 6;

export function compactOperatorDisplayNumber(value: number): number {
  const rounded = Number(value.toFixed(DISPLAY_DECIMALS));
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function compactOperatorDisplayMatrix(
  matrix: ComplexMatrix,
): ComplexMatrix {
  return matrix.map((row) =>
    row.map((entry) => ({
      re: compactOperatorDisplayNumber(entry.re),
      im: compactOperatorDisplayNumber(entry.im),
    })),
  );
}
