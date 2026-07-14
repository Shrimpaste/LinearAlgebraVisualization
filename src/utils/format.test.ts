import { describe, expect, it } from "vitest";
import { formatNumber } from "./format";

describe("formatNumber", () => {
  it("preserves small nonzero values with scientific notation", () => {
    expect(formatNumber(0.0001)).toBe("1e-4");
    expect(formatNumber(-0.00025)).toBe("-2.5e-4");
  });

  it("keeps ordinary values compact and readable", () => {
    expect(formatNumber(0)).toBe("0");
    expect(formatNumber(12.34567)).toBe("12.346");
    expect(formatNumber(1_000_000)).toBe("1e6");
  });

  it("uses the supplied fallback for non-finite values", () => {
    expect(formatNumber(Number.NaN, "n/a")).toBe("n/a");
  });
});
