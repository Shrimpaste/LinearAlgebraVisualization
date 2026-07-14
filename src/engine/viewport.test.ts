import { describe, expect, it } from "vitest";
import { Viewport2D } from "./viewport";

describe("Viewport2D", () => {
  it("converts between mathematical world space and canvas space", () => {
    const viewport = new Viewport2D({ center: [1, -2], scale: 50 }).resize(
      800,
      600,
    );

    expect(viewport.worldToCanvas([1, -2])).toEqual([400, 300]);
    expect(viewport.worldToCanvas([3, 1])).toEqual([500, 150]);
    expect(viewport.canvasToWorld([500, 150])).toEqual([3, 1]);
  });

  it("pans in screen space and preserves a zoom anchor", () => {
    const viewport = new Viewport2D({ scale: 40 }).resize(640, 480);
    viewport.panByPixels(80, -40);
    expect(viewport.center).toEqual([-2, -1]);

    const anchor = [120, 90] as const;
    const worldBefore = viewport.canvasToWorld(anchor);
    viewport.zoomAt(1.75, anchor);
    const worldAfter = viewport.canvasToWorld(anchor);

    expect(worldAfter[0]).toBeCloseTo(worldBefore[0], 10);
    expect(worldAfter[1]).toBeCloseTo(worldBefore[1], 10);
  });

  it("clamps zoom and resets to the configured camera", () => {
    const viewport = new Viewport2D({
      center: [2, 3],
      scale: 60,
      minScale: 20,
      maxScale: 100,
    }).resize(400, 300);

    viewport.zoomAt(100, [200, 150]);
    expect(viewport.scale).toBe(100);
    viewport.panByPixels(50, 50).reset();
    expect(viewport.center).toEqual([2, 3]);
    expect(viewport.scale).toBe(60);
  });
});
