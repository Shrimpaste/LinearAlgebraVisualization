import { describe, expect, it } from "vitest";
import {
  changeTransformBasisMode,
  changeTransformSharedBasis,
  deriveTransform,
  migrateTransformState,
  resizeTransformState,
  transformDefaults,
  transformPresetsForShape,
} from "./model";

describe("dimension-generic transform scene model", () => {
  it("migrates the deployed 2D tuple state without losing basis semantics", () => {
    const migrated = migrateTransformState({
      matrix: [2, 0, 0, 3],
      vector: [1, 2],
      basisMode: "custom",
      basis: [
        [1, 0],
        [1, 1],
      ],
      showGrid: false,
      showCircle: false,
      showTrail: true,
    });

    expect(migrated).toMatchObject({
      version: 5,
      rows: 2,
      columns: 2,
      matrix: [
        [2, 0],
        [0, 3],
      ],
      vector: [1, 2],
      domainBasis: [
        [1, 1],
        [0, 1],
      ],
      codomainBasis: [
        [1, 1],
        [0, 1],
      ],
      showGrid: false,
      showSphere: false,
      showBasisImages: true,
      mode: "single",
    });
    expect(
      migrateTransformState({
        ...transformDefaults,
        version: 4,
        showBasisImages: false,
      }).showBasisImages,
    ).toBe(false);
    expect(migrateTransformState({ version: 6, rows: 3 })).toBe(
      transformDefaults,
    );
  });

  it("interprets rectangular coordinates with independent domain and codomain bases", () => {
    const state = {
      ...transformDefaults,
      rows: 3 as const,
      columns: 2 as const,
      matrix: [
        [1, 0],
        [0, 1],
        [1, 1],
      ],
      vector: [2, 3],
      basisMode: "custom" as const,
      domainBasis: [
        [2, 0],
        [0, 1],
      ],
      codomainBasis: [
        [1, 0, 0],
        [0, 2, 0],
        [0, 0, 1],
      ],
    };

    const derived = deriveTransform(state);

    expect(derived.valid).toBe(true);
    expect(derived.output).toEqual([1, 6, 4]);
    expect(derived.orientation).toBe("嵌入");
    expect(derived.determinant).toBeNull();
  });

  it("offers the inverse only for a square full-rank map", () => {
    const derived = deriveTransform({
      ...transformDefaults,
      matrix: [
        [2, 0],
        [0, 4],
      ],
      vector: [4, 8],
      direction: "inverse",
    });

    expect(derived.inverseAvailable).toBe(true);
    expect(derived.output).toEqual([2, 2]);

    const singular = deriveTransform({
      ...transformDefaults,
      matrix: [
        [1, 2],
        [2, 4],
      ],
      direction: "inverse",
    });
    expect(singular.inverseAvailable).toBe(false);
    expect(singular.valid).toBe(false);
    expect(singular.output).toBeNull();
  });

  it("applies an editable composition in right-to-left order", () => {
    const derived = deriveTransform({
      ...transformDefaults,
      mode: "composition",
      matrix: [
        [2, 0],
        [0, 1],
      ],
      secondMatrix: [
        [1, 1],
        [0, 1],
      ],
      vector: [1, 2],
    });

    expect(derived.compositionEnabled).toBe(true);
    expect(derived.stageOneMatrix).toEqual([
      [2, 0],
      [0, 1],
    ]);
    expect(derived.forwardMatrix).toEqual([
      [2, 1],
      [0, 1],
    ]);
    expect(derived.output).toEqual([4, 2]);

    const inverse = deriveTransform({
      ...transformDefaults,
      mode: "composition",
      matrix: [
        [2, 0],
        [0, 1],
      ],
      secondMatrix: [
        [1, 1],
        [0, 1],
      ],
      vector: [4, 2],
      direction: "inverse",
    });
    expect(inverse.output?.[0]).toBeCloseTo(1);
    expect(inverse.output?.[1]).toBeCloseTo(2);
    expect(inverse.stageOneMatrix?.[0]?.[0]).toBeCloseTo(1);
    expect(inverse.stageOneMatrix?.[0]?.[1]).toBeCloseTo(-1);
    expect(inverse.stageOneMatrix?.[1]?.[0]).toBeCloseTo(0);
    expect(inverse.stageOneMatrix?.[1]?.[1]).toBeCloseTo(1);
  });

  it("reports invariants for the standard map T rather than its coordinate matrix A", () => {
    const derived = deriveTransform({
      ...transformDefaults,
      matrix: [
        [1, 0],
        [0, 1],
      ],
      basisMode: "custom",
      domainBasis: [
        [2, 0],
        [0, 2],
      ],
      codomainBasis: [
        [1, 0],
        [0, 1],
      ],
    });

    expect(derived.forwardMatrix).toEqual([
      [0.5, 0],
      [0, 0.5],
    ]);
    expect(derived.determinant).toBeCloseTo(0.25);
    expect(derived.trace).toBeCloseTo(1);
  });

  it("rejects either invalid coordinate basis without substituting identity", () => {
    const badDomain = deriveTransform({
      ...transformDefaults,
      basisMode: "custom",
      domainBasis: [
        [1, 2],
        [2, 4],
      ],
    });
    expect(badDomain.valid).toBe(false);
    expect(badDomain.forwardMatrix).toBeNull();

    const badCodomain = deriveTransform({
      ...transformDefaults,
      basisMode: "custom",
      codomainBasis: [
        [1, 2],
        [2, 4],
      ],
    });
    expect(badCodomain.valid).toBe(false);
    expect(badCodomain.forwardMatrix).toBeNull();
  });

  it("converts both active matrices transactionally without changing the physical map", () => {
    const standard = {
      ...transformDefaults,
      mode: "composition" as const,
      matrix: [
        [2, 1],
        [0, 3],
      ],
      secondMatrix: [
        [1, -1],
        [2, 0],
      ],
      domainBasis: [
        [2, 0],
        [0, 1],
      ],
      codomainBasis: [
        [1, 1],
        [0, 2],
      ],
    };
    const expected = deriveTransform(standard);
    const custom = changeTransformBasisMode(standard, "custom");
    const customDerived = deriveTransform(custom);

    expect(custom.basisMode).toBe("custom");
    expect(customDerived.firstForwardMatrix?.[0]?.[0]).toBeCloseTo(
      expected.firstForwardMatrix?.[0]?.[0] ?? 0,
    );
    expect(customDerived.firstForwardMatrix?.[0]?.[1]).toBeCloseTo(
      expected.firstForwardMatrix?.[0]?.[1] ?? 0,
    );
    expect(customDerived.firstForwardMatrix?.[1]?.[0]).toBeCloseTo(
      expected.firstForwardMatrix?.[1]?.[0] ?? 0,
    );
    expect(customDerived.firstForwardMatrix?.[1]?.[1]).toBeCloseTo(
      expected.firstForwardMatrix?.[1]?.[1] ?? 0,
    );
    expect(customDerived.secondForwardMatrix?.[0]?.[0]).toBeCloseTo(
      expected.secondForwardMatrix?.[0]?.[0] ?? 0,
    );
    expect(customDerived.secondForwardMatrix?.[1]?.[0]).toBeCloseTo(
      expected.secondForwardMatrix?.[1]?.[0] ?? 0,
    );
    const roundTrip = changeTransformBasisMode(custom, "standard");
    expect(roundTrip.matrix[0]?.[0]).toBeCloseTo(2);
    expect(roundTrip.matrix[0]?.[1]).toBeCloseTo(1);
    expect(roundTrip.secondMatrix[1]?.[0]).toBeCloseTo(2);
  });

  it("persists shared same-space basis semantics and rejects invalid conversion atomically", () => {
    const shared = migrateTransformState({
      ...transformDefaults,
      version: 5,
      basisMode: "custom",
      sharedBasis: true,
      domainBasis: [
        [1, 1],
        [0, 1],
      ],
      codomainBasis: [
        [9, 0],
        [0, 9],
      ],
    });
    expect(shared.sharedBasis).toBe(true);
    expect(deriveTransform(shared).codomainBasisAnalysis.determinant).toBe(1);

    const independent = {
      ...shared,
      sharedBasis: false,
      codomainBasis: [
        [2, 0],
        [0, 1],
      ],
    };
    const beforeSharing = deriveTransform(independent);
    const afterSharing = deriveTransform(
      changeTransformSharedBasis(independent, true),
    );
    expect(afterSharing.firstForwardMatrix?.[0]?.[0]).toBeCloseTo(
      beforeSharing.firstForwardMatrix?.[0]?.[0] ?? 0,
    );
    expect(afterSharing.firstForwardMatrix?.[1]?.[1]).toBeCloseTo(
      beforeSharing.firstForwardMatrix?.[1]?.[1] ?? 0,
    );

    const invalid = {
      ...transformDefaults,
      domainBasis: [
        [1, 2],
        [2, 4],
      ],
    };
    expect(changeTransformBasisMode(invalid, "custom")).toBe(invalid);
    expect(resizeTransformState(shared, 2, 3).sharedBasis).toBe(false);
  });

  it("resizes map, vector, and bases while preserving overlapping values", () => {
    const resized = resizeTransformState(transformDefaults, 3, 3);
    expect(resized.matrix).toEqual([
      [1.35, 0.65, 0],
      [-0.25, 1.05, 0],
      [0, 0, 1],
    ]);
    expect(resized.vector).toEqual([1.5, 1, 0.5]);
    expect(resized.domainBasis[2]).toEqual([0, 0, 1]);
    expect(resized.secondMatrix[2]).toEqual([0, 0, 1]);
    expect(transformPresetsForShape(2, 3)).toHaveLength(6);
    expect(transformPresetsForShape(2, 3)[0]!.value).toHaveLength(2);
    expect(transformPresetsForShape(2, 3)[0]!.value[0]).toHaveLength(3);
  });
});
