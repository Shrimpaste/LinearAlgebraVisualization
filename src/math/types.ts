export type Vec2 = readonly [x: number, y: number];

/** A row-major 2 x 2 matrix: [m00, m01, m10, m11]. */
export type Mat2 = readonly [
  m00: number,
  m01: number,
  m10: number,
  m11: number,
];

/** Two ordered standard-coordinate vectors forming a candidate basis. */
export type Basis2 = readonly [first: Vec2, second: Vec2];
