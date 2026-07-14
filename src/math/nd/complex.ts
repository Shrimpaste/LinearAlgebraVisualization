import type {
  ComplexMatrix,
  ComplexScalar,
  ComplexVector,
  Dimension,
  Field,
  RealMatrix,
  RealVector,
} from "./types";
import {
  ND_EPSILON,
  assertSameShape,
  normalizedResidual,
  validateComplexMatrix,
  validateComplexScalar,
  validateComplexVector,
  validateRealMatrix,
  validateRealVector,
} from "./validation";

export interface AxiomCheck<Witness> {
  readonly passed: boolean;
  readonly residual: number;
  readonly witness: Witness;
}

export interface InnerProductValidation {
  readonly field: Field;
  readonly dimension: Dimension;
  readonly valid: boolean;
  readonly positiveDefinite: AxiomCheck<{
    readonly metric: ComplexMatrix;
    readonly hermitianResidual: number;
    readonly leadingPrincipalMinors: readonly number[];
  }>;
  readonly firstSlotAdditivity: AxiomCheck<{
    readonly x: ComplexVector;
    readonly z: ComplexVector;
    readonly y: ComplexVector;
    readonly left: ComplexScalar;
    readonly right: ComplexScalar;
  }>;
  readonly firstSlotHomogeneity: AxiomCheck<{
    readonly alpha: ComplexScalar;
    readonly x: ComplexVector;
    readonly y: ComplexVector;
    readonly left: ComplexScalar;
    readonly right: ComplexScalar;
  }>;
  readonly conjugateSymmetry: AxiomCheck<{
    readonly x: ComplexVector;
    readonly y: ComplexVector;
    readonly left: ComplexScalar;
    readonly right: ComplexScalar;
  }>;
}

export function complex(re: number, im = 0): ComplexScalar {
  const value = { re: re === 0 ? 0 : re, im: im === 0 ? 0 : im };
  validateComplexScalar(value);
  return value;
}

export function addComplex(
  left: ComplexScalar,
  right: ComplexScalar,
): ComplexScalar {
  validateComplexScalar(left, "left scalar");
  validateComplexScalar(right, "right scalar");
  return complex(left.re + right.re, left.im + right.im);
}

export function subtractComplex(
  left: ComplexScalar,
  right: ComplexScalar,
): ComplexScalar {
  validateComplexScalar(left, "left scalar");
  validateComplexScalar(right, "right scalar");
  return complex(left.re - right.re, left.im - right.im);
}

export function multiplyComplex(
  left: ComplexScalar,
  right: ComplexScalar,
): ComplexScalar {
  validateComplexScalar(left, "left scalar");
  validateComplexScalar(right, "right scalar");
  return complex(
    left.re * right.re - left.im * right.im,
    left.re * right.im + left.im * right.re,
  );
}

export function conjugateComplex(value: ComplexScalar): ComplexScalar {
  validateComplexScalar(value);
  return complex(value.re, -value.im);
}

export function absComplex(value: ComplexScalar) {
  validateComplexScalar(value);
  return Math.hypot(value.re, value.im);
}

export function toComplexVector(vector: RealVector): ComplexVector {
  validateRealVector(vector);
  return vector.map((value) => ({ re: value, im: 0 }));
}

export function toComplexMatrix(matrix: RealMatrix): ComplexMatrix {
  validateRealMatrix(matrix);
  return matrix.map((row) => row.map((value) => ({ re: value, im: 0 })));
}

export function zeroComplexVector(dimension: Dimension): ComplexVector {
  return Array.from({ length: dimension }, () => ({ re: 0, im: 0 }));
}

export function identityComplexMatrix(dimension: Dimension): ComplexMatrix {
  if (!Number.isInteger(dimension) || dimension < 1 || dimension > 3) {
    throw new RangeError("dimension must be between 1 and 3");
  }
  return Array.from({ length: dimension }, (_, row) =>
    Array.from({ length: dimension }, (_, column) => ({
      re: row === column ? 1 : 0,
      im: 0,
    })),
  );
}

export function addComplexVectors(
  left: ComplexVector,
  right: ComplexVector,
): ComplexVector {
  const dimension = validateComplexVector(left, "left vector");
  if (validateComplexVector(right, "right vector") !== dimension) {
    throw new RangeError("vector lengths must match");
  }
  return left.map((value, index) => addComplex(value, right[index]!));
}

export function scaleComplexVector(
  scalar: ComplexScalar,
  vector: ComplexVector,
): ComplexVector {
  validateComplexScalar(scalar);
  validateComplexVector(vector);
  return vector.map((value) => multiplyComplex(scalar, value));
}

export function adjointComplexMatrix(matrix: ComplexMatrix): ComplexMatrix {
  const shape = validateComplexMatrix(matrix);
  return Array.from({ length: shape.columns }, (_, row) =>
    Array.from({ length: shape.rows }, (_, column) =>
      conjugateComplex(matrix[column]![row]!),
    ),
  );
}

export function multiplyComplexMatrices(
  left: ComplexMatrix,
  right: ComplexMatrix,
): ComplexMatrix {
  const leftShape = validateComplexMatrix(left, "left matrix");
  const rightShape = validateComplexMatrix(right, "right matrix");
  if (leftShape.columns !== rightShape.rows) {
    throw new RangeError("inner matrix dimensions must match");
  }
  return Array.from({ length: leftShape.rows }, (_, row) =>
    Array.from({ length: rightShape.columns }, (_, column) => {
      let value: ComplexScalar = { re: 0, im: 0 };
      for (let index = 0; index < leftShape.columns; index += 1) {
        value = addComplex(
          value,
          multiplyComplex(left[row]![index]!, right[index]![column]!),
        );
      }
      return value;
    }),
  );
}

export function applyComplexMatrix(
  matrix: ComplexMatrix,
  vector: ComplexVector,
): ComplexVector {
  const shape = validateComplexMatrix(matrix);
  if (validateComplexVector(vector) !== shape.columns) {
    throw new RangeError("matrix columns must match vector length");
  }
  return matrix.map((row) => {
    let value: ComplexScalar = { re: 0, im: 0 };
    row.forEach((entry, index) => {
      value = addComplex(value, multiplyComplex(entry, vector[index]!));
    });
    return value;
  });
}

export function subtractComplexMatrices(
  left: ComplexMatrix,
  right: ComplexMatrix,
): ComplexMatrix {
  const leftShape = validateComplexMatrix(left, "left matrix");
  const rightShape = validateComplexMatrix(right, "right matrix");
  assertSameShape(leftShape, rightShape);
  return left.map((row, rowIndex) =>
    row.map((entry, columnIndex) =>
      subtractComplex(entry, right[rowIndex]![columnIndex]!),
    ),
  );
}

export function complexFrobeniusNorm(matrix: ComplexMatrix) {
  validateComplexMatrix(matrix);
  let scale = 0;
  let sum = 1;
  matrix.forEach((row) =>
    row.forEach((entry) => {
      const magnitude = absComplex(entry);
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

export function determinantComplexMatrix(matrix: ComplexMatrix): ComplexScalar {
  const shape = validateComplexMatrix(matrix);
  if (shape.rows !== shape.columns) {
    throw new RangeError("determinant requires a square matrix");
  }
  if (shape.rows === 1) return matrix[0]![0]!;
  if (shape.rows === 2) {
    return subtractComplex(
      multiplyComplex(matrix[0]![0]!, matrix[1]![1]!),
      multiplyComplex(matrix[0]![1]!, matrix[1]![0]!),
    );
  }
  const first = multiplyComplex(
    matrix[0]![0]!,
    subtractComplex(
      multiplyComplex(matrix[1]![1]!, matrix[2]![2]!),
      multiplyComplex(matrix[1]![2]!, matrix[2]![1]!),
    ),
  );
  const second = multiplyComplex(
    matrix[0]![1]!,
    subtractComplex(
      multiplyComplex(matrix[1]![0]!, matrix[2]![2]!),
      multiplyComplex(matrix[1]![2]!, matrix[2]![0]!),
    ),
  );
  const third = multiplyComplex(
    matrix[0]![2]!,
    subtractComplex(
      multiplyComplex(matrix[1]![0]!, matrix[2]![1]!),
      multiplyComplex(matrix[1]![1]!, matrix[2]![0]!),
    ),
  );
  return addComplex(subtractComplex(first, second), third);
}

/** First-slot-linear convention: <x,y> = y* G x. */
export function complexInnerProduct(
  x: ComplexVector,
  y: ComplexVector,
  metric: ComplexMatrix = identityComplexMatrix(validateComplexVector(x)),
): ComplexScalar {
  const dimension = validateComplexVector(x, "x");
  if (validateComplexVector(y, "y") !== dimension) {
    throw new RangeError("vector lengths must match");
  }
  const shape = validateComplexMatrix(metric, "metric");
  if (shape.rows !== dimension || shape.columns !== dimension) {
    throw new RangeError("metric shape must match vector length");
  }
  const mapped = applyComplexMatrix(metric, x);
  let result: ComplexScalar = { re: 0, im: 0 };
  y.forEach((entry, index) => {
    result = addComplex(
      result,
      multiplyComplex(conjugateComplex(entry), mapped[index]!),
    );
  });
  return result;
}

export function realInnerProduct(
  x: RealVector,
  y: RealVector,
  metric?: RealMatrix,
) {
  const dimension = validateRealVector(x, "x");
  if (validateRealVector(y, "y") !== dimension) {
    throw new RangeError("vector lengths must match");
  }
  const complexMetric = metric
    ? toComplexMatrix(metric)
    : identityComplexMatrix(dimension);
  return complexInnerProduct(
    toComplexVector(x),
    toComplexVector(y),
    complexMetric,
  ).re;
}

function relativeScalarResidual(left: ComplexScalar, right: ComplexScalar) {
  return normalizedResidual(
    absComplex(subtractComplex(left, right)),
    Math.max(absComplex(left), absComplex(right)),
  );
}

function hermitianResidual(metric: ComplexMatrix) {
  return normalizedResidual(
    complexFrobeniusNorm(
      subtractComplexMatrices(metric, adjointComplexMatrix(metric)),
    ),
    complexFrobeniusNorm(metric),
  );
}

function leadingPrincipalMinors(metric: ComplexMatrix) {
  const { rows } = validateComplexMatrix(metric);
  const result: number[] = [];
  for (let size = 1; size <= rows; size += 1) {
    const principal = Array.from({ length: size }, (_, row) =>
      Array.from({ length: size }, (_, column) => metric[row]![column]!),
    );
    let scale = 0;
    principal.forEach((row) =>
      row.forEach((value) => {
        scale = Math.max(scale, absComplex(value));
      }),
    );
    if (scale === 0) {
      result.push(0);
      continue;
    }
    const normalized = principal.map((row) =>
      row.map((value) => ({ re: value.re / scale, im: value.im / scale })),
    );
    result.push(determinantComplexMatrix(normalized).re);
  }
  return result;
}

function witnessVector(
  dimension: Dimension,
  field: Field,
  offset: number,
): ComplexVector {
  return Array.from({ length: dimension }, (_, index) => ({
    re: index + 1 + offset,
    im: field === "C" ? ((index + offset) % 2 === 0 ? 0.5 : -0.25) : 0,
  }));
}

export function validateInnerProduct(
  field: Field,
  metric: RealMatrix | ComplexMatrix,
  epsilon = ND_EPSILON,
): InnerProductValidation {
  const complexMetric =
    field === "R"
      ? toComplexMatrix(metric as RealMatrix)
      : (metric as ComplexMatrix);
  const shape = validateComplexMatrix(complexMetric, "metric");
  if (shape.rows !== shape.columns) {
    throw new RangeError("an inner-product metric must be square");
  }

  const x = witnessVector(shape.rows, field, 0);
  const y = witnessVector(shape.rows, field, 1);
  const z = witnessVector(shape.rows, field, 2);
  const alpha = field === "R" ? complex(1.75) : complex(0.5, -0.75);

  const additiveLeft = complexInnerProduct(
    addComplexVectors(x, z),
    y,
    complexMetric,
  );
  const additiveRight = addComplex(
    complexInnerProduct(x, y, complexMetric),
    complexInnerProduct(z, y, complexMetric),
  );
  const additiveResidual = relativeScalarResidual(additiveLeft, additiveRight);

  const homogeneousLeft = complexInnerProduct(
    scaleComplexVector(alpha, x),
    y,
    complexMetric,
  );
  const homogeneousRight = multiplyComplex(
    alpha,
    complexInnerProduct(x, y, complexMetric),
  );
  const homogeneousResidual = relativeScalarResidual(
    homogeneousLeft,
    homogeneousRight,
  );

  const symmetryLeft = complexInnerProduct(x, y, complexMetric);
  const symmetryRight = conjugateComplex(
    complexInnerProduct(y, x, complexMetric),
  );
  const symmetryResidual = hermitianResidual(complexMetric);
  const minors = leadingPrincipalMinors(complexMetric);
  const positiveResidual = Math.max(
    symmetryResidual,
    ...minors.map((minor) => Math.max(0, epsilon - minor)),
  );

  const positiveDefinite: InnerProductValidation["positiveDefinite"] = {
    passed:
      symmetryResidual <= epsilon && minors.every((minor) => minor > epsilon),
    residual: positiveResidual,
    witness: {
      metric: complexMetric,
      hermitianResidual: symmetryResidual,
      leadingPrincipalMinors: minors,
    },
  };
  const firstSlotAdditivity: InnerProductValidation["firstSlotAdditivity"] = {
    passed: additiveResidual <= epsilon,
    residual: additiveResidual,
    witness: { x, z, y, left: additiveLeft, right: additiveRight },
  };
  const firstSlotHomogeneity: InnerProductValidation["firstSlotHomogeneity"] = {
    passed: homogeneousResidual <= epsilon,
    residual: homogeneousResidual,
    witness: {
      alpha,
      x,
      y,
      left: homogeneousLeft,
      right: homogeneousRight,
    },
  };
  const conjugateSymmetry: InnerProductValidation["conjugateSymmetry"] = {
    passed: symmetryResidual <= epsilon,
    residual: symmetryResidual,
    witness: { x, y, left: symmetryLeft, right: symmetryRight },
  };

  return {
    field,
    dimension: shape.rows,
    valid:
      positiveDefinite.passed &&
      firstSlotAdditivity.passed &&
      firstSlotHomogeneity.passed &&
      conjugateSymmetry.passed,
    positiveDefinite,
    firstSlotAdditivity,
    firstSlotHomogeneity,
    conjugateSymmetry,
  };
}
