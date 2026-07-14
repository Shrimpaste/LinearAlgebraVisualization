import { describe, expect, it } from "vitest";
import {
  analyzeBasis,
  applyMat2,
  changeOfBasisMatrix,
  convertBasisCoordinates,
  coordinatesFromStandard,
  coordinatesToStandard,
  effectiveMatrix,
  matrixInBases,
  nearlyEqualMat2,
} from "./index";

describe("basis conversion", () => {
  const skewBasis = [
    [1, 1],
    [1, -1],
  ] as const;
  const standardBasis = [
    [1, 0],
    [0, 1],
  ] as const;

  it("analyzes independence and orientation", () => {
    expect(analyzeBasis(standardBasis)).toMatchObject({
      determinant: 1,
      rank: 2,
      isBasis: true,
      orientation: "positive",
    });
    expect(analyzeBasis(skewBasis).orientation).toBe("negative");
    expect(
      analyzeBasis([
        [1, 2],
        [2, 4],
      ]),
    ).toMatchObject({
      rank: 1,
      isBasis: false,
      orientation: "degenerate",
    });
  });

  it("moves vectors between basis and standard coordinates", () => {
    expect(coordinatesToStandard([2, 3], skewBasis)).toEqual([5, -1]);
    const coordinates = coordinatesFromStandard([5, -1], skewBasis);
    expect(coordinates?.[0]).toBeCloseTo(2);
    expect(coordinates?.[1]).toBeCloseTo(3);
    expect(
      coordinatesFromStandard(
        [1, 2],
        [
          [1, 0],
          [2, 0],
        ],
      ),
    ).toBeNull();
  });

  it("builds change-of-basis maps with explicit direction", () => {
    const conversion = changeOfBasisMatrix(skewBasis, standardBasis);
    expect(conversion).not.toBeNull();
    expect(applyMat2(conversion!, [2, 3])).toEqual([5, -1]);
    expect(convertBasisCoordinates([5, -1], standardBasis, skewBasis)).toEqual([
      2, 3,
    ]);
  });

  it("round-trips operator matrices through domain and codomain bases", () => {
    const domain = [
      [2, 0],
      [0, 1],
    ] as const;
    const codomain = [
      [1, 1],
      [1, -1],
    ] as const;
    const standardMatrix = [2, 1, -1, 3] as const;
    const coordinateMatrix = matrixInBases(standardMatrix, domain, codomain);
    expect(coordinateMatrix).not.toBeNull();
    const roundTrip = effectiveMatrix(coordinateMatrix!, domain, codomain);
    expect(roundTrip).not.toBeNull();
    expect(nearlyEqualMat2(roundTrip!, standardMatrix)).toBe(true);
  });

  it("returns null when a requested coordinate system is degenerate", () => {
    const degenerate = [
      [1, 0],
      [2, 0],
    ] as const;
    expect(changeOfBasisMatrix(standardBasis, degenerate)).toBeNull();
    expect(changeOfBasisMatrix(degenerate, standardBasis)).toBeNull();
    expect(
      convertBasisCoordinates([1, 2], degenerate, standardBasis),
    ).toBeNull();
    expect(matrixInBases([1, 0, 0, 1], degenerate, standardBasis)).toBeNull();
    expect(effectiveMatrix([1, 0, 0, 1], standardBasis, degenerate)).toBeNull();
  });
});
