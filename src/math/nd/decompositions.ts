import { eigs, complex as mathComplex } from "mathjs";
import { Matrix, SingularValueDecomposition } from "ml-matrix";
import {
  absComplex,
  adjointComplexMatrix,
  applyComplexMatrix,
  complex,
  complexFrobeniusNorm,
  complexInnerProduct,
  conjugateComplex,
  identityComplexMatrix,
  multiplyComplexMatrices,
  scaleComplexVector,
  subtractComplex,
  subtractComplexMatrices,
  toComplexMatrix,
} from "./complex";
import { multiplyRealMatrices, transposeRealMatrix } from "./real";
import type {
  ComplexMatrix,
  ComplexScalar,
  ComplexVector,
  Dimension,
  RealMatrix,
} from "./types";
import {
  ND_EPSILON,
  normalizedResidual,
  validateComplexMatrix,
  validateRealMatrix,
} from "./validation";

export interface RealSvdResult {
  readonly U: RealMatrix;
  readonly sigma: RealMatrix;
  readonly singularValues: readonly number[];
  readonly V: RealMatrix;
  readonly rank: number;
  readonly condition: number;
  readonly reconstructionResidual: number;
  readonly orthogonalityResidual: number;
}

export interface RightPolarResult extends RealSvdResult {
  readonly Q: RealMatrix;
  readonly P: RealMatrix;
  readonly polarReconstructionResidual: number;
  /** Q is a partial isometry for rectangular or rank-deficient inputs. */
  readonly polarOrthogonalityResidual: number;
  readonly symmetryResidual: number;
}

export interface ComplexOperatorClassification {
  readonly dimension: Dimension;
  readonly normal: boolean;
  readonly selfAdjoint: boolean;
  readonly normalResidual: number;
  readonly selfAdjointResidual: number;
}

export interface NormalSpectralSuccess {
  readonly success: true;
  readonly classification: ComplexOperatorClassification;
  readonly eigenvalues: ComplexVector;
  readonly U: ComplexMatrix;
  readonly lambda: ComplexMatrix;
  readonly reconstructionResidual: number;
  readonly orthogonalityResidual: number;
  readonly eigenResidual: number;
}

export interface NormalSpectralFailure {
  readonly success: false;
  readonly classification: ComplexOperatorClassification;
  readonly reason: "not-normal" | "solver-failed" | "verification-failed";
  readonly message: string;
  readonly reconstructionResidual?: number;
  readonly orthogonalityResidual?: number;
  readonly eigenResidual?: number;
}

export type NormalSpectralResult =
  NormalSpectralSuccess | NormalSpectralFailure;

function maxAbsReal(matrix: RealMatrix) {
  let scale = 0;
  matrix.forEach((row) =>
    row.forEach((value) => {
      scale = Math.max(scale, Math.abs(value));
    }),
  );
  return scale;
}

function realFrobeniusNorm(matrix: RealMatrix) {
  let scale = 0;
  let sum = 1;
  matrix.forEach((row) =>
    row.forEach((value) => {
      const magnitude = Math.abs(value);
      if (magnitude === 0) return;
      if (scale < magnitude) {
        sum = 1 + sum * (scale / magnitude) ** 2;
        scale = magnitude;
      } else {
        sum += (magnitude / scale) ** 2;
      }
    }),
  );
  return scale === 0 ? 0 : scale * Math.sqrt(sum);
}

function subtractRealMatrices(left: RealMatrix, right: RealMatrix): RealMatrix {
  const leftShape = validateRealMatrix(left);
  const rightShape = validateRealMatrix(right);
  if (
    leftShape.rows !== rightShape.rows ||
    leftShape.columns !== rightShape.columns
  ) {
    throw new RangeError("matrix shapes must match");
  }
  return left.map((row, rowIndex) =>
    row.map((entry, columnIndex) => entry - right[rowIndex]![columnIndex]!),
  );
}

function identityRectangular(rows: number, columns: number): RealMatrix {
  return Array.from({ length: rows }, (_, row) =>
    Array.from({ length: columns }, (_, column) => (row === column ? 1 : 0)),
  );
}

export function svdRealMatrix(
  matrix: RealMatrix,
  epsilon = ND_EPSILON,
): RealSvdResult {
  const shape = validateRealMatrix(matrix);
  const scale = maxAbsReal(matrix);
  const normalized = matrix.map((row) =>
    row.map((value) => (scale === 0 ? 0 : value / scale)),
  );
  const decomposition = new SingularValueDecomposition(new Matrix(normalized), {
    autoTranspose: true,
  });
  const U = decomposition.leftSingularVectors.to2DArray();
  const V = decomposition.rightSingularVectors.to2DArray();
  const normalizedSingularValues = decomposition.diagonal;
  const singularValues = normalizedSingularValues.map((value) => value * scale);
  const innerDimension = normalizedSingularValues.length;
  const sigma = Array.from({ length: innerDimension }, (_, row) =>
    Array.from({ length: innerDimension }, (_, column) =>
      row === column ? singularValues[row]! : 0,
    ),
  );
  const normalizedSigma = Array.from({ length: innerDimension }, (_, row) =>
    Array.from({ length: innerDimension }, (_, column) =>
      row === column ? normalizedSingularValues[row]! : 0,
    ),
  );
  const largest = normalizedSingularValues[0] ?? 0;
  const threshold = epsilon * Math.max(shape.rows, shape.columns) * largest;
  const rank = normalizedSingularValues.filter(
    (value) => value > threshold,
  ).length;
  const smallest = normalizedSingularValues[innerDimension - 1] ?? 0;
  const condition =
    rank === innerDimension && smallest > 0 ? largest / smallest : Infinity;
  const normalizedReconstruction = multiplyRealMatrices(
    multiplyRealMatrices(U, normalizedSigma),
    transposeRealMatrix(V),
  );
  const reconstructionResidual = normalizedResidual(
    realFrobeniusNorm(
      subtractRealMatrices(normalizedReconstruction, normalized),
    ),
    realFrobeniusNorm(normalized),
  );
  const uGram = multiplyRealMatrices(transposeRealMatrix(U), U);
  const vGram = multiplyRealMatrices(transposeRealMatrix(V), V);
  const orthogonalityResidual = Math.max(
    normalizedResidual(
      realFrobeniusNorm(
        subtractRealMatrices(
          uGram,
          identityRectangular(uGram.length, uGram[0]!.length),
        ),
      ),
      Math.sqrt(innerDimension),
    ),
    normalizedResidual(
      realFrobeniusNorm(
        subtractRealMatrices(
          vGram,
          identityRectangular(vGram.length, vGram[0]!.length),
        ),
      ),
      Math.sqrt(innerDimension),
    ),
  );
  return {
    U,
    sigma,
    singularValues,
    V,
    rank,
    condition,
    reconstructionResidual,
    orthogonalityResidual,
  };
}

export function rightPolarDecompositionReal(
  matrix: RealMatrix,
  epsilon = ND_EPSILON,
): RightPolarResult {
  const svd = svdRealMatrix(matrix, epsilon);
  const Q = multiplyRealMatrices(svd.U, transposeRealMatrix(svd.V));
  const P = multiplyRealMatrices(
    multiplyRealMatrices(svd.V, svd.sigma),
    transposeRealMatrix(svd.V),
  );
  const reconstructed = multiplyRealMatrices(Q, P);
  const polarReconstructionResidual = normalizedResidual(
    realFrobeniusNorm(subtractRealMatrices(reconstructed, matrix)),
    realFrobeniusNorm(matrix),
  );
  const qAdjointQ = multiplyRealMatrices(transposeRealMatrix(Q), Q);
  const projectorSquare = multiplyRealMatrices(qAdjointQ, qAdjointQ);
  const polarOrthogonalityResidual = normalizedResidual(
    realFrobeniusNorm(subtractRealMatrices(projectorSquare, qAdjointQ)),
    realFrobeniusNorm(qAdjointQ),
  );
  const symmetryResidual = normalizedResidual(
    realFrobeniusNorm(subtractRealMatrices(P, transposeRealMatrix(P))),
    realFrobeniusNorm(P),
  );
  return {
    ...svd,
    Q,
    P,
    polarReconstructionResidual,
    polarOrthogonalityResidual,
    symmetryResidual,
  };
}

function isRealMatrix(
  matrix: RealMatrix | ComplexMatrix,
): matrix is RealMatrix {
  const first = matrix[0]?.[0];
  return typeof first === "number";
}

function asComplexMatrix(matrix: RealMatrix | ComplexMatrix): ComplexMatrix {
  return isRealMatrix(matrix) ? toComplexMatrix(matrix) : matrix;
}

export function classifyComplexOperator(
  matrix: RealMatrix | ComplexMatrix,
  epsilon = ND_EPSILON,
): ComplexOperatorClassification {
  const value = asComplexMatrix(matrix);
  const shape = validateComplexMatrix(value);
  if (shape.rows !== shape.columns) {
    throw new RangeError("operator classification requires a square matrix");
  }
  const adjoint = adjointComplexMatrix(value);
  const normalResidual = normalizedResidual(
    complexFrobeniusNorm(
      subtractComplexMatrices(
        multiplyComplexMatrices(adjoint, value),
        multiplyComplexMatrices(value, adjoint),
      ),
    ),
    complexFrobeniusNorm(value) ** 2,
  );
  const selfAdjointResidual = normalizedResidual(
    complexFrobeniusNorm(subtractComplexMatrices(value, adjoint)),
    complexFrobeniusNorm(value),
  );
  return {
    dimension: shape.rows,
    normal: normalResidual <= epsilon,
    selfAdjoint: selfAdjointResidual <= epsilon,
    normalResidual,
    selfAdjointResidual,
  };
}

function fromMathScalar(value: unknown): ComplexScalar {
  if (typeof value === "number") return complex(value);
  if (
    value !== null &&
    typeof value === "object" &&
    "re" in value &&
    "im" in value
  ) {
    return complex(Number(value.re), Number(value.im));
  }
  throw new TypeError("eigensolver returned an unsupported scalar");
}

function collectionArray(value: unknown): unknown {
  if (
    value !== null &&
    typeof value === "object" &&
    "toArray" in value &&
    typeof value.toArray === "function"
  ) {
    return value.toArray();
  }
  return value;
}

function fromMathVector(value: unknown, dimension: Dimension): ComplexVector {
  const raw = collectionArray(value);
  if (!Array.isArray(raw) || raw.length !== dimension) {
    throw new RangeError("eigensolver returned an invalid vector length");
  }
  return raw.map((entry) => {
    const unwrapped = Array.isArray(entry) ? entry[0] : entry;
    return fromMathScalar(unwrapped);
  });
}

function subtractComplexVectors(
  left: ComplexVector,
  right: ComplexVector,
): ComplexVector {
  return left.map((entry, index) => subtractComplex(entry, right[index]!));
}

function vectorNorm(vector: ComplexVector) {
  return Math.sqrt(
    vector.reduce((sum, value) => sum + absComplex(value) ** 2, 0),
  );
}

function normalizePhase(vector: ComplexVector, epsilon: number) {
  const norm = vectorNorm(vector);
  if (norm <= epsilon) return null;
  let normalized = scaleComplexVector(complex(1 / norm), vector);
  let pivotIndex = 0;
  normalized.forEach((entry, index) => {
    if (absComplex(entry) > absComplex(normalized[pivotIndex]!)) {
      pivotIndex = index;
    }
  });
  const pivot = normalized[pivotIndex]!;
  const pivotMagnitude = absComplex(pivot);
  if (pivotMagnitude > 0) {
    normalized = scaleComplexVector(
      {
        re: pivot.re / pivotMagnitude,
        im: -pivot.im / pivotMagnitude,
      },
      normalized,
    );
    normalized = normalized.map((entry, index) =>
      index === pivotIndex ? { re: pivotMagnitude, im: 0 } : entry,
    );
  }
  return normalized;
}

function removeBasisComponents(
  vector: ComplexVector,
  basis: readonly ComplexVector[],
) {
  let residual = vector;
  // A second pass keeps the small 1-3D nullspaces accurate after cancellation.
  for (let pass = 0; pass < 2; pass += 1) {
    basis.forEach((entry) => {
      const coefficient = complexInnerProduct(residual, entry);
      residual = subtractComplexVectors(
        residual,
        scaleComplexVector(coefficient, entry),
      );
    });
  }
  return residual;
}

function pivotedOrthonormalBasis(
  candidates: readonly ComplexVector[],
  count: number,
  minimumNorm: number,
) {
  const remaining = [...candidates];
  const result: ComplexVector[] = [];
  while (result.length < count) {
    let bestIndex = -1;
    let bestResidual: ComplexVector | null = null;
    let bestNorm = 0;
    remaining.forEach((candidate, index) => {
      const residual = removeBasisComponents(candidate, result);
      const residualNorm = vectorNorm(residual);
      if (residualNorm > bestNorm) {
        bestIndex = index;
        bestResidual = residual;
        bestNorm = residualNorm;
      }
    });
    if (bestIndex < 0 || bestResidual === null || bestNorm <= minimumNorm) {
      return null;
    }
    const normalized = normalizePhase(bestResidual, minimumNorm);
    if (normalized === null) return null;
    result.push(normalized);
    remaining.splice(bestIndex, 1);
  }
  return result;
}

interface SolverEigenpair {
  readonly eigenvalue: ComplexScalar;
  readonly eigenvector: ComplexVector;
}

function clusterEigenpairs(
  pairs: readonly SolverEigenpair[],
  tolerance: number,
) {
  const clusters: SolverEigenpair[][] = [];
  pairs.forEach((pair) => {
    const cluster = clusters.find((entries) =>
      entries.some(
        (entry) =>
          absComplex(subtractComplex(entry.eigenvalue, pair.eigenvalue)) <=
          tolerance,
      ),
    );
    if (cluster) cluster.push(pair);
    else clusters.push([pair]);
  });
  return clusters;
}

function meanEigenvalue(pairs: readonly SolverEigenpair[]) {
  const sum = pairs.reduce(
    (value, pair) => ({
      re: value.re + pair.eigenvalue.re,
      im: value.im + pair.eigenvalue.im,
    }),
    complex(0),
  );
  return complex(sum.re / pairs.length, sum.im / pairs.length);
}

function standardBasis(dimension: Dimension): ComplexVector[] {
  return Array.from({ length: dimension }, (_, column) =>
    Array.from({ length: dimension }, (_, row) =>
      complex(row === column ? 1 : 0),
    ),
  );
}

function stableEigenspaceBasis(
  matrix: ComplexMatrix,
  eigenvalue: ComplexScalar,
  multiplicity: number,
) {
  const dimension = matrix.length as Dimension;
  const rowSpaceDimension = dimension - multiplicity;
  const conjugateRows = matrix.map((row, rowIndex) =>
    row.map((entry, columnIndex) =>
      conjugateComplex(
        rowIndex === columnIndex ? subtractComplex(entry, eigenvalue) : entry,
      ),
    ),
  );
  const rowScale = Math.max(1, ...conjugateRows.map(vectorNorm));
  const machineTolerance =
    Number.EPSILON * 128 * dimension * Math.max(1, rowScale);
  const rowBasis = pivotedOrthonormalBasis(
    conjugateRows,
    rowSpaceDimension,
    machineTolerance,
  );
  if (rowBasis === null) return null;

  const nullspaceCandidates = standardBasis(dimension).map((entry) =>
    removeBasisComponents(entry, rowBasis),
  );
  return pivotedOrthonormalBasis(
    nullspaceCandidates,
    multiplicity,
    Number.EPSILON * 128 * dimension,
  );
}

function rayleighQuotient(matrix: ComplexMatrix, vector: ComplexVector) {
  const numerator = complexInnerProduct(
    applyComplexMatrix(matrix, vector),
    vector,
  );
  const denominator = complexInnerProduct(vector, vector).re;
  return complex(numerator.re / denominator, numerator.im / denominator);
}

function diagonalComplex(values: ComplexVector): ComplexMatrix {
  return values.map((value, row) =>
    values.map((_, column) => (row === column ? value : { re: 0, im: 0 })),
  );
}

export function spectralDecomposeNormal(
  matrix: RealMatrix | ComplexMatrix,
  epsilon = ND_EPSILON,
): NormalSpectralResult {
  const value = asComplexMatrix(matrix);
  const classification = classifyComplexOperator(value, epsilon);
  if (!classification.normal) {
    return {
      success: false,
      classification,
      reason: "not-normal",
      message: "A unitary spectral decomposition requires a normal operator",
    };
  }

  try {
    const mathMatrix = value.map((row) =>
      row.map((entry) => mathComplex(entry.re, entry.im)),
    );
    const solved = eigs(mathMatrix);
    const pairs = solved.eigenvectors;
    if (pairs.length !== classification.dimension) {
      throw new Error("eigensolver returned an incomplete eigenbasis");
    }
    const solverPairs = pairs.map((pair) => ({
      eigenvalue: fromMathScalar(pair.value),
      eigenvector: fromMathVector(pair.vector, classification.dimension),
    }));
    const operatorScale = Math.max(1, complexFrobeniusNorm(value));
    const eigenvalueTolerance =
      Math.max(Number.EPSILON * 128, epsilon * 0.1) * operatorScale;
    const clusters = clusterEigenpairs(solverPairs, eigenvalueTolerance);
    const eigenvalues: ComplexScalar[] = [];
    const vectors: ComplexVector[] = [];
    for (const cluster of clusters) {
      const clusterBasis = stableEigenspaceBasis(
        value,
        meanEigenvalue(cluster),
        cluster.length,
      );
      if (clusterBasis === null) {
        throw new Error("eigensolver returned an unstable eigenspace");
      }
      clusterBasis.forEach((vector) => {
        vectors.push(vector);
        eigenvalues.push(rayleighQuotient(value, vector));
      });
    }
    const U: ComplexMatrix = Array.from(
      { length: classification.dimension },
      (_, row) => vectors.map((vector) => vector[row]!),
    );
    const lambda = diagonalComplex(eigenvalues);
    const adjoint = adjointComplexMatrix(U);
    const reconstructed = multiplyComplexMatrices(
      multiplyComplexMatrices(U, lambda),
      adjoint,
    );
    const reconstructionResidual = normalizedResidual(
      complexFrobeniusNorm(subtractComplexMatrices(reconstructed, value)),
      complexFrobeniusNorm(value),
    );
    const orthogonalityResidual = normalizedResidual(
      complexFrobeniusNorm(
        subtractComplexMatrices(
          multiplyComplexMatrices(adjoint, U),
          identityComplexMatrix(classification.dimension),
        ),
      ),
      Math.sqrt(classification.dimension),
    );
    let eigenResidual = 0;
    vectors.forEach((vector, index) => {
      const mapped = applyComplexMatrix(value, vector);
      const expected = scaleComplexVector(eigenvalues[index]!, vector);
      eigenResidual = Math.max(
        eigenResidual,
        normalizedResidual(
          vectorNorm(subtractComplexVectors(mapped, expected)),
          Math.max(vectorNorm(mapped), vectorNorm(expected)),
        ),
      );
    });
    const verificationTolerance = Math.max(epsilon * 100, 1e-12);
    if (
      reconstructionResidual > verificationTolerance ||
      orthogonalityResidual > verificationTolerance ||
      eigenResidual > verificationTolerance
    ) {
      return {
        success: false,
        classification,
        reason: "verification-failed",
        message: "The eigensolver result did not satisfy the spectral identity",
        reconstructionResidual,
        orthogonalityResidual,
        eigenResidual,
      };
    }
    return {
      success: true,
      classification,
      eigenvalues,
      U,
      lambda,
      reconstructionResidual,
      orthogonalityResidual,
      eigenResidual,
    };
  } catch (error) {
    return {
      success: false,
      classification,
      reason: "solver-failed",
      message: error instanceof Error ? error.message : "eigensolver failed",
    };
  }
}
