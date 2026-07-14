import type { Mat2, Vec2 } from "../math";

const numberFormatter = new Intl.NumberFormat("zh-CN", {
  maximumFractionDigits: 3,
  minimumFractionDigits: 0,
  signDisplay: "auto",
});

export function formatNumber(value: number, fallback = "—") {
  if (!Number.isFinite(value)) return fallback;
  if (value === 0 || Object.is(value, -0)) return "0";
  const magnitude = Math.abs(value);
  if (magnitude < 0.001 || magnitude >= 1_000_000) {
    const [mantissa, exponent] = value.toExponential(2).split("e");
    return `${Number(mantissa)}e${Number(exponent)}`;
  }
  return numberFormatter.format(value);
}

export function formatSigned(value: number) {
  if (!Number.isFinite(value)) return "—";
  return value >= 0 ? `+${formatNumber(value)}` : formatNumber(value);
}

export function formatVector(vector: Vec2) {
  return `(${formatNumber(vector[0])}, ${formatNumber(vector[1])})`;
}

export function formatMatrix(matrix: Mat2) {
  return `[[${formatNumber(matrix[0])}, ${formatNumber(matrix[1])}], [${formatNumber(matrix[2])}, ${formatNumber(matrix[3])}]]`;
}

export function formatDegrees(radians: number | null) {
  return radians === null
    ? "未定义"
    : `${formatNumber((radians * 180) / Math.PI)}°`;
}
