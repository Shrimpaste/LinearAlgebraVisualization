import type { ViewportSnapshot } from "../engine";
import type { Vec2 } from "../math";

export function isWorldPointNearCanvas(
  worldPoint: Vec2,
  canvasPoint: Vec2,
  viewport: ViewportSnapshot,
  radius = 16,
) {
  const projectedX =
    viewport.width / 2 + (worldPoint[0] - viewport.center[0]) * viewport.scale;
  const projectedY =
    viewport.height / 2 - (worldPoint[1] - viewport.center[1]) * viewport.scale;
  return (
    Math.hypot(canvasPoint[0] - projectedX, canvasPoint[1] - projectedY) <=
    radius
  );
}
