import { useCallback, useMemo, useRef } from "react";
import { RotateCcw } from "lucide-react";
import type { SceneProps } from "../../app/types";
import { addVec2, metricInnerProduct, scaleVec2, type Vec2 } from "../../math";
import {
  VisualizationStage,
  type VisualizationPointerEvent,
  type VisualizationRenderFrame,
  type VisualizationStageHandle,
} from "../../components/VisualizationStage";
import { SceneLayout } from "../../components/SceneLayout";
import { ControlSection } from "../../components/ui/ControlSection";
import { IconButton } from "../../components/ui/IconButton";
import { MatrixInput } from "../../components/ui/MatrixInput";
import { MetricList } from "../../components/ui/MetricList";
import { Notice } from "../../components/ui/Notice";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { SelectField } from "../../components/ui/SelectField";
import { Toggle } from "../../components/ui/Toggle";
import { VectorInput } from "../../components/ui/VectorInput";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import {
  drawArc,
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
import { formatNumber, formatVector } from "../../utils/format";
import {
  deriveInnerProduct,
  innerProductDefaults,
  metricPresets,
  type MetricPreset,
} from "./model";

const metricOptions: readonly { value: MetricPreset; label: string }[] = [
  { value: "euclidean", label: "欧氏内积 I" },
  { value: "x-weighted", label: "x 方向加权" },
  { value: "correlated", label: "相关度量" },
  { value: "custom", label: "自定义 G" },
];

function drawMetricBall(
  frame: VisualizationRenderFrame,
  metric: readonly [number, number, number, number],
  color: string,
  fill: string,
) {
  const points: Vec2[] = [];
  const samples = 100;
  for (let index = 0; index < samples; index += 1) {
    const angle = (index / samples) * Math.PI * 2;
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

export function InnerProductScene({ theme }: SceneProps) {
  const isMobile = useMediaQuery("(max-width: 760px)");
  const [state, setState, resetState] = useLocalStorage(
    "basis-lab:inner-product",
    innerProductDefaults,
  );
  const stageRef = useRef<VisualizationStageHandle>(null);
  const dragging = useRef<"first" | "second" | null>(null);
  const derived = useMemo(() => deriveInnerProduct(state), [state]);

  const render = useCallback(
    (frame: VisualizationRenderFrame) => {
      const { ctx, viewport, width, height, easedProgress } = frame;
      const palette = getCanvasPalette(theme);
      ctx.fillStyle = palette.background;
      ctx.fillRect(0, 0, width, height);
      drawGrid(ctx, viewport, palette);
      drawAxes(ctx, viewport, palette);

      if (state.showMetricCircle && derived.metricAnalysis.isPositiveDefinite) {
        drawMetricBall(frame, state.metric, palette.blue, palette.blueFill);
        drawLabel(
          ctx,
          viewport,
          [0.9, 0.95],
          "‖x‖G = 1",
          palette.blue,
          [5, -5],
        );
      }

      drawVector(ctx, viewport, state.first, {
        color: palette.cyan,
        label: "u",
        width: 2.8,
      });
      drawVector(ctx, viewport, state.second, {
        color: palette.red,
        label: "v",
        width: 2.8,
      });
      drawPoint(
        ctx,
        viewport,
        state.first,
        palette.cyan,
        4,
        true,
        palette.background,
      );
      drawPoint(
        ctx,
        viewport,
        state.second,
        palette.red,
        4,
        true,
        palette.background,
      );

      if (state.mode === "projection" && derived.projection) {
        const projection = lerpVec(
          [0, 0],
          derived.projection.projection,
          easedProgress,
        );
        const residualStart = projection;
        const residualEnd = addVec2(
          projection,
          scaleVec2(derived.projection.residual, easedProgress),
        );
        drawInfiniteLine(ctx, viewport, state.second, {
          color: palette.red,
          width: 1,
          dash: [6, 5],
          alpha: 0.5,
        });
        drawVector(ctx, viewport, projection, {
          color: palette.yellow,
          label: "projᵥu",
          width: 2.8,
        });
        drawLine(ctx, viewport, residualStart, residualEnd, {
          color: palette.blue,
          width: 2,
          dash: [5, 4],
        });
        drawLabel(
          ctx,
          viewport,
          residualEnd,
          "正交残差",
          palette.blue,
          [8, 10],
        );
        drawLabel(ctx, viewport, projection, "⟂G", palette.yellow, [7, -8]);

        if (state.metricPreset === "euclidean" && derived.angle) {
          const firstAngle = Math.atan2(state.first[1], state.first[0]);
          const secondAngle = Math.atan2(state.second[1], state.second[0]);
          drawArc(
            ctx,
            viewport,
            0.55,
            secondAngle,
            firstAngle,
            palette.yellow,
            `${formatNumber(derived.angle.degrees)}°`,
          );
        }
      }

      if (
        state.mode === "gram-schmidt" &&
        derived.gramSchmidt.kind !== "invalid-metric"
      ) {
        const first = derived.gramSchmidt.steps[0]?.normalized;
        const second = derived.gramSchmidt.steps[1]?.normalized;
        if (first) {
          drawVector(
            ctx,
            viewport,
            lerpVec(state.first, first, easedProgress),
            {
              color: palette.blue,
              label: "q₁",
              width: 3,
            },
          );
        }
        if (second) {
          drawVector(
            ctx,
            viewport,
            lerpVec(state.second, second, easedProgress),
            {
              color: palette.yellow,
              label: "q₂",
              width: 3,
            },
          );
        }
        const step = derived.gramSchmidt.steps[1];
        const projection = step?.projections[0]?.vector;
        if (projection) {
          drawVector(ctx, viewport, projection, {
            color: palette.neutral,
            label: "被移除分量",
            width: 1.4,
            dash: [5, 4],
          });
        }
      }
    },
    [derived, state, theme],
  );

  const onPointerDown = useCallback(
    (event: VisualizationPointerEvent) => {
      if (isWorldPointNearCanvas(state.first, event.canvas, event.viewport))
        dragging.current = "first";
      else if (
        isWorldPointNearCanvas(state.second, event.canvas, event.viewport)
      )
        dragging.current = "second";
      else return false;
      return true;
    },
    [state.first, state.second],
  );

  const onPointerMove = useCallback(
    (event: VisualizationPointerEvent) => {
      const key = dragging.current;
      if (!key) return;
      setState((current) => ({ ...current, [key]: event.world }));
    },
    [setState],
  );

  const stopDragging = () => {
    dragging.current = null;
  };

  const selectMetric = (metricPreset: MetricPreset) => {
    const metric =
      metricPreset === "custom" ? state.metric : metricPresets[metricPreset];
    setState((current) => ({ ...current, metricPreset, metric }));
    window.setTimeout(() => stageRef.current?.replay(), 0);
  };

  const metricValid = derived.metricAnalysis.isPositiveDefinite;
  const angleText = derived.angle
    ? `${formatNumber(derived.angle.degrees)}°`
    : "未定义";
  const formulaText =
    derived.innerProduct === null
      ? "未定义"
      : formatNumber(derived.innerProduct);

  return (
    <SceneLayout
      id="inner-product"
      index="04"
      title="内积空间"
      subtitle="重定义长度、角度与投影"
      formulaLabel="度量内积"
      formula={<>⟨u, v⟩G = uᵀGv = {formulaText}</>}
      formulaStatus={metricValid ? `θG = ${angleText}` : "G 无效"}
      formulaTone={
        !metricValid ? "negative" : derived.angle ? "positive" : "warning"
      }
      insight={
        !metricValid ? (
          <>
            <strong>有效内积要求 G 对称正定。</strong>{" "}
            当前矩阵无法定义所有非零向量的正长度。
          </>
        ) : state.mode === "projection" ? (
          <>
            <strong>残差与投影方向在 G 度量下正交。</strong> 改变 G
            会改变“最近点”的几何含义。
          </>
        ) : (
          <>
            <strong>Gram–Schmidt 逐步移除已有方向分量。</strong> 输出向量在 G
            度量下单位正交。
          </>
        )
      }
      stage={
        <VisualizationStage
          key={isMobile ? "mobile" : "desktop"}
          ref={stageRef}
          render={render}
          renderKey={state}
          viewport={{
            scale: isMobile ? 54 : 78,
            center: isMobile ? [0, 0.3] : [0, 0],
          }}
          duration={1050}
          ariaLabel="内积度量下的向量夹角、投影和正交化"
          fallbackDescription={`向量 u=${formatVector(state.first)}，v=${formatVector(state.second)}，内积为 ${formulaText}。`}
          showExportButton
          exportFilename="basis-lab-inner-product.png"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={stopDragging}
          onPointerCancel={stopDragging}
        />
      }
      inspector={
        <>
          <ControlSection
            title="向量与模式"
            caption="端点可在画布中直接拖动"
            action={
              <IconButton label="恢复默认内积实验" onClick={resetState}>
                <RotateCcw size={15} />
              </IconButton>
            }
          >
            <SegmentedControl
              label="内积实验模式"
              value={state.mode}
              options={[
                { value: "projection", label: "投影" },
                { value: "gram-schmidt", label: "Gram–Schmidt" },
              ]}
              onChange={(mode) => {
                setState((current) => ({ ...current, mode }));
                window.setTimeout(() => stageRef.current?.replay(), 0);
              }}
            />
            <VectorInput
              label="u"
              name="first"
              value={state.first}
              onChange={(first) =>
                setState((current) => ({ ...current, first }))
              }
            />
            <VectorInput
              label="v"
              name="second"
              tone="red"
              value={state.second}
              onChange={(second) =>
                setState((current) => ({ ...current, second }))
              }
            />
          </ControlSection>

          <ControlSection title="度量矩阵" caption="G 必须是对称正定矩阵">
            <SelectField
              label="内积度量"
              value={state.metricPreset}
              options={metricOptions}
              onChange={selectMetric}
            />
            <MatrixInput
              label="度量矩阵"
              symbol="G"
              value={state.metric}
              disabled={state.metricPreset !== "custom"}
              onChange={(metric) =>
                setState((current) => ({
                  ...current,
                  metricPreset: "custom",
                  metric,
                }))
              }
            />
            <Toggle
              label="显示度量单位圆"
              checked={state.showMetricCircle}
              onChange={(showMetricCircle) =>
                setState((current) => ({ ...current, showMetricCircle }))
              }
            />
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
                  value:
                    derived.firstNorm === null
                      ? "—"
                      : formatNumber(derived.firstNorm),
                  key: "norm-u",
                },
                {
                  label: "‖v‖G",
                  value:
                    derived.secondNorm === null
                      ? "—"
                      : formatNumber(derived.secondNorm),
                  key: "norm-v",
                },
                { label: "θG", value: angleText, key: "angle", tone: "yellow" },
              ]}
            />
            {!metricValid ? (
              <Notice tone="warning">当前 G 不是对称正定矩阵。</Notice>
            ) : state.mode === "gram-schmidt" &&
              derived.gramSchmidt.rank < 2 ? (
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
