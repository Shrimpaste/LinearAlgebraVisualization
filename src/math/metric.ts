import {
  IDENTITY_MAT2,
  applyMat2,
  determinantMat2,
  maxAbsMat2,
} from "./matrix";
import { EPSILON, safeAcos } from "./numeric";
import type { Mat2, Vec2 } from "./types";
import { dotVec2, lengthVec2, scaleVec2, subtractVec2 } from "./vector";

export interface MetricAnalysis {
  readonly kind: "spd" | "not-symmetric" | "not-positive-definite";
  readonly matrix: Mat2;
  readonly symmetrized: Mat2;
  readonly symmetryError: number;
  readonly determinant: number;
  readonly leadingPrincipalMinor: number;
  readonly schurComplement: number;
  readonly isPositiveDefinite: boolean;
}

export interface MetricProjectionAnalysis {
  readonly projection: Vec2;
  readonly residual: Vec2;
  readonly coefficient: number;
  readonly residualInnerProduct: number;
}

export interface MetricAngleAnalysis {
  readonly radians: number;
  readonly degrees: number;
  readonly cosine: number;
}

export interface GramSchmidtProjection {
  readonly ontoIndex: number;
  readonly coefficient: number;
  readonly vector: Vec2;
}

export interface GramSchmidtStep {
  readonly inputIndex: number;
  readonly input: Vec2;
  readonly projections: readonly GramSchmidtProjection[];
  readonly residual: Vec2;
  readonly residualNorm: number;
  readonly accepted: boolean;
  readonly normalized: Vec2 | null;
}

interface GramSchmidtBase {
  readonly rank: 0 | 1 | 2;
  readonly orthogonal: readonly Vec2[];
  readonly orthonormal: readonly Vec2[];
  readonly rejectedIndices: readonly number[];
  readonly steps: readonly GramSchmidtStep[];
  readonly metric: MetricAnalysis;
}

export type GramSchmidtResult =
  | (GramSchmidtBase & { readonly kind: "complete" | "dependent" })
  | (GramSchmidtBase & { readonly kind: "invalid-metric" });

function schurComplement(metric: Mat2) {
  if (!(metric[0] > 0)) return Number.NEGATIVE_INFINITY;
  return metric[3] - (metric[1] / metric[0]) * metric[1];
}

function metricCoordinates(vector: Vec2, metric: Mat2): Vec2 {
  const ratio = metric[1] / metric[0];
  const schur = schurComplement(metric);
  return [
    Math.sqrt(metric[0]) * (vector[0] + ratio * vector[1]),
    Math.sqrt(schur) * vector[1],
  ];
}

function stableDot(left: Vec2, right: Vec2) {
  const leftScale = Math.max(Math.abs(left[0]), Math.abs(left[1]));
  const rightScale = Math.max(Math.abs(right[0]), Math.abs(right[1]));
  if (leftScale === 0 || rightScale === 0) return 0;
  const normalized =
    (left[0] / leftScale) * (right[0] / rightScale) +
    (left[1] / leftScale) * (right[1] / rightScale);
  if (normalized === 0) return 0;
  return normalized * leftScale * rightScale;
}

function stableProjectionCoefficient(vector: Vec2, onto: Vec2) {
  const vectorScale = Math.max(Math.abs(vector[0]), Math.abs(vector[1]));
  const ontoScale = Math.max(Math.abs(onto[0]), Math.abs(onto[1]));
  if (ontoScale === 0) return null;
  if (vectorScale === 0) return 0;
  const vectorUnit: Vec2 = [vector[0] / vectorScale, vector[1] / vectorScale];
  const ontoUnit: Vec2 = [onto[0] / ontoScale, onto[1] / ontoScale];
  const denominator = dotVec2(ontoUnit, ontoUnit);
  return (
    (vectorScale / ontoScale) * (dotVec2(vectorUnit, ontoUnit) / denominator)
  );
}

export function analyzeMetric(
  metric: Mat2,
  _epsilon = EPSILON,
): MetricAnalysis {
  const symmetryError = Math.abs(metric[1] - metric[2]);
  const symmetricOffDiagonal = metric[1] / 2 + metric[2] / 2;
  const symmetrized: Mat2 = [
    metric[0],
    symmetricOffDiagonal,
    symmetricOffDiagonal,
    metric[3],
  ];
  const determinant = determinantMat2(symmetrized);
  const schur = schurComplement(metric);
  const isSymmetric = metric[1] === metric[2];
  const isPositiveDefinite = isSymmetric && metric[0] > 0 && schur > 0;

  return {
    kind: !isSymmetric
      ? "not-symmetric"
      : isPositiveDefinite
        ? "spd"
        : "not-positive-definite",
    matrix: metric,
    symmetrized,
    symmetryError,
    determinant,
    leadingPrincipalMinor: metric[0],
    schurComplement: schur,
    isPositiveDefinite,
  };
}

export function isPositiveDefiniteMetric(
  metric: Mat2,
  epsilon = EPSILON,
): boolean {
  return analyzeMetric(metric, epsilon).isPositiveDefinite;
}

export function metricInnerProduct(
  left: Vec2,
  right: Vec2,
  metric: Mat2 = IDENTITY_MAT2,
): number {
  const analysis = analyzeMetric(metric);
  if (analysis.isPositiveDefinite) {
    return stableDot(
      metricCoordinates(left, metric),
      metricCoordinates(right, metric),
    );
  }
  const scale = maxAbsMat2(metric);
  if (scale === 0) return 0;
  const normalized: Mat2 = [
    metric[0] / scale,
    metric[1] / scale,
    metric[2] / scale,
    metric[3] / scale,
  ];
  return dotVec2(left, applyMat2(normalized, right)) * scale;
}

export function metricNormSquared(
  vector: Vec2,
  metric: Mat2 = IDENTITY_MAT2,
): number {
  return metricInnerProduct(vector, vector, metric);
}

export function metricNorm(
  vector: Vec2,
  metric: Mat2 = IDENTITY_MAT2,
  epsilon = EPSILON,
): number | null {
  const analysis = analyzeMetric(metric, epsilon);
  return analysis.isPositiveDefinite
    ? Math.hypot(...metricCoordinates(vector, metric))
    : null;
}

export function analyzeMetricProjection(
  vector: Vec2,
  onto: Vec2,
  metric: Mat2 = IDENTITY_MAT2,
  epsilon = EPSILON,
): MetricProjectionAnalysis | null {
  const metricAnalysis = analyzeMetric(metric, epsilon);
  if (!metricAnalysis.isPositiveDefinite) {
    return null;
  }

  const vectorCoordinates = metricCoordinates(vector, metric);
  const ontoCoordinates = metricCoordinates(onto, metric);
  const coefficient = stableProjectionCoefficient(
    vectorCoordinates,
    ontoCoordinates,
  );
  if (coefficient === null || lengthVec2(onto) === 0) {
    return null;
  }
  const projection = scaleVec2(onto, coefficient);
  const residual = subtractVec2(vector, projection);
  return {
    projection,
    residual,
    coefficient,
    residualInnerProduct: metricInnerProduct(residual, onto, metric),
  };
}

export function projectOntoMetric(
  vector: Vec2,
  onto: Vec2,
  metric: Mat2 = IDENTITY_MAT2,
  epsilon = EPSILON,
): Vec2 | null {
  return (
    analyzeMetricProjection(vector, onto, metric, epsilon)?.projection ?? null
  );
}

export function analyzeMetricAngle(
  left: Vec2,
  right: Vec2,
  metric: Mat2 = IDENTITY_MAT2,
  epsilon = EPSILON,
): MetricAngleAnalysis | null {
  const metricAnalysis = analyzeMetric(metric, epsilon);
  if (!metricAnalysis.isPositiveDefinite) {
    return null;
  }
  const leftCoordinates = metricCoordinates(left, metric);
  const rightCoordinates = metricCoordinates(right, metric);
  const leftNorm = Math.hypot(...leftCoordinates);
  const rightNorm = Math.hypot(...rightCoordinates);
  if (leftNorm === 0 || rightNorm === 0) {
    return null;
  }
  const cosine =
    (leftCoordinates[0] / leftNorm) * (rightCoordinates[0] / rightNorm) +
    (leftCoordinates[1] / leftNorm) * (rightCoordinates[1] / rightNorm);
  const radians = safeAcos(cosine);
  return {
    radians,
    degrees: (radians * 180) / Math.PI,
    cosine: Math.max(-1, Math.min(1, cosine)),
  };
}

export function angleUnderMetric(
  left: Vec2,
  right: Vec2,
  metric: Mat2 = IDENTITY_MAT2,
  epsilon = EPSILON,
): number | null {
  return analyzeMetricAngle(left, right, metric, epsilon)?.radians ?? null;
}

export function gramSchmidt(
  vectors: readonly Vec2[],
  metric: Mat2 = IDENTITY_MAT2,
  epsilon = EPSILON,
): GramSchmidtResult {
  const metricAnalysis = analyzeMetric(metric, epsilon);
  if (!metricAnalysis.isPositiveDefinite) {
    return {
      kind: "invalid-metric",
      rank: 0,
      orthogonal: [],
      orthonormal: [],
      rejectedIndices: vectors.map((_, index) => index),
      steps: [],
      metric: metricAnalysis,
    };
  }

  const orthogonal: Vec2[] = [];
  const orthonormal: Vec2[] = [];
  const rejectedIndices: number[] = [];
  const steps: GramSchmidtStep[] = [];

  vectors.forEach((input, inputIndex) => {
    let residual = input;
    const projections: GramSchmidtProjection[] = [];
    orthogonal.forEach((onto, ontoIndex) => {
      const coefficient =
        stableProjectionCoefficient(
          metricCoordinates(input, metric),
          metricCoordinates(onto, metric),
        ) ?? 0;
      const projection = scaleVec2(onto, coefficient);
      residual = subtractVec2(residual, projection);
      projections.push({ ontoIndex, coefficient, vector: projection });
    });

    const inputNorm = Math.hypot(...metricCoordinates(input, metric));
    const residualNorm = Math.hypot(...metricCoordinates(residual, metric));
    const accepted =
      orthogonal.length < 2 &&
      inputNorm > 0 &&
      residualNorm > epsilon * inputNorm;
    let normalized: Vec2 | null = null;
    if (accepted) {
      normalized = scaleVec2(residual, 1 / residualNorm);
      orthogonal.push(residual);
      orthonormal.push(normalized);
    } else {
      rejectedIndices.push(inputIndex);
    }
    steps.push({
      inputIndex,
      input,
      projections,
      residual,
      residualNorm,
      accepted,
      normalized,
    });
  });

  return {
    kind: rejectedIndices.length === 0 ? "complete" : "dependent",
    rank: orthogonal.length as 0 | 1 | 2,
    orthogonal,
    orthonormal,
    rejectedIndices,
    steps,
    metric: metricAnalysis,
  };
}

export function gramSchmidt2(
  first: Vec2,
  second: Vec2,
  metric: Mat2 = IDENTITY_MAT2,
  epsilon = EPSILON,
): GramSchmidtResult {
  return gramSchmidt([first, second], metric, epsilon);
}
