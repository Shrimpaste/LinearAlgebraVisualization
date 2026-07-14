import { describe, expect, it } from "vitest";
import {
  formatComplex,
  formatComplexVector,
  formatDimension,
  formatRealMatrix,
  formatRealVector,
} from "./formatLinear";

describe("dimension-generic formatting", () => {
  it("formats vectors and matrices without leaking storage structure", () => {
    expect(formatRealVector([1, -2.5, 0])).toBe("(1, -2.5, 0)");
    expect(
      formatRealMatrix([
        [1, 0],
        [0.25, 2],
      ]),
    ).toBe("[1, 0] [0.25, 2]");
  });

  it("formats complex values with canonical signs and unit coefficients", () => {
    expect(formatComplex({ re: 0, im: 1 })).toBe("i");
    expect(formatComplex({ re: 0, im: -1 })).toBe("-i");
    expect(formatComplex({ re: 2, im: -3 })).toBe("2 - 3i");
    expect(formatComplex({ re: 2, im: 1e-14 })).toBe("2");
    expect(
      formatComplexVector([
        { re: 1, im: 2 },
        { re: -3, im: 0 },
      ]),
    ).toBe("(1 + 2i, -3)");
  });

  it("distinguishes square workspaces from rectangular maps", () => {
    expect(formatDimension(3)).toBe("3D");
    expect(formatDimension(2, 3)).toBe("R3 → R2");
  });
});
