import { svdRealMatrix } from "../../math/nd/decompositions";
import type { Dimension, RealMatrix } from "../../math/nd/types";

export interface SystemsState {
  version: 1;
  rows: Dimension;
  columns: Dimension;
  matrix: RealMatrix;
  b: readonly number[];
  parameters: readonly number[];
}
export const systemsDefaults: SystemsState = {
  version: 1,
  rows: 2,
  columns: 2,
  matrix: [
    [1, 2],
    [1, 2],
  ],
  b: [2, 1],
  parameters: [0, 0, 0],
};
export function migrateSystemsState(value: unknown): SystemsState {
  if (!value || typeof value !== "object") return systemsDefaults;
  const s = value as Partial<SystemsState>;
  const rows = s.rows === 1 || s.rows === 3 ? s.rows : 2;
  const columns = s.columns === 1 || s.columns === 3 ? s.columns : 2;
  const number = (v: unknown, fallback = 0) =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return {
    version: 1,
    rows,
    columns,
    matrix: Array.from({ length: rows }, (_, i) =>
      Array.from({ length: columns }, (_, j) =>
        number(s.matrix?.[i]?.[j], +(i === j)),
      ),
    ),
    b: Array.from({ length: rows }, (_, i) => number(s.b?.[i])),
    parameters: Array.from({ length: 3 }, (_, i) => number(s.parameters?.[i])),
  };
}
const dot = (a: readonly number[], b: readonly number[]) =>
  a.reduce((sum, v, i) => sum + v * b[i]!, 0);
const norm = (a: readonly number[]) => Math.hypot(...a);

export function deriveSystems(state: SystemsState) {
  const { matrix: A, b, columns: n } = state;
  const svd = svdRealMatrix(A);
  const active = Array.from({ length: svd.rank }, (_, k) =>
    svd.V.map((row) => row[k]!),
  );
  const minimum = Array(n).fill(0) as number[];
  active.forEach((v, k) => {
    const weight =
      dot(
        svd.U.map((row) => row[k]!),
        b,
      ) / svd.singularValues[k]!;
    v.forEach((entry, j) => {
      minimum[j]! += weight * entry;
    });
  });
  // Complete the row-space basis, including directions omitted by a thin SVD.
  const nullspace: number[][] = [];
  for (let j = 0; j < n && nullspace.length < n - svd.rank; j++) {
    let candidate = Array.from({ length: n }, (_, i) => +(i === j));
    for (let pass = 0; pass < 2; pass++) {
      for (const basis of [...active, ...nullspace]) {
        const projection = dot(candidate, basis);
        candidate = candidate.map((entry, i) => entry - projection * basis[i]!);
      }
    }
    const length = norm(candidate);
    if (length > 1e-8) nullspace.push(candidate.map((entry) => entry / length));
  }
  const solution = minimum.map(
    (entry, j) =>
      entry +
      nullspace.reduce(
        (sum, v, i) => sum + (state.parameters[i] ?? 0) * v[j]!,
        0,
      ),
  );
  const fitted = A.map((row) => dot(row, solution));
  const residual = b.map((entry, i) => entry - fitted[i]!);
  const residualNorm = norm(residual);
  const matrixNorm = Math.hypot(...A.flat());
  const relativeResidual =
    residualNorm /
    Math.max(norm(b) + matrixNorm * norm(solution), Number.MIN_VALUE);
  // Solvability is independent of the chosen point in the nullspace family.
  const minimumResidual = b.map((entry, i) => entry - dot(A[i]!, minimum));
  const exact =
    norm(minimumResidual) <= 1e-8 * (norm(b) + matrixNorm * norm(minimum));
  const normal = Array.from({ length: n }, (_, j) =>
    dot(
      A.map((row) => row[j]!),
      residual,
    ),
  );
  return {
    rank: svd.rank,
    minimum,
    nullspace,
    solution,
    fitted,
    residual,
    residualNorm,
    relativeResidual,
    normalResidual: norm(normal),
    exact,
    status: exact
      ? svd.rank === n
        ? "唯一精确解"
        : "无穷多个精确解"
      : svd.rank === n
        ? "无精确解 · 唯一最小二乘解"
        : "无精确解 · 多个最小二乘解",
  };
}
