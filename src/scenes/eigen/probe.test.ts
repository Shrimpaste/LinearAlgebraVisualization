import { expect, it } from "vitest";
import { eigenProbe } from "./model";
it("animates the physical map and recognizes reversed and zero eigenvalues", () => {
  const A = [
    [-2, 0],
    [0, 0],
  ];
  expect(eigenProbe(A, [1, 0], 0).animated).toEqual([1, 0]);
  expect(eigenProbe(A, [1, 0], 1).animated).toEqual([-2, 0]);
  expect(eigenProbe(A, [1, 0]).isEigenvector).toBe(true);
  expect(eigenProbe(A, [0, 1]).isEigenvector).toBe(true);
  expect(eigenProbe(A, [0, 0]).isEigenvector).toBe(false);
  expect(
    eigenProbe(
      [
        [0, -1],
        [1, 0],
      ],
      [1, 0],
    ).isEigenvector,
  ).toBe(false);
});
