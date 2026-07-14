import { useCallback, useMemo, useRef } from "react";
import { RotateCcw } from "lucide-react";
import type { SceneProps } from "../../app/types";
import {
  IDENTITY_MAT2,
  basisMatrix,
  columnsOfMat2,
  interpolateMat2,
  type Mat2,
  type Vec2,
} from "../../math";
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
import { PresetGrid } from "../../components/ui/PresetGrid";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { Toggle } from "../../components/ui/Toggle";
import { VectorInput } from "../../components/ui/VectorInput";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import {
  drawAxes,
  drawGrid,
  drawLine,
  drawPoint,
  drawTransformedCircle,
  drawTransformedGrid,
  drawVector,
  getCanvasPalette,
  isWorldPointNearCanvas,
} from "../../rendering";
import { formatNumber, formatVector } from "../../utils/format";
import { deriveTransform, transformDefaults, transformPresets } from "./model";

function paintBackground(
  frame: VisualizationRenderFrame,
  theme: SceneProps["theme"],
) {
  const palette = getCanvasPalette(theme);
  frame.ctx.fillStyle = palette.background;
  frame.ctx.fillRect(0, 0, frame.width, frame.height);
  return palette;
}

export function TransformScene({ theme }: SceneProps) {
  const isMobile = useMediaQuery("(max-width: 760px)");
  const [state, setState, resetState] = useLocalStorage(
    "basis-lab:transform",
    transformDefaults,
  );
  const stageRef = useRef<VisualizationStageHandle>(null);
  const dragging = useRef<"vector" | null>(null);
  const derived = useMemo(() => deriveTransform(state), [state]);

  const render = useCallback(
    (frame: VisualizationRenderFrame) => {
      const palette = paintBackground(frame, theme);
      const { ctx, viewport, easedProgress } = frame;

      drawGrid(ctx, viewport, palette);
      drawAxes(ctx, viewport, palette);

      if (!derived.valid || derived.matrix === null) {
        drawVector(ctx, viewport, state.basis[0], {
          color: palette.blue,
          label: "b₁",
          width: 2,
          dash: [5, 4],
        });
        drawVector(ctx, viewport, state.basis[1], {
          color: palette.yellow,
          label: "b₂",
          width: 2,
          dash: [5, 4],
        });
        drawVector(ctx, viewport, state.vector, {
          color: palette.cyan,
          label: "v",
          width: 2.4,
        });
        drawPoint(
          ctx,
          viewport,
          state.vector,
          palette.cyan,
          4,
          true,
          palette.background,
        );
        return;
      }

      const animatedMatrix = interpolateMat2(
        IDENTITY_MAT2,
        derived.matrix,
        easedProgress,
      );

      if (state.showGrid) {
        drawTransformedGrid(
          ctx,
          viewport,
          animatedMatrix,
          palette.red,
          7,
          1,
          0.5,
        );
      }

      if (state.showCircle) {
        drawTransformedCircle(
          ctx,
          viewport,
          IDENTITY_MAT2,
          palette.neutral,
          undefined,
        );
        drawTransformedCircle(
          ctx,
          viewport,
          animatedMatrix,
          palette.red,
          palette.redFill,
        );
      }

      if (state.basisMode === "custom" && derived.basisAnalysis.isBasis) {
        drawVector(ctx, viewport, state.basis[0], {
          color: palette.blue,
          label: "b₁",
          width: 1.5,
          dash: [5, 4],
          alpha: 0.8,
        });
        drawVector(ctx, viewport, state.basis[1], {
          color: palette.yellow,
          label: "b₂",
          width: 1.5,
          dash: [5, 4],
          alpha: 0.8,
        });
      }

      const animatedOutput: Vec2 = [
        animatedMatrix[0] * state.vector[0] +
          animatedMatrix[1] * state.vector[1],
        animatedMatrix[2] * state.vector[0] +
          animatedMatrix[3] * state.vector[1],
      ];

      if (state.showTrail) {
        const points = 28;
        let previous = state.vector;
        for (let index = 1; index <= points; index += 1) {
          const progress = (index / points) * easedProgress;
          const sample = interpolateMat2(
            IDENTITY_MAT2,
            derived.matrix,
            progress,
          );
          const next: Vec2 = [
            sample[0] * state.vector[0] + sample[1] * state.vector[1],
            sample[2] * state.vector[0] + sample[3] * state.vector[1],
          ];
          drawLine(ctx, viewport, previous, next, {
            color: palette.red,
            width: 1.2,
            alpha: 0.18 + 0.55 * (index / points),
          });
          previous = next;
        }
      }

      drawVector(ctx, viewport, state.vector, {
        color: palette.cyan,
        label: "v",
        dash: [5, 4],
        width: 1.7,
        alpha: 0.9,
      });
      drawVector(ctx, viewport, animatedOutput, {
        color: palette.red,
        label: easedProgress < 0.99 ? "Tₜv" : "Av",
        width: 2.8,
      });
      drawPoint(
        ctx,
        viewport,
        state.vector,
        palette.cyan,
        4,
        true,
        palette.background,
      );

      const firstColumn: Vec2 = [animatedMatrix[0], animatedMatrix[2]];
      const secondColumn: Vec2 = [animatedMatrix[1], animatedMatrix[3]];
      drawVector(ctx, viewport, firstColumn, {
        color: palette.cyan,
        label: "Ae₁",
        width: 2.2,
      });
      drawVector(ctx, viewport, secondColumn, {
        color: palette.yellow,
        label: "Ae₂",
        width: 2.2,
      });
    },
    [derived, state, theme],
  );

  const onPointerDown = useCallback(
    (event: VisualizationPointerEvent) => {
      if (isWorldPointNearCanvas(state.vector, event.canvas, event.viewport)) {
        dragging.current = "vector";
        return true;
      }
      return false;
    },
    [state.vector],
  );

  const onPointerMove = useCallback(
    (event: VisualizationPointerEvent) => {
      if (dragging.current !== "vector") return;
      setState((current) => ({ ...current, vector: event.world }));
    },
    [setState],
  );

  const stopDragging = useCallback(() => {
    dragging.current = null;
  }, []);

  const selectPreset = (matrix: Mat2) => {
    setState((current) => ({ ...current, matrix }));
    window.setTimeout(() => stageRef.current?.replay(), 0);
  };

  const updateBasisMatrix = (matrix: Mat2) => {
    const basis = columnsOfMat2(matrix);
    setState((current) => ({ ...current, basis }));
  };

  const outputText =
    derived.output === null ? "—" : formatVector(derived.output);
  const determinantText =
    derived.determinant === null ? "—" : formatNumber(derived.determinant);
  const traceText = derived.trace === null ? "—" : formatNumber(derived.trace);

  const formulaTone =
    !derived.valid || derived.rank === null || derived.rank < 2
      ? "negative"
      : derived.determinant !== null && derived.determinant < 0
        ? "warning"
        : "positive";

  return (
    <SceneLayout
      id="transform"
      index="02"
      title="线性变换"
      subtitle="观察矩阵如何重塑空间"
      formulaLabel="映射结果"
      formula={<>A · v = {outputText}</>}
      formulaStatus={
        derived.valid ? `${derived.orientation}定向` : "换基不可用"
      }
      formulaTone={formulaTone}
      insight={
        !derived.valid ? (
          derived.basisAnalysis.isBasis ? (
            <>
              <strong>这组向量在数学上独立，但数值条件过差。</strong>{" "}
              当前精度下无法稳定完成 B A B⁻¹ 换基。
            </>
          ) : (
            <>
              <strong>当前向量组不能构成坐标基。</strong>{" "}
              有效坐标系要求两条基向量线性无关。
            </>
          )
        ) : derived.rank !== null && derived.rank < 2 ? (
          <>
            <strong>空间维数被压低。</strong>{" "}
            至少一个方向的信息在变换后不可恢复。
          </>
        ) : (
          <>
            <strong>每条平行线仍保持平行。</strong>{" "}
            网格可以剪切、旋转和缩放，但原点保持不动。
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
            scale: isMobile ? 50 : 67,
            center: isMobile ? [0, 0.3] : [0, 0],
          }}
          duration={1050}
          ariaLabel="线性变换的网格、单位圆、基向量和测试向量"
          fallbackDescription={
            derived.valid
              ? `矩阵把向量 ${formatVector(state.vector)} 映射到 ${outputText}。`
              : "自定义基无效，变换结果未定义。"
          }
          showExportButton
          exportFilename="basis-lab-transform.png"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={stopDragging}
          onPointerCancel={stopDragging}
        />
      }
      inspector={
        <>
          <ControlSection
            title="变换矩阵"
            caption={
              state.basisMode === "custom"
                ? "当前矩阵按自定义基坐标解释"
                : "按标准坐标解释"
            }
            action={
              <IconButton
                label="恢复默认变换"
                onClick={() => {
                  resetState();
                  stageRef.current?.seek(1);
                }}
              >
                <RotateCcw size={15} />
              </IconButton>
            }
          >
            <MatrixInput
              label="变换矩阵"
              value={state.matrix}
              onChange={(matrix) =>
                setState((current) => ({ ...current, matrix }))
              }
            />
            <PresetGrid
              label="变换预设"
              presets={transformPresets}
              onSelect={selectPreset}
            />
          </ControlSection>

          <ControlSection
            title="坐标基"
            caption="自定义基使用 B A B⁻¹ 还原标准坐标映射"
          >
            <SegmentedControl
              label="坐标基模式"
              value={state.basisMode}
              options={[
                { value: "standard", label: "标准基" },
                { value: "custom", label: "自定义基" },
              ]}
              onChange={(basisMode) =>
                setState((current) => ({ ...current, basisMode }))
              }
            />
            {state.basisMode === "custom" && (
              <MatrixInput
                label="基矩阵"
                symbol="B"
                value={basisMatrix(state.basis)}
                onChange={updateBasisMatrix}
              />
            )}
            {state.basisMode === "custom" && !derived.valid && (
              <Notice tone="warning">
                基向量线性相关或数值上过度病态，无法稳定建立坐标映射。
              </Notice>
            )}
          </ControlSection>

          <ControlSection title="测试向量" caption="端点可在画布中直接拖动">
            <VectorInput
              label="v"
              name="sample"
              value={state.vector}
              onChange={(vector) =>
                setState((current) => ({ ...current, vector }))
              }
            />
            <div className="toggle-grid">
              <Toggle
                label="变形网格"
                checked={state.showGrid}
                onChange={(showGrid) =>
                  setState((current) => ({ ...current, showGrid }))
                }
              />
              <Toggle
                label="单位圆"
                checked={state.showCircle}
                onChange={(showCircle) =>
                  setState((current) => ({ ...current, showCircle }))
                }
              />
              <Toggle
                label="向量轨迹"
                checked={state.showTrail}
                onChange={(showTrail) =>
                  setState((current) => ({ ...current, showTrail }))
                }
              />
            </div>
          </ControlSection>

          <ControlSection title="变换读数">
            <MetricList
              metrics={[
                {
                  label: "det A",
                  value: determinantText,
                  key: "determinant",
                  tone:
                    derived.determinant !== null && derived.determinant < 0
                      ? "red"
                      : "cyan",
                },
                {
                  label: "tr A",
                  value: traceText,
                  key: "trace",
                },
                {
                  label: "rank A",
                  value: derived.rank === null ? "—" : String(derived.rank),
                  key: "rank",
                },
                {
                  label: "Av",
                  value: outputText,
                  key: "output",
                  tone: "red",
                },
              ]}
            />
          </ControlSection>
        </>
      }
    />
  );
}
