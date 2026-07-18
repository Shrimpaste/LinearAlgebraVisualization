import { lazy, Suspense, useCallback, useMemo, useRef } from "react";
import { RotateCcw } from "lucide-react";
import type { SceneProps } from "../../app/types";
import { metricInnerProduct, type Mat2, type Vec2 } from "../../math";
import {
  complex,
  type ComplexMatrix,
  type ComplexVector,
  type Dimension,
  type Field,
  type RealMatrix,
  type RealVector,
} from "../../math/nd";
import {
  VisualizationStage,
  type VisualizationPointerEvent,
  type VisualizationRenderFrame,
  type VisualizationStageHandle,
} from "../../components/VisualizationStage";
import { SceneLayout } from "../../components/SceneLayout";
import { AxiomChecklist } from "../../components/ui/AxiomChecklist";
import {
  ComplexMatrixInput,
  type ComplexMatrixValue,
} from "../../components/ui/ComplexMatrixInput";
import {
  ComplexVectorInput,
  type ComplexVectorValue,
} from "../../components/ui/ComplexVectorInput";
import { ControlSection } from "../../components/ui/ControlSection";
import {
  DynamicMatrixInput,
  type DynamicMatrixValue,
} from "../../components/ui/DynamicMatrixInput";
import {
  DynamicVectorInput,
  type DynamicVectorValue,
} from "../../components/ui/DynamicVectorInput";
import { IconButton } from "../../components/ui/IconButton";
import { MetricList } from "../../components/ui/MetricList";
import { Notice } from "../../components/ui/Notice";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { SelectField } from "../../components/ui/SelectField";
import { Toggle } from "../../components/ui/Toggle";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import {
  drawAxes,
  drawGrid,
  drawInfiniteLine,
  drawLabel,
  drawLine,
  drawPoint,
  drawPolygon,
  drawVector,
  getCanvasPalette,
  isWorldPointNearCanvas,
  lerpVec,
} from "../../rendering";
import { formatNumber } from "../../utils/format";
import { formatComplex, formatComplexVector } from "../../utils/formatLinear";
import {
  changeInnerProductField,
  deriveInnerProduct,
  innerProductDefaults,
  metricForPreset,
  metricPresetOptions,
  migrateInnerProductState,
  resizeInnerProductState,
  type InnerProductMode,
  type MetricPreset,
} from "./model";
import type { ThreeInnerProductStageHandle } from "./ThreeInnerProductStage";

const ThreeInnerProductStage = lazy(() =>
  import("./ThreeInnerProductStage").then((module) => ({
    default: module.ThreeInnerProductStage,
  })),
);

const dimensionOptions = [
  { value: "1", label: "1 维" },
  { value: "2", label: "2 维" },
  { value: "3", label: "3 维" },
] as const;

const complexComponentScale = 0.42;

const modeLabels: Record<InnerProductMode, string> = {
  projection: "正交投影",
  "gram-schmidt": "Gram–Schmidt 正交化",
  axioms: "内积公理验证",
};

const drawLayers: Record<InnerProductMode, string> = {
  projection: "orthogonal-projection",
  "gram-schmidt": "orthonormal-basis",
  axioms: "axiom-certificate",
};

function getInnerProductStageContract(
  field: Field,
  dimension: Dimension,
  mode: InnerProductMode,
) {
  const observation =
    field === "C"
      ? "complex-component-argand"
      : dimension === 3
        ? "real-metric-3d"
        : "real-native";
  const observationLabel =
    field === "C"
      ? `逐分量 Argand 相位投影，完整计算保持在 C${dimension}`
      : dimension === 3
        ? "R3 的 G 等距三维度量视图"
        : `${dimension} 维实空间几何`;

  return {
    observation,
    drawLayer: drawLayers[mode],
    ariaLabel: `${field}${dimension} 内积的${modeLabels[mode]}；${observationLabel}`,
    fallbackLabel: `${modeLabels[mode]}。${observationLabel}`,
  };
}

function toDimension(value: "1" | "2" | "3"): Dimension {
  return Number(value) as Dimension;
}

function toRealVectorInput(
  value: ComplexVector,
  size: Dimension,
): DynamicVectorValue {
  return { dimension: size, entries: value.map((entry) => entry.re) };
}

function fromRealVectorInput(value: DynamicVectorValue): ComplexVector {
  return value.entries.map((entry) => complex(entry));
}

function realVector(value: ComplexVector): RealVector {
  return value.map((entry) => entry.re);
}

function realMatrix(value: ComplexMatrix): RealMatrix {
  return value.map((row) => row.map((entry) => entry.re));
}

function toComplexVectorInput(
  value: ComplexVector,
  size: Dimension,
): ComplexVectorValue {
  return {
    dimension: size,
    entries: value.map((entry) => ({ real: entry.re, imag: entry.im })),
  };
}

function fromComplexVectorInput(value: ComplexVectorValue): ComplexVector {
  return value.entries.map((entry) => complex(entry.real, entry.imag));
}

function toRealMatrixInput(
  value: ComplexMatrix,
  size: Dimension,
): DynamicMatrixValue {
  return {
    rows: size,
    columns: size,
    entries: value.flat().map((entry) => entry.re),
  };
}

function fromRealMatrixInput(value: DynamicMatrixValue): ComplexMatrix {
  return Array.from({ length: value.rows }, (_, row) =>
    Array.from({ length: value.columns }, (_, column) =>
      complex(value.entries[row * value.columns + column] ?? 0),
    ),
  );
}

function toComplexMatrixInput(
  value: ComplexMatrix,
  size: Dimension,
): ComplexMatrixValue {
  return {
    rows: size,
    columns: size,
    entries: value.flat().map((entry) => ({
      real: entry.re,
      imag: entry.im,
    })),
  };
}

function fromComplexMatrixInput(value: ComplexMatrixValue): ComplexMatrix {
  return Array.from({ length: value.rows }, (_, row) =>
    Array.from({ length: value.columns }, (_, column) => {
      const entry = value.entries[row * value.columns + column];
      return complex(entry?.real ?? 0, entry?.imag ?? 0);
    }),
  );
}

function mat2(metric: ComplexMatrix): Mat2 {
  return [
    metric[0]?.[0]?.re ?? 1,
    metric[0]?.[1]?.re ?? 0,
    metric[1]?.[0]?.re ?? 0,
    metric[1]?.[1]?.re ?? 1,
  ];
}

function complexComponentOrigin(index: number, count: number): Vec2 {
  const spacing = count === 1 ? 0 : count === 2 ? 3.2 : 2.55;
  return [-((count - 1) * spacing) / 2 + index * spacing, 0];
}

function complexComponentPoint(
  origin: Vec2,
  value: { readonly re: number; readonly im: number },
): Vec2 {
  return [
    origin[0] + value.re * complexComponentScale,
    origin[1] + value.im * complexComponentScale,
  ];
}

function projectVector(vector: ComplexVector): Vec2 {
  return [vector[0]?.re ?? 0, vector[1]?.re ?? 0];
}

function drawMetricBall(
  frame: VisualizationRenderFrame,
  metric: Mat2,
  color: string,
  fill: string,
) {
  const points: Vec2[] = [];
  for (let index = 0; index < 100; index += 1) {
    const angle = (index / 100) * Math.PI * 2;
    const direction: Vec2 = [Math.cos(angle), Math.sin(angle)];
    const quadratic = metricInnerProduct(direction, direction, metric);
    if (quadratic <= 0) return;
    const radius = 1 / Math.sqrt(quadratic);
    points.push([direction[0] * radius, direction[1] * radius]);
  }
  drawPolygon(frame.ctx, frame.viewport, points, {
    stroke: color,
    fill,
    width: 1.7,
  });
}

function drawComplexComponents(
  frame: VisualizationRenderFrame,
  first: ComplexVector,
  second: ComplexVector,
  palette: ReturnType<typeof getCanvasPalette>,
) {
  const count = first.length;
  for (let index = 0; index < count; index += 1) {
    const origin = complexComponentOrigin(index, count);
    drawLine(
      frame.ctx,
      frame.viewport,
      [origin[0] - 1.05, origin[1]],
      [origin[0] + 1.05, origin[1]],
      { color: palette.axis, width: 1, alpha: 0.6 },
    );
    drawLine(
      frame.ctx,
      frame.viewport,
      [origin[0], origin[1] - 1.05],
      [origin[0], origin[1] + 1.05],
      { color: palette.axis, width: 1, alpha: 0.6 },
    );
    const u = first[index] ?? complex(0);
    const v = second[index] ?? complex(0);
    const uEnd = complexComponentPoint(origin, u);
    const vEnd = complexComponentPoint(origin, v);
    drawLine(frame.ctx, frame.viewport, origin, uEnd, {
      color: palette.cyan,
      width: 2.5,
    });
    drawLine(frame.ctx, frame.viewport, origin, vEnd, {
      color: palette.red,
      width: 2.5,
    });
    drawPoint(
      frame.ctx,
      frame.viewport,
      uEnd,
      palette.cyan,
      3.5,
      true,
      palette.background,
    );
    drawPoint(
      frame.ctx,
      frame.viewport,
      vEnd,
      palette.red,
      3.5,
      true,
      palette.background,
    );
    drawLabel(
      frame.ctx,
      frame.viewport,
      [origin[0], origin[1] - 1.18],
      "z" + String(index + 1),
      palette.textSoft,
      [0, 0],
    );
    drawLabel(
      frame.ctx,
      frame.viewport,
      uEnd,
      "u" + String(index + 1),
      palette.cyan,
      [6, -7],
    );
    drawLabel(
      frame.ctx,
      frame.viewport,
      vEnd,
      "v" + String(index + 1),
      palette.red,
      [6, 9],
    );
  }
}

type InnerProductDerivation = ReturnType<typeof deriveInnerProduct>;

function drawComplexProjection(
  frame: VisualizationRenderFrame,
  derived: InnerProductDerivation,
  palette: ReturnType<typeof getCanvasPalette>,
) {
  if (!derived.projection) return;
  const count = derived.projection.projection.length;
  for (let index = 0; index < count; index += 1) {
    const origin = complexComponentOrigin(index, count);
    const projection = derived.projection.projection[index] ?? complex(0);
    const residual = derived.projection.residual[index] ?? complex(0);
    const projectionTarget = complexComponentPoint(origin, projection);
    const sumTarget = complexComponentPoint(origin, {
      re: projection.re + residual.re,
      im: projection.im + residual.im,
    });
    const projectionEnd = lerpVec(
      origin,
      projectionTarget,
      frame.easedProgress,
    );
    const sumEnd = lerpVec(origin, sumTarget, frame.easedProgress);

    drawLine(frame.ctx, frame.viewport, origin, projectionEnd, {
      color: palette.yellow,
      width: 3,
    });
    drawLine(frame.ctx, frame.viewport, projectionEnd, sumEnd, {
      color: palette.blue,
      width: 2.2,
      dash: [5, 4],
    });
    drawPoint(
      frame.ctx,
      frame.viewport,
      projectionEnd,
      palette.yellow,
      3.5,
      true,
      palette.background,
    );
    drawLabel(
      frame.ctx,
      frame.viewport,
      projectionEnd,
      `p${index + 1}`,
      palette.yellow,
      [5, -7],
    );
    drawLabel(
      frame.ctx,
      frame.viewport,
      sumEnd,
      `r${index + 1}`,
      palette.blue,
      [5, 10],
    );
  }
}

function drawComplexGramSchmidt(
  frame: VisualizationRenderFrame,
  first: ComplexVector,
  second: ComplexVector,
  derived: InnerProductDerivation,
  palette: ReturnType<typeof getCanvasPalette>,
) {
  const basis = derived.gramSchmidt.orthonormal;
  const count = first.length;
  const vectors = [
    { source: first, target: basis[0], color: palette.blue, label: "q1" },
    { source: second, target: basis[1], color: palette.yellow, label: "q2" },
  ] as const;

  vectors.forEach(({ source, target, color, label }) => {
    if (!target) return;
    for (let index = 0; index < count; index += 1) {
      const origin = complexComponentOrigin(index, count);
      const sourceEnd = complexComponentPoint(
        origin,
        source[index] ?? complex(0),
      );
      const targetEnd = complexComponentPoint(
        origin,
        target[index] ?? complex(0),
      );
      const end = lerpVec(sourceEnd, targetEnd, frame.easedProgress);
      drawLine(frame.ctx, frame.viewport, origin, end, {
        color,
        width: 3,
      });
      drawPoint(
        frame.ctx,
        frame.viewport,
        end,
        color,
        3.5,
        true,
        palette.background,
      );
      drawLabel(
        frame.ctx,
        frame.viewport,
        end,
        `${label},${index + 1}`,
        color,
        [5, label === "q1" ? -7 : 10],
      );
    }
  });
}

function drawComponentPhaseArc(
  frame: VisualizationRenderFrame,
  origin: Vec2,
  first: { readonly re: number; readonly im: number },
  second: { readonly re: number; readonly im: number },
  color: string,
  label: string,
) {
  if (Math.hypot(first.re, first.im) < 1e-8) return;
  if (Math.hypot(second.re, second.im) < 1e-8) return;
  const from = Math.atan2(first.im, first.re);
  const to = Math.atan2(second.im, second.re);
  const fullTurn = Math.PI * 2;
  const delta =
    ((((to - from + Math.PI) % fullTurn) + fullTurn) % fullTurn) - Math.PI;
  const animatedEnd = from + delta * frame.easedProgress;
  const center = frame.viewport.worldToCanvas(origin);
  const radius = 0.32;

  frame.ctx.save();
  frame.ctx.strokeStyle = color;
  frame.ctx.lineWidth = 1.7;
  frame.ctx.beginPath();
  frame.ctx.arc(
    center[0],
    center[1],
    radius * frame.viewport.scale,
    -from,
    -animatedEnd,
    delta > 0,
  );
  frame.ctx.stroke();
  frame.ctx.restore();

  const middle = from + (delta * frame.easedProgress) / 2;
  drawLabel(
    frame.ctx,
    frame.viewport,
    [
      origin[0] + Math.cos(middle) * (radius + 0.12),
      origin[1] + Math.sin(middle) * (radius + 0.12),
    ],
    label,
    color,
    [3, -3],
  );
}

function formatAxiomResidual(value: number) {
  if (value === 0) return "0";
  return value < 0.001 ? value.toExponential(1) : formatNumber(value);
}

function drawComplexAxiomCertificate(
  frame: VisualizationRenderFrame,
  first: ComplexVector,
  second: ComplexVector,
  derived: InnerProductDerivation,
  palette: ReturnType<typeof getCanvasPalette>,
) {
  for (let index = 0; index < first.length; index += 1) {
    const origin = complexComponentOrigin(index, first.length);
    const u = first[index] ?? complex(0);
    const v = second[index] ?? complex(0);
    const uEnd = complexComponentPoint(origin, u);
    const vEnd = complexComponentPoint(origin, v);
    drawLine(frame.ctx, frame.viewport, uEnd, vEnd, {
      color: palette.neutral,
      width: 1.2,
      dash: [3, 4],
      alpha: 0.7,
    });
    drawComponentPhaseArc(
      frame,
      origin,
      u,
      v,
      palette.yellow,
      `Δφ${index + 1}`,
    );
  }

  const checks = [
    ["PD", derived.validation.positiveDefinite],
    ["ADD", derived.validation.firstSlotAdditivity],
    ["HOM", derived.validation.firstSlotHomogeneity],
    ["SYM", derived.validation.conjugateSymmetry],
  ] as const;
  const gap = Math.min(96, Math.max(62, (frame.width - 32) / checks.length));
  const start = frame.width / 2 - (gap * (checks.length - 1)) / 2;
  frame.ctx.save();
  frame.ctx.font = '500 9px "IBM Plex Mono", monospace';
  frame.ctx.textAlign = "center";
  checks.forEach(([label, check], index) => {
    frame.ctx.fillStyle = check.passed ? palette.cyan : palette.red;
    frame.ctx.beginPath();
    frame.ctx.arc(start + index * gap, frame.height - 27, 3, 0, Math.PI * 2);
    frame.ctx.fill();
    frame.ctx.fillText(
      `${label} ${formatAxiomResidual(check.residual)}`,
      start + index * gap,
      frame.height - 13,
    );
  });
  frame.ctx.restore();
}

function drawComplexModeTitle(
  frame: VisualizationRenderFrame,
  dimension: Dimension,
  mode: InnerProductMode,
  derived: InnerProductDerivation,
  palette: ReturnType<typeof getCanvasPalette>,
) {
  const detail =
    mode === "projection"
      ? "p + r = u"
      : mode === "gram-schmidt"
        ? `rank ${derived.gramSchmidt.rank}`
        : "phase witnesses + residuals";
  frame.ctx.save();
  frame.ctx.fillStyle = palette.textSoft;
  frame.ctx.font = '500 10px "IBM Plex Mono", monospace';
  frame.ctx.textAlign = "left";
  frame.ctx.fillText(`C${dimension} ${modeLabels[mode]} · ${detail}`, 15, 21);
  frame.ctx.restore();
}

export function InnerProductScene({ theme }: SceneProps) {
  const isMobile = useMediaQuery("(max-width: 760px)");
  const [state, setState, resetState] = useLocalStorage(
    "basis-lab:inner-product",
    innerProductDefaults,
    migrateInnerProductState,
  );
  const stageRef = useRef<VisualizationStageHandle>(null);
  const threeStageRef = useRef<ThreeInnerProductStageHandle>(null);
  const dragging = useRef<"first" | "second" | null>(null);
  const derived = useMemo(() => deriveInnerProduct(state), [state]);
  const usesThree = state.field === "R" && state.dimension === 3;

  const replay = useCallback(() => {
    if (usesThree) threeStageRef.current?.replay();
    else stageRef.current?.replay();
  }, [usesThree]);

  const render = useCallback(
    (frame: VisualizationRenderFrame) => {
      const { ctx, viewport, width, height, easedProgress } = frame;
      const palette = getCanvasPalette(theme);
      ctx.fillStyle = palette.background;
      ctx.fillRect(0, 0, width, height);
      drawGrid(ctx, viewport, palette);
      drawAxes(ctx, viewport, palette);

      if (state.field === "C") {
        drawComplexComponents(frame, state.first, state.second, palette);
        if (state.mode === "projection") {
          drawComplexProjection(frame, derived, palette);
        } else if (state.mode === "gram-schmidt") {
          drawComplexGramSchmidt(
            frame,
            state.first,
            state.second,
            derived,
            palette,
          );
        } else {
          drawComplexAxiomCertificate(
            frame,
            state.first,
            state.second,
            derived,
            palette,
          );
        }
        drawComplexModeTitle(
          frame,
          state.dimension,
          state.mode,
          derived,
          palette,
        );
        return;
      }

      const first = projectVector(state.first);
      const second = projectVector(state.second);
      if (state.showMetricCircle && state.dimension === 2 && derived.valid) {
        drawMetricBall(
          frame,
          mat2(state.metric),
          palette.blue,
          palette.blueFill,
        );
        drawLabel(
          ctx,
          viewport,
          [0.9, 0.95],
          "‖x‖G = 1",
          palette.blue,
          [5, -5],
        );
      }

      drawVector(ctx, viewport, first, {
        color: palette.cyan,
        label: "u",
        width: 2.8,
      });
      drawVector(ctx, viewport, second, {
        color: palette.red,
        label: "v",
        width: 2.8,
      });
      drawPoint(
        ctx,
        viewport,
        first,
        palette.cyan,
        4,
        true,
        palette.background,
      );
      drawPoint(
        ctx,
        viewport,
        second,
        palette.red,
        4,
        true,
        palette.background,
      );

      if (state.mode === "projection" && derived.projection) {
        const projected = projectVector(derived.projection.projection);
        const projectionPoint = lerpVec([0, 0], projected, easedProgress);
        const residualTarget = projectVector(derived.projection.residual);
        const residualEnd: Vec2 = [
          projectionPoint[0] + residualTarget[0] * easedProgress,
          projectionPoint[1] + residualTarget[1] * easedProgress,
        ];
        drawInfiniteLine(ctx, viewport, second, {
          color: palette.red,
          width: 1,
          dash: [6, 5],
          alpha: 0.5,
        });
        drawVector(ctx, viewport, projectionPoint, {
          color: palette.yellow,
          label: "projᵥu",
          width: 2.8,
        });
        drawLine(ctx, viewport, projectionPoint, residualEnd, {
          color: palette.blue,
          width: 2,
          dash: [5, 4],
        });
      }

      if (state.mode === "gram-schmidt") {
        const firstBasis = derived.gramSchmidt.orthonormal[0];
        const secondBasis = derived.gramSchmidt.orthonormal[1];
        if (firstBasis) {
          drawVector(
            ctx,
            viewport,
            lerpVec(first, projectVector(firstBasis), easedProgress),
            { color: palette.blue, label: "q1", width: 3 },
          );
        }
        if (secondBasis) {
          drawVector(
            ctx,
            viewport,
            lerpVec(second, projectVector(secondBasis), easedProgress),
            { color: palette.yellow, label: "q2", width: 3 },
          );
        }
      }
    },
    [derived, state, theme],
  );

  const onPointerDown = useCallback(
    (event: VisualizationPointerEvent) => {
      if (state.field !== "R" || state.dimension !== 2) return false;
      if (
        isWorldPointNearCanvas(
          projectVector(state.first),
          event.canvas,
          event.viewport,
        )
      ) {
        dragging.current = "first";
      } else if (
        isWorldPointNearCanvas(
          projectVector(state.second),
          event.canvas,
          event.viewport,
        )
      ) {
        dragging.current = "second";
      } else {
        return false;
      }
      return true;
    },
    [state],
  );

  const onPointerMove = useCallback(
    (event: VisualizationPointerEvent) => {
      const key = dragging.current;
      if (!key) return;
      setState((current) => ({
        ...current,
        [key]: [complex(event.world[0]), complex(event.world[1])],
      }));
    },
    [setState],
  );

  const stopDragging = useCallback(() => {
    dragging.current = null;
  }, []);

  const selectMetric = (metricPreset: MetricPreset) => {
    const metric =
      metricPreset === "custom"
        ? state.metric
        : metricForPreset(metricPreset, state.field, state.dimension);
    setState((current) => ({ ...current, metricPreset, metric }));
    window.setTimeout(replay, 0);
  };

  const formulaText =
    derived.innerProduct === null
      ? "未定义"
      : state.field === "R"
        ? formatNumber(derived.innerProduct.re)
        : formatComplex(derived.innerProduct);
  const angleText =
    derived.angleDegrees === null
      ? "未定义"
      : formatNumber(derived.angleDegrees) + "°";
  const normText = (value: number | null) =>
    value === null ? "—" : formatNumber(value);
  const axiomItems = [
    {
      id: "positive",
      label: "正定性",
      passed: derived.validation.positiveDefinite.passed,
      residual: derived.validation.positiveDefinite.residual,
      detail: "⟨x,x⟩ > 0，且仅零向量取零",
    },
    {
      id: "additivity",
      label: "第一槽加性",
      passed: derived.validation.firstSlotAdditivity.passed,
      residual: derived.validation.firstSlotAdditivity.residual,
      detail: "⟨x+z,y⟩ = ⟨x,y⟩ + ⟨z,y⟩",
    },
    {
      id: "homogeneity",
      label: "第一槽齐性",
      passed: derived.validation.firstSlotHomogeneity.passed,
      residual: derived.validation.firstSlotHomogeneity.residual,
      detail: "⟨αx,y⟩ = α⟨x,y⟩",
    },
    {
      id: "conjugate",
      label: "交换共轭",
      passed: derived.validation.conjugateSymmetry.passed,
      residual: derived.validation.conjugateSymmetry.residual,
      detail: "⟨x,y⟩ = overline(⟨y,x⟩)",
    },
  ];
  const presetOptions = metricPresetOptions(state.field) as readonly {
    value: MetricPreset;
    label: string;
  }[];
  const stageContract = getInnerProductStageContract(
    state.field,
    state.dimension,
    state.mode,
  );

  return (
    <SceneLayout
      id="inner-product"
      index="04"
      title="内积空间"
      subtitle={
        state.field + String(state.dimension) + " · 自定义 Gram 矩阵与公理验证"
      }
      formulaLabel="内积定义"
      formula={
        <>
          ⟨u,v⟩G = {state.field === "C" ? "v*Gu" : "vᵀGu"} = {formulaText}
        </>
      }
      formulaStatus={derived.valid ? "四条公理成立" : "G 无效"}
      formulaTone={derived.valid ? "positive" : "negative"}
      insight={
        !derived.valid ? (
          <>
            <strong>线性公式并不自动成为内积。</strong>{" "}
            正定性与交换共轭必须同时成立；残差给出失败证书。
          </>
        ) : state.mode === "axioms" ? (
          <>
            <strong>本工具采用第一槽线性约定。</strong>{" "}
            在复数域中交换两个输入时必须同时取共轭。
          </>
        ) : state.field === "C" ? (
          <>
            <strong>复空间的完整实维数是两倍。</strong> 舞台只显示每个分量的
            Argand 投影，数值证书在完整空间计算。
          </>
        ) : state.dimension === 3 ? (
          <>
            <strong>三维舞台使用 G 的等距度量坐标。</strong> 若
            SᵀS=G，则画面绘制 Sx，使可见长度、夹角和正交关系与原内积一致。
          </>
        ) : (
          <>
            <strong>Gram 矩阵重定义长度、角度和正交。</strong> 合法 G
            的单位球可能成为旋转的椭球。
          </>
        )
      }
      stage={
        <div
          className="dimension-stage inner-product-stage"
          data-testid="inner-product-stage-contract"
          data-field={state.field}
          data-mode={state.mode}
          data-observation={stageContract.observation}
          data-draw-layer={stageContract.drawLayer}
        >
          {usesThree ? (
            <Suspense
              fallback={
                <div className="stage-loading" role="status">
                  正在加载三维度量舞台…
                </div>
              }
            >
              <ThreeInnerProductStage
                ref={threeStageRef}
                first={realVector(state.first)}
                second={realVector(state.second)}
                metric={realMatrix(state.metric)}
                mode={state.mode}
                projection={
                  derived.projection
                    ? realVector(derived.projection.projection)
                    : null
                }
                residual={
                  derived.projection
                    ? realVector(derived.projection.residual)
                    : null
                }
                orthonormal={derived.gramSchmidt.orthonormal.map(realVector)}
                valid={derived.valid}
                showUnitSphere={state.showMetricCircle}
                theme={theme}
                exportFilename="basis-lab-inner-product-3d.png"
              />
            </Suspense>
          ) : (
            <VisualizationStage
              key={
                (isMobile ? "mobile" : "desktop") +
                "-" +
                state.field +
                "-" +
                String(state.dimension)
              }
              ref={stageRef}
              render={render}
              renderKey={state}
              viewport={{
                scale: isMobile ? 48 : 72,
                center: isMobile ? [0, 0.25] : [0, 0],
              }}
              duration={1050}
              ariaLabel={stageContract.ariaLabel}
              fallbackDescription={
                stageContract.fallbackLabel +
                "。u=" +
                formatComplexVector(state.first) +
                "，v=" +
                formatComplexVector(state.second) +
                "，内积为 " +
                formulaText +
                "。"
              }
              showExportButton
              exportFilename="basis-lab-inner-product.png"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={stopDragging}
              onPointerCancel={stopDragging}
            />
          )}
        </div>
      }
      inspector={
        <>
          <ControlSection
            title="空间与向量"
            caption={
              state.field === "C"
                ? "实部/虚部独立编辑，完整空间按复维数计算"
                : state.dimension === 2
                  ? "端点可在画布中直接拖动"
                  : state.dimension === 3
                    ? "三维舞台使用 G 等距坐标，读数保持原坐标"
                    : "一维数轴展示"
            }
            action={
              <IconButton label="恢复默认内积实验" onClick={resetState}>
                <RotateCcw size={15} />
              </IconButton>
            }
          >
            <div className="dimension-row">
              <SegmentedControl<Field>
                label="标量域"
                value={state.field}
                options={[
                  { value: "R", label: "实数 R" },
                  { value: "C", label: "复数 C" },
                ]}
                onChange={(field) =>
                  setState((current) => changeInnerProductField(current, field))
                }
              />
              <SelectField
                label="空间维数"
                value={String(state.dimension) as "1" | "2" | "3"}
                options={dimensionOptions}
                onChange={(value) =>
                  setState((current) =>
                    resizeInnerProductState(current, toDimension(value)),
                  )
                }
              />
            </div>
            <SegmentedControl<InnerProductMode>
              label="内积实验模式"
              value={state.mode}
              options={[
                { value: "projection", label: "投影" },
                { value: "gram-schmidt", label: "Gram–Schmidt" },
                { value: "axioms", label: "公理验证" },
              ]}
              onChange={(mode) => {
                setState((current) => ({ ...current, mode }));
                window.setTimeout(replay, 0);
              }}
            />
            {state.field === "R" ? (
              <>
                <DynamicVectorInput
                  label="u"
                  name="first"
                  value={toRealVectorInput(state.first, state.dimension)}
                  onChange={(first) =>
                    setState((current) => ({
                      ...current,
                      first: fromRealVectorInput(first),
                    }))
                  }
                />
                <DynamicVectorInput
                  label="v"
                  name="second"
                  tone="red"
                  value={toRealVectorInput(state.second, state.dimension)}
                  onChange={(second) =>
                    setState((current) => ({
                      ...current,
                      second: fromRealVectorInput(second),
                    }))
                  }
                />
              </>
            ) : (
              <>
                <ComplexVectorInput
                  label="u"
                  name="first"
                  value={toComplexVectorInput(state.first, state.dimension)}
                  onChange={(first) =>
                    setState((current) => ({
                      ...current,
                      first: fromComplexVectorInput(first),
                    }))
                  }
                />
                <ComplexVectorInput
                  label="v"
                  name="second"
                  tone="red"
                  value={toComplexVectorInput(state.second, state.dimension)}
                  onChange={(second) =>
                    setState((current) => ({
                      ...current,
                      second: fromComplexVectorInput(second),
                    }))
                  }
                />
              </>
            )}
          </ControlSection>

          <ControlSection
            title="Gram 定义"
            caption={
              state.field === "C"
                ? "⟨x,y⟩ = y*Gx；G 必须 Hermitian 正定"
                : "⟨x,y⟩ = yᵀGx；G 必须对称正定"
            }
          >
            <SelectField
              label="内积度量"
              value={state.metricPreset}
              options={presetOptions}
              onChange={selectMetric}
            />
            {state.field === "R" ? (
              <DynamicMatrixInput
                label="度量矩阵"
                symbol="G"
                value={toRealMatrixInput(state.metric, state.dimension)}
                disabled={state.metricPreset !== "custom"}
                onChange={(metric) =>
                  setState((current) => ({
                    ...current,
                    metricPreset: "custom",
                    metric: fromRealMatrixInput(metric),
                  }))
                }
              />
            ) : (
              <ComplexMatrixInput
                label="度量矩阵"
                symbol="G"
                value={toComplexMatrixInput(state.metric, state.dimension)}
                disabled={state.metricPreset !== "custom"}
                testId="complex-metric-cell"
                onChange={(metric) =>
                  setState((current) => ({
                    ...current,
                    metricPreset: "custom",
                    metric: fromComplexMatrixInput(metric),
                  }))
                }
              />
            )}
            {state.field === "R" && state.dimension >= 2 && (
              <Toggle
                label={
                  state.dimension === 3 ? "显示度量单位球" : "显示度量单位圆"
                }
                checked={state.showMetricCircle}
                onChange={(showMetricCircle) =>
                  setState((current) => ({ ...current, showMetricCircle }))
                }
              />
            )}
          </ControlSection>

          <ControlSection title="四条合法性条件">
            <AxiomChecklist label="内积公理验证" items={axiomItems} />
          </ControlSection>

          <ControlSection title="内积读数">
            <MetricList
              metrics={[
                {
                  label: "⟨u,v⟩G",
                  value: formulaText,
                  key: "inner-product",
                  tone: "cyan",
                },
                {
                  label: "‖u‖G",
                  value: normText(derived.firstNorm),
                  key: "norm-u",
                },
                {
                  label: "‖v‖G",
                  value: normText(derived.secondNorm),
                  key: "norm-v",
                },
                { label: "θG", value: angleText, key: "angle", tone: "yellow" },
                {
                  label: "GS rank",
                  value: derived.valid ? String(derived.gramSchmidt.rank) : "—",
                  key: "gram-rank",
                },
              ]}
            />
            {!derived.valid ? (
              <Notice tone="warning">
                {state.field === "R"
                  ? "当前 G 不是对称正定矩阵。"
                  : "当前 G 不是 Hermitian 正定矩阵。"}
              </Notice>
            ) : state.mode === "gram-schmidt" &&
              derived.gramSchmidt.rank < Math.min(2, state.dimension) ? (
              <Notice tone="warning">
                输入向量线性相关，无法产生两条正交方向。
              </Notice>
            ) : (
              <Notice tone="success">
                当前度量有效，所有范数与投影均可计算。
              </Notice>
            )}
          </ControlSection>
        </>
      }
    />
  );
}
