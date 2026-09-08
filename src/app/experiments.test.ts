import { describe, expect, it } from "vitest";
import {
  decodeExperiment,
  encodeExperiment,
  transferExperiment,
  validateExperiment,
  type Experiment,
} from "./experiments";
import { transformDefaults } from "../scenes/transform/model";
import { operatorDefaults } from "../scenes/operator/model";
const example: Experiment = {
  format: "basis-lab-experiment",
  version: 1,
  scene: "transform",
  state: transformDefaults,
  name: "中文 · 剪切",
  view: { progress: 0.5, center: [2, -1], scale: 80 },
};
describe("portable experiments", () => {
  it("roundtrips Unicode, complete state and the current timeline", async () => {
    const decoded = await decodeExperiment(encodeExperiment(example));
    expect(decoded.name).toBe(example.name);
    expect(decoded.state).toEqual(transformDefaults);
    expect(decoded.view).toEqual(example.view);
  });
  it("rejects malformed shapes and future formats before restoration", async () => {
    await expect(
      validateExperiment({ ...example, version: 2 }),
    ).rejects.toThrow();
    await expect(
      validateExperiment({
        ...example,
        state: { ...transformDefaults, matrix: [[1]] },
      }),
    ).rejects.toThrow();
    await expect(
      validateExperiment({ ...example, view: { progress: 2 } }),
    ).rejects.toThrow();
  });
  it("carries the physical map rather than a custom-coordinate matrix", async () => {
    const transformed = await transferExperiment(
      {
        ...example,
        state: {
          ...transformDefaults,
          matrix: [
            [1, 0],
            [0, 2],
          ],
          basisMode: "custom",
          domainBasis: [
            [2, 0],
            [0, 1],
          ],
          codomainBasis: [
            [1, 0],
            [0, 3],
          ],
        },
      },
      "eigen",
    );
    expect((transformed.state as { matrix: number[][] }).matrix).toEqual([
      [0.5, 0],
      [0, 6],
    ]);
  });
  it("does not silently drop imaginary components", async () => {
    await expect(
      transferExperiment(
        {
          ...example,
          scene: "operator",
          state: {
            ...operatorDefaults,
            field: "C",
            matrix: [
              [
                { re: 1, im: 1 },
                { re: 0, im: 0 },
              ],
              [
                { re: 0, im: 0 },
                { re: 1, im: 0 },
              ],
            ],
          },
        },
        "eigen",
      ),
    ).rejects.toThrow(/虚部/);
  });
});
