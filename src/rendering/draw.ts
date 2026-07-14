import type { Mat2, Vec2 } from "../math";
import type { Viewport2D } from "../engine";

export interface CanvasPalette {
  background: string;
  gridMinor: string;
  gridMajor: string;
  axis: string;
  text: string;
  textSoft: string;
  neutral: string;
  neutralFill: string;
  cyan: string;
  cyanFill: string;
  red: string;
  redFill: string;
  yellow: string;
  yellowFill: string;
  blue: string;
  blueFill: string;
}

const lightPalette: CanvasPalette = {
  background: "#e9eeeb",
  gridMinor: "#dce3df",
  gridMajor: "#cbd4cf",
  axis: "#7d8983",
  text: "#1c211f",
  textSoft: "#59645f",
  neutral: "#8a9690",
  neutralFill: "rgba(94, 106, 100, 0.08)",
  cyan: "#06757a",
  cyanFill: "rgba(7, 139, 145, 0.13)",
  red: "#bd3b28",
  redFill: "rgba(223, 77, 52, 0.15)",
  yellow: "#856000",
  yellowFill: "rgba(200, 141, 18, 0.15)",
  blue: "#205dae",
  blueFill: "rgba(42, 110, 210, 0.13)",
};

const darkPalette: CanvasPalette = {
  background: "#0c100f",
  gridMinor: "#18201d",
  gridMajor: "#26312d",
  axis: "#647069",
  text: "#edf2ef",
  textSoft: "#9ca8a2",
  neutral: "#718079",
  neutralFill: "rgba(180, 194, 186, 0.07)",
  cyan: "#35bdc0",
  cyanFill: "rgba(53, 189, 192, 0.13)",
  red: "#ff755e",
  redFill: "rgba(255, 117, 94, 0.14)",
  yellow: "#edbc51",
  yellowFill: "rgba(237, 188, 81, 0.14)",
  blue: "#67a3f3",
  blueFill: "rgba(103, 163, 243, 0.14)",
};

export function getCanvasPalette(theme: "light" | "dark"): CanvasPalette {
  return theme === "dark" ? darkPalette : lightPalette;
}

export function applyMat(matrix: Mat2, point: Vec2): Vec2 {
  return [
    matrix[0] * point[0] + matrix[1] * point[1],
    matrix[2] * point[0] + matrix[3] * point[1],
  ];
}

export function addVec(left: Vec2, right: Vec2): Vec2 {
  return [left[0] + right[0], left[1] + right[1]];
}

export function scaleVec(vector: Vec2, scalar: number): Vec2 {
  return [vector[0] * scalar, vector[1] * scalar];
}

export function lerpVec(from: Vec2, to: Vec2, progress: number): Vec2 {
  return [
    from[0] + (to[0] - from[0]) * progress,
    from[1] + (to[1] - from[1]) * progress,
  ];
}

export function drawGrid(
  context: CanvasRenderingContext2D,
  viewport: Viewport2D,
  palette: CanvasPalette,
) {
  const topLeft = viewport.canvasToWorld([0, 0]);
  const bottomRight = viewport.canvasToWorld([viewport.width, viewport.height]);
  const visibleMinX = Math.min(topLeft[0], bottomRight[0]);
  const visibleMaxX = Math.max(topLeft[0], bottomRight[0]);
  const visibleMinY = Math.min(topLeft[1], bottomRight[1]);
  const visibleMaxY = Math.max(topLeft[1], bottomRight[1]);
  const minorStep = viewport.scale >= 120 ? 0.5 : viewport.scale < 34 ? 2 : 1;
  const majorStep = minorStep * 5;

  context.save();
  context.lineWidth = 1;

  const drawLines = (step: number, color: string) => {
    context.beginPath();
    context.strokeStyle = color;
    const xStart = Math.floor(visibleMinX / step) * step;
    for (let x = xStart; x <= visibleMaxX + step; x += step) {
      const canvasX = viewport.worldToCanvas([x, 0])[0];
      context.moveTo(Math.round(canvasX) + 0.5, 0);
      context.lineTo(Math.round(canvasX) + 0.5, viewport.height);
    }
    const yStart = Math.floor(visibleMinY / step) * step;
    for (let y = yStart; y <= visibleMaxY + step; y += step) {
      const canvasY = viewport.worldToCanvas([0, y])[1];
      context.moveTo(0, Math.round(canvasY) + 0.5);
      context.lineTo(viewport.width, Math.round(canvasY) + 0.5);
    }
    context.stroke();
  };

  drawLines(minorStep, palette.gridMinor);
  drawLines(majorStep, palette.gridMajor);
  context.restore();
}

export function drawAxes(
  context: CanvasRenderingContext2D,
  viewport: Viewport2D,
  palette: CanvasPalette,
  labels = true,
) {
  const origin = viewport.worldToCanvas([0, 0]);
  context.save();
  context.strokeStyle = palette.axis;
  context.lineWidth = 1.25;
  context.beginPath();
  context.moveTo(0, origin[1]);
  context.lineTo(viewport.width, origin[1]);
  context.moveTo(origin[0], 0);
  context.lineTo(origin[0], viewport.height);
  context.stroke();

  if (labels) {
    context.fillStyle = palette.textSoft;
    context.font = '10px "IBM Plex Mono", monospace';
    context.textBaseline = "top";
    context.fillText("x", viewport.width - 17, origin[1] + 8);
    context.fillText("y", origin[0] + 8, 10);
  }
  context.restore();
}

export interface LineOptions {
  color: string;
  width?: number;
  alpha?: number;
  dash?: readonly number[];
}

export function drawLine(
  context: CanvasRenderingContext2D,
  viewport: Viewport2D,
  from: Vec2,
  to: Vec2,
  options: LineOptions,
) {
  const start = viewport.worldToCanvas(from);
  const end = viewport.worldToCanvas(to);
  context.save();
  context.globalAlpha = options.alpha ?? 1;
  context.strokeStyle = options.color;
  context.lineWidth = options.width ?? 1.5;
  context.setLineDash(options.dash ? [...options.dash] : []);
  context.beginPath();
  context.moveTo(start[0], start[1]);
  context.lineTo(end[0], end[1]);
  context.stroke();
  context.restore();
}

export interface VectorOptions extends LineOptions {
  label?: string;
  headSize?: number;
  origin?: Vec2;
  labelOffset?: Vec2;
}

export function drawVector(
  context: CanvasRenderingContext2D,
  viewport: Viewport2D,
  vector: Vec2,
  options: VectorOptions,
) {
  const origin = options.origin ?? [0, 0];
  const endWorld = addVec(origin, vector);
  const start = viewport.worldToCanvas(origin);
  const end = viewport.worldToCanvas(endWorld);
  const angle = Math.atan2(end[1] - start[1], end[0] - start[0]);
  const headSize = options.headSize ?? 9;
  const length = Math.hypot(end[0] - start[0], end[1] - start[1]);

  context.save();
  context.globalAlpha = options.alpha ?? 1;
  context.strokeStyle = options.color;
  context.fillStyle = options.color;
  context.lineWidth = options.width ?? 2.3;
  context.setLineDash(options.dash ? [...options.dash] : []);
  context.lineCap = "round";

  context.beginPath();
  context.moveTo(start[0], start[1]);
  context.lineTo(end[0], end[1]);
  context.stroke();

  if (length > headSize * 0.75) {
    context.setLineDash([]);
    context.beginPath();
    context.moveTo(end[0], end[1]);
    context.lineTo(
      end[0] - headSize * Math.cos(angle - Math.PI / 6),
      end[1] - headSize * Math.sin(angle - Math.PI / 6),
    );
    context.lineTo(
      end[0] - headSize * Math.cos(angle + Math.PI / 6),
      end[1] - headSize * Math.sin(angle + Math.PI / 6),
    );
    context.closePath();
    context.fill();
  }

  if (options.label) {
    const offset = options.labelOffset ?? [8, -14];
    context.font = '500 11px "IBM Plex Mono", monospace';
    context.fillText(options.label, end[0] + offset[0], end[1] + offset[1]);
  }
  context.restore();
}

export interface PolygonOptions {
  fill?: string;
  stroke?: string;
  width?: number;
  alpha?: number;
  dash?: readonly number[];
}

export function drawPolygon(
  context: CanvasRenderingContext2D,
  viewport: Viewport2D,
  points: readonly Vec2[],
  options: PolygonOptions,
) {
  if (points.length < 2) return;
  const first = viewport.worldToCanvas(points[0]!);
  context.save();
  context.globalAlpha = options.alpha ?? 1;
  context.beginPath();
  context.moveTo(first[0], first[1]);
  for (const point of points.slice(1)) {
    const canvasPoint = viewport.worldToCanvas(point);
    context.lineTo(canvasPoint[0], canvasPoint[1]);
  }
  context.closePath();
  if (options.fill) {
    context.fillStyle = options.fill;
    context.fill();
  }
  if (options.stroke) {
    context.strokeStyle = options.stroke;
    context.lineWidth = options.width ?? 1.5;
    context.setLineDash(options.dash ? [...options.dash] : []);
    context.stroke();
  }
  context.restore();
}

export interface CircleOptions {
  stroke: string;
  fill?: string;
  width?: number;
  alpha?: number;
  dash?: readonly number[];
}

export function drawCircle(
  context: CanvasRenderingContext2D,
  viewport: Viewport2D,
  center: Vec2,
  radius: number,
  options: CircleOptions,
) {
  const canvasCenter = viewport.worldToCanvas(center);
  context.save();
  context.globalAlpha = options.alpha ?? 1;
  context.strokeStyle = options.stroke;
  context.fillStyle = options.fill ?? "transparent";
  context.lineWidth = options.width ?? 1.5;
  context.setLineDash(options.dash ? [...options.dash] : []);
  context.beginPath();
  context.arc(
    canvasCenter[0],
    canvasCenter[1],
    radius * viewport.scale,
    0,
    Math.PI * 2,
  );
  if (options.fill) context.fill();
  context.stroke();
  context.restore();
}

export function drawPoint(
  context: CanvasRenderingContext2D,
  viewport: Viewport2D,
  point: Vec2,
  color: string,
  radius = 4,
  ring = true,
  ringColor = color,
) {
  const canvasPoint = viewport.worldToCanvas(point);
  context.save();
  context.fillStyle = color;
  context.beginPath();
  context.arc(canvasPoint[0], canvasPoint[1], radius, 0, Math.PI * 2);
  context.fill();
  if (ring) {
    context.strokeStyle = ringColor;
    context.lineWidth = 2;
    context.stroke();
  }
  context.restore();
}

export function drawLabel(
  context: CanvasRenderingContext2D,
  viewport: Viewport2D,
  point: Vec2,
  text: string,
  color: string,
  offset: Vec2 = [8, -12],
) {
  const canvasPoint = viewport.worldToCanvas(point);
  context.save();
  context.fillStyle = color;
  context.font = '500 10px "IBM Plex Mono", monospace';
  context.fillText(
    text,
    canvasPoint[0] + offset[0],
    canvasPoint[1] + offset[1],
  );
  context.restore();
}

export function drawInfiniteLine(
  context: CanvasRenderingContext2D,
  viewport: Viewport2D,
  direction: Vec2,
  options: LineOptions,
) {
  const norm = Math.hypot(direction[0], direction[1]);
  if (norm < 1e-9) return;
  const viewportRadius =
    (Math.max(viewport.width, viewport.height) / viewport.scale) * 1.5;
  const cameraDistance = Math.hypot(viewport.center[0], viewport.center[1]);
  const extent = viewportRadius + cameraDistance;
  const unit: Vec2 = [direction[0] / norm, direction[1] / norm];
  drawLine(
    context,
    viewport,
    scaleVec(unit, -extent),
    scaleVec(unit, extent),
    options,
  );
}

export function drawArc(
  context: CanvasRenderingContext2D,
  viewport: Viewport2D,
  radius: number,
  fromAngle: number,
  toAngle: number,
  color: string,
  label?: string,
) {
  const origin = viewport.worldToCanvas([0, 0]);
  const fullTurn = Math.PI * 2;
  const delta =
    ((((toAngle - fromAngle + Math.PI) % fullTurn) + fullTurn) % fullTurn) -
    Math.PI;
  const normalizedEnd = fromAngle + delta;
  context.save();
  context.strokeStyle = color;
  context.lineWidth = 1.5;
  context.beginPath();
  context.arc(
    origin[0],
    origin[1],
    radius * viewport.scale,
    -fromAngle,
    -normalizedEnd,
    delta > 0,
  );
  context.stroke();
  if (label) {
    const middle = fromAngle + delta / 2;
    const point: Vec2 = [Math.cos(middle) * radius, Math.sin(middle) * radius];
    drawLabel(context, viewport, point, label, color, [5, -5]);
  }
  context.restore();
}

export function drawTransformedGrid(
  context: CanvasRenderingContext2D,
  viewport: Viewport2D,
  matrix: Mat2,
  color: string,
  extent = 6,
  step = 1,
  alpha = 0.75,
) {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = 1;
  context.globalAlpha = alpha;
  context.beginPath();
  for (let value = -extent; value <= extent; value += step) {
    const horizontalStart = viewport.worldToCanvas(
      applyMat(matrix, [-extent, value]),
    );
    const horizontalEnd = viewport.worldToCanvas(
      applyMat(matrix, [extent, value]),
    );
    context.moveTo(horizontalStart[0], horizontalStart[1]);
    context.lineTo(horizontalEnd[0], horizontalEnd[1]);

    const verticalStart = viewport.worldToCanvas(
      applyMat(matrix, [value, -extent]),
    );
    const verticalEnd = viewport.worldToCanvas(
      applyMat(matrix, [value, extent]),
    );
    context.moveTo(verticalStart[0], verticalStart[1]);
    context.lineTo(verticalEnd[0], verticalEnd[1]);
  }
  context.stroke();
  context.restore();
}

export function drawTransformedCircle(
  context: CanvasRenderingContext2D,
  viewport: Viewport2D,
  matrix: Mat2,
  color: string,
  fill?: string,
  radius = 1,
) {
  const points: Vec2[] = [];
  const segments = 96;
  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    points.push(
      applyMat(matrix, [Math.cos(angle) * radius, Math.sin(angle) * radius]),
    );
  }
  drawPolygon(context, viewport, points, { fill, stroke: color, width: 2 });
}

export function drawRightAngle(
  context: CanvasRenderingContext2D,
  viewport: Viewport2D,
  corner: Vec2,
  along: Vec2,
  perpendicular: Vec2,
  color: string,
) {
  const size = 0.18;
  const alongNorm = Math.hypot(along[0], along[1]) || 1;
  const perpNorm = Math.hypot(perpendicular[0], perpendicular[1]) || 1;
  const a = scaleVec(along, size / alongNorm);
  const p = scaleVec(perpendicular, size / perpNorm);
  drawLine(context, viewport, addVec(corner, a), addVec(addVec(corner, a), p), {
    color,
    width: 1,
  });
  drawLine(context, viewport, addVec(addVec(corner, a), p), addVec(corner, p), {
    color,
    width: 1,
  });
}
