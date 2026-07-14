export type Dimension = 1 | 2 | 3;

export type Field = "R" | "C";

export type RealVector = readonly number[];

export type RealMatrix = readonly (readonly number[])[];

export interface ComplexScalar {
  readonly re: number;
  readonly im: number;
}

export type ComplexVector = readonly ComplexScalar[];

export type ComplexMatrix = readonly (readonly ComplexScalar[])[];

export interface MatrixShape {
  readonly rows: Dimension;
  readonly columns: Dimension;
}
