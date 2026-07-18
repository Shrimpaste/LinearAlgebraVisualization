import { describe, expect, it } from "vitest";
import { addComplexVectors, multiplyComplexMatrices } from "../../math/nd";
import {
  applyOperatorPreset,
  changeOperatorField,
  deriveOperator,
  migrateOperatorState,
  operatorDefaults,
  operatorPresetsForDimension,
  resizeOperatorState,
} from "./model";

describe("operator scene model", () => {
  it("classifies real self-adjoint, normal rotation, and non-normal shear", () => {
    const presets = operatorPresetsForDimension(2);
    const symmetric = deriveOperator(
      applyOperatorPreset(operatorDefaults, presets[0]!),
    );
    expect(symmetric.classification).toMatchObject({
      normal: true,
      selfAdjoint: true,
    });
    expect(symmetric.spectral.success).toBe(true);

    const rotation = deriveOperator(
      applyOperatorPreset(operatorDefaults, presets[2]!),
    );
    expect(rotation.classification).toMatchObject({
      normal: true,
      selfAdjoint: false,
    });
    expect(rotation.spectral.success).toBe(true);

    const shear = deriveOperator(
      applyOperatorPreset(operatorDefaults, presets[4]!),
    );
    expect(shear.classification).toMatchObject({
      normal: false,
      selfAdjoint: false,
    });
    expect(shear.spectral).toMatchObject({
      success: false,
      reason: "not-normal",
    });
  });

  it("decomposes complex Hermitian and complex diagonal normal operators", () => {
    const presets = operatorPresetsForDimension(3);
    const hermitian = deriveOperator(
      applyOperatorPreset(operatorDefaults, presets[1]!),
    );
    expect(hermitian.classification.selfAdjoint).toBe(true);
    expect(hermitian.spectral.success).toBe(true);

    const diagonal = deriveOperator(
      applyOperatorPreset(operatorDefaults, presets[3]!),
    );
    expect(diagonal.classification).toMatchObject({
      normal: true,
      selfAdjoint: false,
      dimension: 3,
    });
    expect(diagonal.spectral.success).toBe(true);
    if (!diagonal.spectral.success) return;
    expect(diagonal.spectral.reconstructionResidual).toBeLessThan(1e-10);
    expect(diagonal.application?.residual).toBeLessThan(1e-10);
  });

  it("applies U* then Lambda then U without changing the physical result", () => {
    const derived = deriveOperator(operatorDefaults);
    expect(derived.spectral.success).toBe(true);
    expect(derived.application).not.toBeNull();
    expect(derived.application?.directOutput[0]!.re).toBeCloseTo(1.7, 12);
    expect(derived.application?.directOutput[1]!.re).toBeCloseTo(-0.35, 12);
    expect(derived.application?.residual).toBeLessThan(1e-12);
    const reconstructed =
      derived.application!.contributions.reduce(addComplexVectors);
    reconstructed.forEach((entry, index) => {
      expect(entry.re).toBeCloseTo(derived.application!.output[index]!.re, 12);
      expect(entry.im).toBeCloseTo(derived.application!.output[index]!.im, 12);
    });
  });

  it("groups repeated eigenvalues into basis-independent spectral projectors", () => {
    const repeated = deriveOperator(
      applyOperatorPreset(operatorDefaults, operatorPresetsForDimension(3)[5]!),
    );
    expect(repeated.spectral.success).toBe(true);
    expect(repeated.repeated).toBe(true);
    expect(repeated.eigenspaces.map((space) => space.indices.length)).toEqual([
      2, 1,
    ]);
    const projectionSum = repeated.eigenspaces
      .map((space) => space.projectedVector)
      .reduce(addComplexVectors);
    projectionSum.forEach((entry, index) => {
      expect(entry.re).toBeCloseTo(
        operatorPresetsForDimension(3)[5]!.vector[index]!.re,
      );
      expect(entry.im).toBeCloseTo(0);
    });
    const mappedSum = repeated.eigenspaces
      .map((space) => space.mappedProjection)
      .reduce(addComplexVectors);
    mappedSum.forEach((entry, index) => {
      expect(entry.re).toBeCloseTo(
        repeated.application!.directOutput[index]!.re,
        12,
      );
      expect(entry.im).toBeCloseTo(
        repeated.application!.directOutput[index]!.im,
        12,
      );
    });
    repeated.eigenspaces.forEach((space) => {
      const squared = multiplyComplexMatrices(space.projector, space.projector);
      squared.forEach((row, rowIndex) => {
        row.forEach((entry, columnIndex) => {
          expect(entry.re).toBeCloseTo(
            space.projector[rowIndex]![columnIndex]!.re,
            12,
          );
          expect(entry.im).toBeCloseTo(
            space.projector[rowIndex]![columnIndex]!.im,
            12,
          );
        });
      });
    });
  });

  it("preserves complex entries while resizing and clears them when changing to R", () => {
    const complexState = applyOperatorPreset(
      operatorDefaults,
      operatorPresetsForDimension(2)[1]!,
    );
    expect(complexState.matrix[0]![1]!.im).not.toBe(0);

    const resized = resizeOperatorState(complexState, 3);
    expect(resized.dimension).toBe(3);
    expect(resized.matrix).toHaveLength(3);
    expect(resized.matrix[2]![2]).toEqual({ re: 1, im: 0 });
    expect(resized.matrix[0]![1]).toEqual(complexState.matrix[0]![1]);
    expect(resized.matrix[0]![1]!.im).not.toBe(0);

    const real = changeOperatorField(complexState, "R");
    expect(real.field).toBe("R");
    expect(real.matrix.flat().every((entry) => entry.im === 0)).toBe(true);
    expect(real.vector.every((entry) => entry.im === 0)).toBe(true);
  });

  it("keeps a complex operator unchanged when selecting C again", () => {
    const complexState = applyOperatorPreset(
      operatorDefaults,
      operatorPresetsForDimension(3)[1]!,
    );
    const unchanged = changeOperatorField(complexState, "C");

    expect(unchanged).toBe(complexState);
    expect(unchanged.matrix).toBe(complexState.matrix);
    expect(unchanged.vector).toBe(complexState.vector);
    expect(unchanged.matrix.flat().some((entry) => entry.im !== 0)).toBe(true);
  });

  it("migrates number, nd-complex, and UI-complex JSON without stale imaginary data", () => {
    const real = migrateOperatorState({
      matrix: [2, 1, 1, 3],
      dimension: 2,
      field: "R",
    });
    expect(real).toMatchObject({
      version: 2,
      dimension: 2,
      field: "R",
      matrix: [
        [
          { re: 2, im: 0 },
          { re: 1, im: 0 },
        ],
        [
          { re: 1, im: 0 },
          { re: 3, im: 0 },
        ],
      ],
      vector: [
        { re: 1.25, im: 0 },
        { re: -0.8, im: 0 },
      ],
      lessonMode: "apply",
      focus: "all",
    });

    const complex = migrateOperatorState({
      version: 1,
      field: "C",
      dimension: 2,
      matrix: [
        [
          { re: 2, im: 0 },
          { real: 0, imag: 1 },
        ],
        [
          { real: 0, imag: -1 },
          { re: 2, im: 0 },
        ],
      ],
    });
    expect(complex.matrix[0]![1]).toEqual({ re: 0, im: 1 });
    expect(deriveOperator(complex).classification.selfAdjoint).toBe(true);

    const hiddenImaginary = migrateOperatorState({
      field: "R",
      dimension: 1,
      matrix: [[{ re: 4, im: 9 }]],
    });
    expect(hiddenImaginary.matrix[0]![0]).toEqual({ re: 4, im: 0 });
    expect(hiddenImaginary.vector[0]).toEqual({ re: 1.25, im: 0 });
    expect(migrateOperatorState({ version: 3, field: "C" })).toBe(
      operatorDefaults,
    );
  });

  it("persists teaching mode and bounds component focus during migration", () => {
    const migrated = migrateOperatorState({
      version: 2,
      field: "C",
      dimension: 2,
      matrix: [
        [1, 0],
        [0, 2],
      ],
      vector: [
        { real: 1, imag: 2 },
        { re: -3, im: 0.5 },
      ],
      lessonMode: "structure",
      focus: "3",
    });
    expect(migrated).toMatchObject({
      version: 2,
      lessonMode: "structure",
      focus: "all",
      vector: [
        { re: 1, im: 2 },
        { re: -3, im: 0.5 },
      ],
    });
  });

  it("distinguishes a diagonalizable non-normal example from Jordan shear", () => {
    const presets = operatorPresetsForDimension(3);
    const shear = deriveOperator(
      applyOperatorPreset(operatorDefaults, presets[4]!),
    );
    const diagonalizable = deriveOperator(
      applyOperatorPreset(operatorDefaults, presets[6]!),
    );
    expect(shear.classification.normal).toBe(false);
    expect(diagonalizable.classification.normal).toBe(false);
    expect(
      diagonalizable.commutator.flat().some((entry) => entry.re !== 0),
    ).toBe(true);
  });
});
