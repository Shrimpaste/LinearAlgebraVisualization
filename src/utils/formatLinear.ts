import { formatNumber } from "./format";

export interface ComplexLike {
  readonly re: number;
  readonly im: number;
}

export function formatRealVector(vector: readonly number[]) {
  return `(${vector.map((value) => formatNumber(value)).join(", ")})`;
}

export function formatRealMatrix(matrix: readonly (readonly number[])[]) {
  return matrix
    .map((row) => `[${row.map((value) => formatNumber(value)).join(", ")}]`)
    .join(" ");
}

export function formatComplex(value: ComplexLike) {
  const real = Math.abs(value.re) < 1e-12 ? 0 : value.re;
  const imaginary = Math.abs(value.im) < 1e-12 ? 0 : value.im;
  if (imaginary === 0) return formatNumber(real);
  const magnitude = Math.abs(imaginary);
  const imaginaryTerm =
    Math.abs(magnitude - 1) < 1e-12 ? "i" : `${formatNumber(magnitude)}i`;
  if (real === 0) return imaginary < 0 ? `-${imaginaryTerm}` : imaginaryTerm;
  return `${formatNumber(real)} ${imaginary < 0 ? "-" : "+"} ${imaginaryTerm}`;
}

export function formatComplexVector(vector: readonly ComplexLike[]) {
  return `(${vector.map(formatComplex).join(", ")})`;
}

export function formatDimension(rows: number, columns = rows) {
  return rows === columns ? `${rows}D` : `R${columns} → R${rows}`;
}
