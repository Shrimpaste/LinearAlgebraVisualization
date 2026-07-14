import { describe, expect, it } from "vitest";
import { deriveTransform, transformDefaults } from "./model";

describe("transform scene model", () => {
  it("does not substitute identity metrics for a dependent custom basis", () => {
    const derived = deriveTransform({
      ...transformDefaults,
      basisMode: "custom",
      basis: [
        [1, 0],
        [2, 0],
      ],
    });

    expect(derived.valid).toBe(false);
    expect(derived.matrix).toBeNull();
    expect(derived.output).toBeNull();
    expect(derived.determinant).toBeNull();
    expect(derived.rank).toBeNull();
  });

  it("distinguishes an algebraic basis from a numerically unstable change of basis", () => {
    const derived = deriveTransform({
      ...transformDefaults,
      basisMode: "custom",
      basis: [
        [1e6, 0],
        [0, 1e-6],
      ],
    });

    expect(derived.basisAnalysis.isBasis).toBe(true);
    expect(derived.valid).toBe(false);
    expect(derived.orientation).toBe("无效");
  });
});
