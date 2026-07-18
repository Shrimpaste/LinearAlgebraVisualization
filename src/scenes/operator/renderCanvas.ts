import type { ThemeMode } from "../../app/types";
import type { VisualizationRenderFrame } from "../../components/VisualizationStage";
import {
  absComplex,
  type ComplexScalar,
  type ComplexVector,
} from "../../math/nd";
import { getCanvasPalette, type CanvasPalette } from "../../rendering";
import { formatComplex } from "../../utils/formatLinear";
import type { OperatorState } from "./model";
import { deriveOperator } from "./model";

type OperatorDerived = ReturnType<typeof deriveOperator>;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

function drawGrid(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  palette: CanvasPalette,
) {
  context.save();
  context.strokeStyle = palette.gridMinor;
  context.lineWidth = 1;
  for (let x = 0; x <= width; x += 48) {
    context.beginPath();
    context.moveTo(x + 0.5, 0);
    context.lineTo(x + 0.5, height);
    context.stroke();
  }
  for (let y = 0; y <= height; y += 48) {
    context.beginPath();
    context.moveTo(0, y + 0.5);
    context.lineTo(width, y + 0.5);
    context.stroke();
  }
  context.restore();
}

function drawArrow(
  context: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  color: string,
  alpha = 1,
  lineWidth = 2,
) {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  context.save();
  context.globalAlpha = alpha;
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = lineWidth;
  context.beginPath();
  context.moveTo(fromX, fromY);
  context.lineTo(toX, toY);
  context.stroke();
  context.beginPath();
  context.moveTo(toX, toY);
  context.lineTo(
    toX - 7 * Math.cos(angle - Math.PI / 6),
    toY - 7 * Math.sin(angle - Math.PI / 6),
  );
  context.lineTo(
    toX - 7 * Math.cos(angle + Math.PI / 6),
    toY - 7 * Math.sin(angle + Math.PI / 6),
  );
  context.closePath();
  context.fill();
  context.restore();
}

function drawConnector(
  context: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  color: string,
  progress: number,
  alpha = 1,
) {
  const amount = clamp01(progress);
  context.save();
  context.globalAlpha = alpha;
  context.strokeStyle = color;
  context.lineWidth = 1.4;
  context.setLineDash([5, 4]);
  context.beginPath();
  context.moveTo(fromX, fromY);
  context.lineTo(
    fromX + (toX - fromX) * amount,
    fromY + (toY - fromY) * amount,
  );
  context.stroke();
  context.restore();
}

function componentColors(palette: CanvasPalette) {
  return [palette.cyan, palette.yellow, palette.blue] as const;
}

function focusAlpha(state: OperatorState, index: number) {
  return state.focus === "all" || state.focus === String(index + 1) ? 1 : 0.14;
}

function isRealVector(vector: ComplexVector) {
  return vector.every((entry) => Math.abs(entry.im) <= 1e-9);
}

function drawVectorGlyph(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  vector: ComplexVector,
  color: string,
  palette: CanvasPalette,
  alpha: number,
  scale = 22,
) {
  context.save();
  context.globalAlpha = alpha;
  if (vector.length <= 2 && isRealVector(vector)) {
    const dx = (vector[0]?.re ?? 0) * scale;
    const dy = -(vector[1]?.re ?? 0) * scale;
    drawArrow(context, x, y, x + dx, y + dy, color, 1, 2.2);
  } else {
    const colors = componentColors(palette);
    vector.forEach((entry, index) => {
      const magnitude = Math.min(1.4, absComplex(entry));
      const angle = Math.atan2(entry.im, entry.re);
      const radius = 6 + magnitude * Math.min(17, scale * 0.75);
      const entryColor = colors[index] ?? color;
      context.strokeStyle = entryColor;
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(
        x + Math.cos(angle) * radius,
        y - Math.sin(angle) * radius,
      );
      context.stroke();
      context.fillStyle = entryColor;
      context.beginPath();
      context.arc(
        x + Math.cos(angle) * radius,
        y - Math.sin(angle) * radius,
        2.5,
        0,
        Math.PI * 2,
      );
      context.fill();
    });
  }
  context.fillStyle = color;
  context.beginPath();
  context.arc(x, y, 3.5, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawScalarGlyph(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  value: ComplexScalar,
  color: string,
  alpha: number,
) {
  const magnitude = absComplex(value);
  const angle = Math.atan2(value.im, value.re);
  const radius = 7 + Math.min(18, magnitude * 6);
  context.save();
  context.globalAlpha = alpha;
  context.strokeStyle = color;
  context.lineWidth = 1;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.stroke();
  drawArrow(
    context,
    x,
    y,
    x + Math.cos(angle) * radius,
    y - Math.sin(angle) * radius,
    color,
    1,
    2,
  );
  context.restore();
}

function vectorText(vector: ComplexVector) {
  return `[${vector.map(formatComplex).join(", ")}]`;
}

function fitText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxSize = 11,
  minSize = 8,
) {
  let size = maxSize;
  while (size > minSize) {
    context.font = `${size}px "IBM Plex Mono", monospace`;
    if (context.measureText(text).width <= maxWidth) break;
    size -= 1;
  }
  return size;
}

function drawStageHeading(
  context: CanvasRenderingContext2D,
  text: string,
  width: number,
  palette: CanvasPalette,
) {
  context.fillStyle = palette.textSoft;
  context.font = '10px "IBM Plex Mono", monospace';
  context.textAlign = "left";
  context.fillText(text, 16, 22);
  context.strokeStyle = palette.gridMajor;
  context.beginPath();
  context.moveTo(16, 32.5);
  context.lineTo(width - 16, 32.5);
  context.stroke();
}

function renderFailure(
  frame: VisualizationRenderFrame,
  state: OperatorState,
  derived: OperatorDerived,
  palette: CanvasPalette,
) {
  const { ctx, width, height } = frame;
  const isNonNormal = !derived.classification.normal;
  if (!isNonNormal) {
    ctx.textAlign = "center";
    ctx.fillStyle = palette.yellow;
    ctx.font = '600 18px "IBM Plex Mono", monospace';
    ctx.fillText("A*A = AA*", width / 2, height / 2 - 20);
    ctx.fillStyle = palette.text;
    ctx.font = '500 12px "IBM Plex Sans", sans-serif';
    ctx.fillText(
      "normal 性成立，但数值谱分解未通过验证",
      width / 2,
      height / 2 + 12,
    );
    return;
  }

  drawStageHeading(ctx, "NORMALITY DIAGNOSTIC · 交换子证据", width, palette);
  const matrix = derived.commutator;
  const dimension = state.dimension;
  const maxMagnitude = Math.max(1e-12, ...matrix.flat().map(absComplex));
  const cell = Math.min(
    58,
    (width - 80) / dimension,
    (height - 150) / dimension,
  );
  const gridWidth = cell * dimension;
  const startX = width / 2 - gridWidth / 2;
  const startY = Math.max(86, height / 2 - gridWidth / 2 + 8);
  matrix.forEach((row, rowIndex) => {
    row.forEach((entry, columnIndex) => {
      const magnitude = absComplex(entry);
      const intensity = 0.08 + 0.52 * (magnitude / maxMagnitude);
      ctx.save();
      ctx.globalAlpha = intensity;
      ctx.fillStyle = entry.re >= 0 ? palette.red : palette.cyan;
      ctx.fillRect(
        startX + columnIndex * cell + 1,
        startY + rowIndex * cell + 1,
        cell - 2,
        cell - 2,
      );
      ctx.restore();
      ctx.strokeStyle = palette.gridMajor;
      ctx.strokeRect(
        startX + columnIndex * cell + 0.5,
        startY + rowIndex * cell + 0.5,
        cell - 1,
        cell - 1,
      );
      ctx.fillStyle = palette.text;
      ctx.textAlign = "center";
      const text = formatComplex(entry);
      fitText(ctx, text, cell - 8, 10, 7);
      ctx.fillText(
        text,
        startX + (columnIndex + 0.5) * cell,
        startY + (rowIndex + 0.57) * cell,
      );
    });
  });

  ctx.textAlign = "center";
  ctx.fillStyle = palette.red;
  ctx.font = '600 17px "IBM Plex Mono", monospace';
  ctx.fillText("A*A - AA* ≠ 0", width / 2, 62);
  ctx.fillStyle = palette.text;
  ctx.font = '500 12px "IBM Plex Sans", sans-serif';
  ctx.fillText(
    "不能酉对角化；这不等于没有特征值或不能一般对角化",
    width / 2,
    Math.min(height - 48, startY + gridWidth + 34),
  );
  ctx.fillStyle = palette.textSoft;
  ctx.font = '10px "IBM Plex Mono", monospace';
  ctx.fillText(
    `normal residual ${derived.classification.normalResidual.toExponential(2)}`,
    width / 2,
    Math.min(height - 24, startY + gridWidth + 55),
  );
}

function renderSpectrumPlot(
  context: CanvasRenderingContext2D,
  width: number,
  state: OperatorState,
  derived: Extract<OperatorDerived, { application: object }>,
  palette: CanvasPalette,
) {
  const spectral = derived.spectral;
  if (!spectral.success) return;
  const colors = componentColors(palette);
  const values = spectral.eigenvalues;
  const realLine = values.every((value) => Math.abs(value.im) <= 1e-9);
  const centerY = 108;
  const left = Math.max(54, width * 0.12);
  const right = Math.min(width - 54, width * 0.88);
  context.save();
  context.strokeStyle = palette.gridMajor;
  context.fillStyle = palette.textSoft;
  context.lineWidth = 1;
  context.font = '9px "IBM Plex Mono", monospace';
  if (realLine) {
    const realValues = values.map((value) => value.re);
    const min = Math.min(0, ...realValues);
    const max = Math.max(0, ...realValues);
    const padding = Math.max(0.5, (max - min) * 0.15);
    const low = min - padding;
    const high = max + padding;
    const mapX = (value: number) =>
      left + ((value - low) / (high - low)) * (right - left);
    drawArrow(context, left, centerY, right, centerY, palette.textSoft, 0.7, 1);
    context.textAlign = "center";
    context.fillText("实谱轴", width / 2, centerY - 25);
    values.forEach((value, index) => {
      const x = mapX(value.re);
      const alpha = focusAlpha(state, index);
      context.globalAlpha = alpha;
      context.fillStyle = colors[index]!;
      context.beginPath();
      context.arc(x, centerY, 6, 0, Math.PI * 2);
      context.fill();
      context.fillText(
        `λ${index + 1}=${formatComplex(value)}`,
        x,
        centerY + 25,
      );
    });
  } else {
    const extent = Math.max(1, ...values.map(absComplex));
    const radius = Math.min((right - left) / 2, 62);
    const centerX = width / 2;
    drawArrow(
      context,
      centerX - radius,
      centerY,
      centerX + radius,
      centerY,
      palette.textSoft,
      0.7,
      1,
    );
    drawArrow(
      context,
      centerX,
      centerY + 58,
      centerX,
      centerY - 58,
      palette.textSoft,
      0.7,
      1,
    );
    context.textAlign = "left";
    context.fillText("Re", centerX + radius - 16, centerY - 7);
    context.fillText("Im", centerX + 7, centerY - 48);
    values.forEach((value, index) => {
      const x = centerX + (value.re / extent) * radius;
      const y = centerY - (value.im / extent) * 52;
      const alpha = focusAlpha(state, index);
      context.globalAlpha = alpha;
      context.fillStyle = colors[index]!;
      context.beginPath();
      context.arc(x, y, 6, 0, Math.PI * 2);
      context.fill();
      context.fillText(`λ${index + 1}`, x + 8, y - 7);
    });
  }
  context.restore();
}

function renderStructure(
  frame: VisualizationRenderFrame,
  state: OperatorState,
  derived: Extract<OperatorDerived, { application: object }>,
  palette: CanvasPalette,
) {
  const { ctx, width, height, easedProgress } = frame;
  const spectral = derived.spectral;
  if (!spectral.success) return;
  drawStageHeading(ctx, "SPECTRAL STRUCTURE · Auᵢ = λᵢuᵢ", width, palette);
  const spectrumPhase = clamp01(easedProgress * 3);
  const basisPhase = clamp01(easedProgress * 3 - 1);
  const projectorPhase = clamp01(easedProgress * 3 - 2);
  ctx.save();
  ctx.globalAlpha = 0.2 + 0.8 * spectrumPhase;
  renderSpectrumPlot(ctx, width, state, derived, palette);
  ctx.restore();

  const colors = componentColors(palette);
  const top = 178;
  const bottom = Math.max(top, height - 64);
  const gap =
    state.dimension === 1 ? 0 : (bottom - top) / (state.dimension - 1);
  spectral.eigenvalues.forEach((eigenvalue, index) => {
    const y = state.dimension === 1 ? (top + bottom) / 2 : top + gap * index;
    const vector = spectral.U.map((row) => row[index]!);
    const alpha = focusAlpha(state, index) * (0.15 + 0.85 * basisPhase);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = colors[index]!;
    ctx.textAlign = "left";
    ctx.font = '600 11px "IBM Plex Mono", monospace';
    ctx.fillText(`u${index + 1}`, 26, y + 4);
    drawVectorGlyph(ctx, 88, y, vector, colors[index]!, palette, 1, 18);
    ctx.fillStyle = palette.text;
    ctx.font = '10px "IBM Plex Mono", monospace';
    const equation = `A u${index + 1} = (${formatComplex(eigenvalue)}) u${index + 1}`;
    fitText(ctx, equation, width - 180, 11, 8);
    ctx.fillText(equation, 132, y + 4);
    ctx.restore();
  });

  ctx.save();
  ctx.globalAlpha = 0.15 + 0.85 * projectorPhase;
  ctx.fillStyle = derived.repeated ? palette.yellow : palette.textSoft;
  ctx.textAlign = "left";
  ctx.font = '10px "IBM Plex Mono", monospace';
  const footer = derived.repeated
    ? `A = Σ λPλ · ${derived.eigenspaces.map((space) => `dim E(${formatComplex(space.eigenvalue)})=${space.indices.length}`).join(" · ")}`
    : "A = Σ λᵢ uᵢuᵢ* · 每个谱投影均由正交特征方向给出";
  fitText(ctx, footer, width - 32, 10, 8);
  ctx.fillText(footer, 16, height - 18);
  ctx.restore();
}

function renderCompactApplication(
  frame: VisualizationRenderFrame,
  state: OperatorState,
  derived: Extract<OperatorDerived, { application: object }>,
  palette: CanvasPalette,
) {
  const { ctx, width, height, easedProgress } = frame;
  const application = derived.application;
  const phases = [
    1,
    clamp01(easedProgress * 4),
    clamp01(easedProgress * 4 - 1),
    clamp01(easedProgress * 4 - 2),
    clamp01(easedProgress * 4 - 3),
  ];
  const rows = [
    { label: "输入", formula: "x", value: state.vector },
    { label: "换基", formula: "c = U*x", value: application.coordinates },
    {
      label: "独立作用",
      formula: "d = Λc",
      value: application.weightedCoordinates,
    },
    { label: "重构", formula: "Ud = Σ dᵢuᵢ", value: application.output },
    { label: "结果", formula: "Ax", value: application.directOutput },
  ];
  drawStageHeading(ctx, "APPLY SPECTRUM · x → U*x → Λc → UΛc", width, palette);
  const top = 66;
  const available = height - top - 28;
  const gap = available / rows.length;
  ctx.strokeStyle = palette.gridMajor;
  ctx.beginPath();
  ctx.moveTo(27.5, top - 6);
  ctx.lineTo(27.5, top + gap * (rows.length - 0.35));
  ctx.stroke();
  rows.forEach((row, index) => {
    const y = top + gap * (index + 0.38);
    const alpha = 0.12 + 0.88 * phases[index]!;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = index === rows.length - 1 ? palette.red : palette.textSoft;
    ctx.beginPath();
    ctx.arc(28, y - 4, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.textAlign = "left";
    ctx.font = '600 10px "IBM Plex Sans", sans-serif';
    ctx.fillStyle = palette.textSoft;
    ctx.fillText(row.label, 48, y - 10);
    ctx.font = '600 11px "IBM Plex Mono", monospace';
    ctx.fillStyle = index === rows.length - 1 ? palette.red : palette.text;
    ctx.fillText(row.formula, 48, y + 7);
    const text = vectorText(row.value);
    fitText(ctx, text, Math.max(80, width - 170), 11, 8);
    ctx.textAlign = "right";
    ctx.fillText(text, width - 16, y + 7);
    ctx.restore();
  });
  ctx.fillStyle = palette.textSoft;
  ctx.textAlign = "left";
  ctx.font = '9px "IBM Plex Mono", monospace';
  ctx.fillText(
    `application residual ${application.residual.toExponential(2)}`,
    16,
    height - 10,
  );
}

function renderDesktopApplication(
  frame: VisualizationRenderFrame,
  state: OperatorState,
  derived: Extract<OperatorDerived, { application: object }>,
  palette: CanvasPalette,
) {
  const { ctx, width, height, easedProgress } = frame;
  const spectral = derived.spectral;
  if (!spectral.success) return;
  const application = derived.application;
  const colors = componentColors(palette);
  const coordinatePhase = clamp01(easedProgress * 4);
  const weightPhase = clamp01(easedProgress * 4 - 1);
  const contributionPhase = clamp01(easedProgress * 4 - 2);
  const outputPhase = clamp01(easedProgress * 4 - 3);
  const positions = [0.075, 0.275, 0.49, 0.715, 0.91].map(
    (value) => width * value,
  );
  const labels = ["x", "c = U*x", "d = Λc", "dᵢuᵢ", "Ax = Σdᵢuᵢ"];
  drawStageHeading(
    ctx,
    "APPLY SPECTRUM · 每个颜色始终对应同一谱分量",
    width,
    palette,
  );
  ctx.textAlign = "center";
  ctx.font = '600 11px "IBM Plex Mono", monospace';
  labels.forEach((label, index) => {
    ctx.fillStyle = index === 4 ? palette.red : palette.text;
    ctx.fillText(label, positions[index]!, 55);
  });

  const top = 98;
  const bottom = Math.max(top, height - 72);
  const gap =
    state.dimension === 1 ? 0 : (bottom - top) / (state.dimension - 1);
  const inputY = (top + bottom) / 2;
  drawVectorGlyph(
    ctx,
    positions[0]!,
    inputY,
    state.vector,
    palette.text,
    palette,
    1,
    18,
  );
  ctx.fillStyle = palette.textSoft;
  ctx.font = '9px "IBM Plex Mono", monospace';
  fitText(ctx, vectorText(state.vector), width * 0.17, 9, 7);
  ctx.fillText(vectorText(state.vector), positions[0]!, bottom + 38);

  spectral.eigenvalues.forEach((_, index) => {
    const y = state.dimension === 1 ? inputY : top + gap * index;
    const color = colors[index]!;
    const alpha = focusAlpha(state, index);
    drawConnector(
      ctx,
      positions[0]! + 24,
      inputY,
      positions[1]! - 25,
      y,
      color,
      coordinatePhase,
      alpha,
    );
    drawScalarGlyph(
      ctx,
      positions[1]!,
      y,
      application.coordinates[index]!,
      color,
      alpha * (0.12 + 0.88 * coordinatePhase),
    );
    drawConnector(
      ctx,
      positions[1]! + 26,
      y,
      positions[2]! - 26,
      y,
      color,
      weightPhase,
      alpha,
    );
    drawScalarGlyph(
      ctx,
      positions[2]!,
      y,
      application.weightedCoordinates[index]!,
      color,
      alpha * (0.12 + 0.88 * weightPhase),
    );
    drawConnector(
      ctx,
      positions[2]! + 26,
      y,
      positions[3]! - 28,
      y,
      color,
      contributionPhase,
      alpha,
    );
    drawVectorGlyph(
      ctx,
      positions[3]!,
      y,
      application.contributions[index]!,
      color,
      palette,
      alpha * (0.12 + 0.88 * contributionPhase),
      17,
    );
    drawConnector(
      ctx,
      positions[3]! + 28,
      y,
      positions[4]! - 28,
      inputY,
      color,
      outputPhase,
      alpha,
    );
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = "center";
    ctx.font = '9px "IBM Plex Mono", monospace';
    ctx.fillStyle = color;
    ctx.fillText(
      `c${index + 1}=${formatComplex(application.coordinates[index]!)}`,
      positions[1]!,
      y + 34,
    );
    ctx.fillText(
      `d${index + 1}=${formatComplex(application.weightedCoordinates[index]!)}`,
      positions[2]!,
      y + 34,
    );
    ctx.restore();
  });

  drawVectorGlyph(
    ctx,
    positions[4]!,
    inputY,
    application.output,
    palette.red,
    palette,
    0.12 + 0.88 * outputPhase,
    18,
  );
  ctx.globalAlpha = 0.12 + 0.88 * outputPhase;
  ctx.fillStyle = palette.red;
  ctx.textAlign = "center";
  const outputText = vectorText(application.output);
  fitText(ctx, outputText, width * 0.17, 9, 7);
  ctx.fillText(outputText, positions[4]!, bottom + 38);
  ctx.globalAlpha = 1;
  ctx.fillStyle = palette.textSoft;
  ctx.textAlign = "left";
  ctx.font = '9px "IBM Plex Mono", monospace';
  ctx.fillText(
    `UΛU*x = Ax · residual ${application.residual.toExponential(2)}`,
    16,
    height - 16,
  );
}

function renderApplication(
  frame: VisualizationRenderFrame,
  state: OperatorState,
  derived: Extract<OperatorDerived, { application: object }>,
  palette: CanvasPalette,
) {
  if (frame.width < 560) {
    renderCompactApplication(frame, state, derived, palette);
  } else {
    renderDesktopApplication(frame, state, derived, palette);
  }
}

export function renderOperatorCanvas(
  frame: VisualizationRenderFrame,
  theme: ThemeMode,
  state: OperatorState,
  derived: OperatorDerived,
) {
  const palette = getCanvasPalette(theme);
  const { ctx, width, height } = frame;
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, width, height);
  drawGrid(ctx, width, height, palette);
  if (!derived.spectral.success || !derived.application) {
    renderFailure(frame, state, derived, palette);
    return;
  }
  if (state.lessonMode === "structure") {
    renderStructure(frame, state, derived, palette);
  } else {
    renderApplication(frame, state, derived, palette);
  }
}
