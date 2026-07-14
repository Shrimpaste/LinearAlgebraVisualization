import { describe, expect, it } from "vitest";
import { resizeCanvas } from "./canvas";

describe("resizeCanvas", () => {
  it("updates backing pixels without locking the CSS layout size", () => {
    const canvas = document.createElement("canvas");
    canvas.style.width = "100%";
    canvas.style.height = "100%";

    const size = resizeCanvas(canvas, 390, 380, { devicePixelRatio: 2 });

    expect(size).toMatchObject({
      width: 390,
      height: 380,
      dpr: 2,
      pixelWidth: 780,
      pixelHeight: 760,
    });
    expect(canvas.width).toBe(780);
    expect(canvas.height).toBe(760);
    expect(canvas.style.width).toBe("100%");
    expect(canvas.style.height).toBe("100%");
  });
});
