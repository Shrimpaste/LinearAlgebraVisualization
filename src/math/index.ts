export type { Basis2, Mat2, Vec2 } from "./types";

export {
  EPSILON,
  clamp,
  finiteOr,
  inverseLerp,
  lerpNumber,
  nearlyEqual,
  nearlyZero,
  safeAcos,
  scaledTolerance,
  snapNearZero,
} from "./numeric";

export {
  UNIT_X,
  UNIT_Y,
  ZERO_VEC2,
  addVec2,
  canonicalizeDirection,
  crossVec2,
  distanceSquaredVec2,
  distanceVec2,
  dotVec2,
  hadamardVec2,
  lengthSquaredVec2,
  lengthVec2,
  lerpVec2,
  nearlyEqualVec2,
  negateVec2,
  normalizeVec2,
  perpendicularVec2,
  rotateVec2,
  scaleVec2,
  subtractVec2,
  vec2,
} from "./vector";

export {
  IDENTITY_MAT2,
  ZERO_MAT2,
  addMat2,
  applyMat2,
  columnsOfMat2,
  determinantMat2,
  identityMat2,
  interpolateMat2,
  inverseMat2,
  mat2,
  mat2FromColumns,
  mat2FromRows,
  maxAbsMat2,
  multiplyMat2,
  nearlyEqualMat2,
  rankMat2,
  rowsOfMat2,
  scaleMat2,
  traceMat2,
  transposeMat2,
} from "./matrix";

export type {
  InfiniteSolve2Result,
  NoSolve2Result,
  Solve2Result,
  UniqueSolve2Result,
} from "./solve";
export { solve2 } from "./solve";

export type { BasisAnalysis, BasisOrientation } from "./basis";
export {
  STANDARD_BASIS,
  analyzeBasis,
  basisMatrix,
  changeOfBasisMatrix,
  convertBasisCoordinates,
  coordinatesFromStandard,
  coordinatesToStandard,
  effectiveMatrix,
  matrixInBases,
} from "./basis";

export type {
  ComplexEigenAnalysis,
  ComplexEigenvalue,
  DefectiveEigenAnalysis,
  EigenAnalysis,
  RealEigenpair,
  RepeatedEigenAnalysis,
  TwoRealEigenAnalysis,
} from "./eigen";
export {
  analyzeEigenvalues,
  diagonalEigenvalueMatrix,
  eigenDecompositionMatrix,
} from "./eigen";

export type {
  GramSchmidtProjection,
  GramSchmidtResult,
  GramSchmidtStep,
  MetricAnalysis,
  MetricAngleAnalysis,
  MetricProjectionAnalysis,
} from "./metric";
export {
  analyzeMetric,
  analyzeMetricAngle,
  analyzeMetricProjection,
  angleUnderMetric,
  gramSchmidt,
  gramSchmidt2,
  isPositiveDefiniteMetric,
  metricInnerProduct,
  metricNorm,
  metricNormSquared,
  projectOntoMetric,
} from "./metric";
