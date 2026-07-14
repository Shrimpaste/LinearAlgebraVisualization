import {
  IDENTITY_MAT2,
  analyzeMetric,
  analyzeMetricAngle,
  analyzeMetricProjection,
  gramSchmidt2,
  metricInnerProduct,
  metricNorm,
  type Mat2,
  type Vec2,
} from "../../math";

export type InnerProductMode = "projection" | "gram-schmidt";
export type MetricPreset = "euclidean" | "x-weighted" | "correlated" | "custom";

export interface InnerProductState {
  first: Vec2;
  second: Vec2;
  mode: InnerProductMode;
  metricPreset: MetricPreset;
  metric: Mat2;
  showMetricCircle: boolean;
}

export const innerProductDefaults: InnerProductState = {
  first: [2.1, 1.2],
  second: [1.55, -0.35],
  mode: "projection",
  metricPreset: "euclidean",
  metric: IDENTITY_MAT2,
  showMetricCircle: true,
};

export const metricPresets: Record<Exclude<MetricPreset, "custom">, Mat2> = {
  euclidean: IDENTITY_MAT2,
  "x-weighted": [2.2, 0, 0, 0.7],
  correlated: [1.4, 0.55, 0.55, 1.1],
};

export function deriveInnerProduct(state: InnerProductState) {
  const metricAnalysis = analyzeMetric(state.metric);
  const angle = analyzeMetricAngle(state.first, state.second, state.metric);
  const projection = analyzeMetricProjection(
    state.first,
    state.second,
    state.metric,
  );
  const gramSchmidt = gramSchmidt2(state.first, state.second, state.metric);
  const innerProduct = metricAnalysis.isPositiveDefinite
    ? metricInnerProduct(state.first, state.second, state.metric)
    : null;
  return {
    metricAnalysis,
    angle,
    projection,
    gramSchmidt,
    innerProduct,
    firstNorm: metricNorm(state.first, state.metric),
    secondNorm: metricNorm(state.second, state.metric),
  } as const;
}
