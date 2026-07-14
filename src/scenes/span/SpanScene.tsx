import { useCallback, useMemo, useRef } from "react";
import { RotateCcw } from "lucide-react";
import type { SceneProps } from "../../app/types";
import { addVec2, scaleVec2, type Vec2 } from "../../math";
import {
  VisualizationStage,
  type VisualizationPointerEvent,
  type VisualizationRenderFrame,
  type VisualizationStageHandle,
} from "../../components/VisualizationStage";
import { SceneLayout } from "../../components/SceneLayout";
import { ControlSection } from "../../components/ui/ControlSection";
import { IconButton } from "../../components/ui/IconButton";
import { MetricList } from "../../components/ui/MetricList";
import { Notice } from "../../components/ui/Notice";
import { PresetGrid } from "../../components/ui/PresetGrid";
import { RangeField } from "../../components/ui/RangeField";
import { Toggle } from "../../components/ui/Toggle";
import { VectorInput } from "../../components/ui/VectorInput";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import {
  drawAxes,
  drawGrid,
  drawInfiniteLine,
  drawLine,
  drawPoint,
  drawPolygon,
  drawVector,
  getCanvasPalette,
  isWorldPointNearCanvas,
  lerpVec,
} from "../../rendering";
import { formatNumber, formatVector } from "../../utils/format";
import { deriveSpan, spanDefaults, spanPresets } from "./model";

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export function SpanScene({ theme }: SceneProps) {
  const isMobile = useMediaQuery("(max-width: 760px)");
  const [state, setState, resetState] = useLocalStorage(
    "basis-lab:span",
    spanDefaults,
  );
  const stageRef = useRef<VisualizationStageHandle>(null);
  const dragging = useRef<"first" | "second" | "target" | null>(null);
  const derived = useMemo(() => deriveSpan(state), [state]);

  const render = useCallback(
    (frame: VisualizationRenderFrame) => {
      const { ctx, viewport, width, height, easedProgress } = frame;
      const palette = getCanvasPalette(theme);
      ctx.fillStyle = palette.background;
      ctx.fillRect(0, 0, width, height);
      drawGrid(ctx, viewport, palette);
      drawAxes(ctx, viewport, palette);

      const firstProgress = clamp01(easedProgress / 0.34);
      const secondProgress = clamp01((easedProgress - 0.18) / 0.38);
      const spanProgress = clamp01((easedProgress - 0.48) / 0.52);
      const first = lerpVec([0, 0], state.first, firstProgress);
      const second = lerpVec([0, 0], state.second, secondProgress);

      if (derived.rank === 2 && state.showLattice && spanProgress > 0) {
        ctx.save();
        ctx.globalAlpha = spanProgress;
        for (let coefficient = -6; coefficient <= 6; coefficient += 1) {
          const firstOffset = scaleVec2(state.first, coefficient);
          drawLine(
            ctx,
            viewport,
            addVec2(firstOffset, scaleVec2(state.second, -7)),
            addVec2(firstOffset, scaleVec2(state.second, 7)),
            { color: palette.cyan, width: 1, alpha: 0.32 },
          );
          const secondOffset = scaleVec2(state.second, coefficient);
          drawLine(
            ctx,
            viewport,
            addVec2(secondOffset, scaleVec2(state.first, -7)),
            addVec2(secondOffset, scaleVec2(state.first, 7)),
            { color: palette.yellow, width: 1, alpha: 0.28 },
          );
        }
        ctx.restore();
      } else if (derived.rank === 1 && spanProgress > 0) {
        const direction =
          Math.hypot(state.first[0], state.first[1]) > 1e-8
            ? state.first
            : state.second;
        drawInfiniteLine(ctx, viewport, direction, {
          color: palette.cyan,
          width: 8,
          alpha: 0.11 * spanProgress,
        });
        drawInfiniteLine(ctx, viewport, direction, {
          color: palette.cyan,
          width: 1.8,
          alpha: spanProgress,
        });
      } else if (derived.rank === 0 && spanProgress > 0) {
        drawPoint(
          ctx,
          viewport,
          [0, 0],
          palette.cyan,
          7,
          true,
          palette.background,
        );
      }

      drawVector(ctx, viewport, first, {
        color: palette.cyan,
        label: "v₁",
        width: 2.7,
      });
      drawVector(ctx, viewport, second, {
        color: palette.yellow,
        label: "v₂",
        width: 2.7,
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
        palette.yellow,
        4,
        true,
        palette.background,
      );

      if (easedProgress > 0.62) {
        const combinationProgress = clamp01((easedProgress - 0.62) / 0.38);
        const firstPart = scaleVec2(
          state.first,
          state.alpha * combinationProgress,
        );
        const secondPart = scaleVec2(
          state.second,
          state.beta * combinationProgress,
        );
        const sum = addVec2(firstPart, secondPart);
        drawPolygon(ctx, viewport, [[0, 0], firstPart, sum, secondPart], {
          fill: palette.redFill,
          stroke: palette.red,
          width: 1.3,
          alpha: 0.75,
        });
        drawVector(ctx, viewport, firstPart, {
          color: palette.cyan,
          label: "αv₁",
          labelOffset: [8, 16],
          width: 1.8,
        });
        drawVector(ctx, viewport, secondPart, {
          color: palette.yellow,
          label: "βv₂",
          width: 1.8,
          origin: firstPart,
        });
        drawVector(ctx, viewport, sum, {
          color: palette.red,
          label: "αv₁+βv₂",
          labelOffset: [8, 18],
          width: 2.8,
        });
      }

      if (state.showTarget) {
        drawVector(ctx, viewport, state.target, {
          color: palette.blue,
          label: "目标",
          width: 1.8,
          dash: [5, 4],
        });
        drawPoint(
          ctx,
          viewport,
          state.target,
          palette.blue,
          4,
          true,
          palette.background,
        );
      }
    },
    [derived.rank, state, theme],
  );

  const onPointerDown = useCallback(
    (event: VisualizationPointerEvent) => {
      const candidates: Array<["first" | "second" | "target", Vec2]> = [
        ["first", state.first],
        ["second", state.second],
      ];
      if (state.showTarget) candidates.push(["target", state.target]);
      const selected = candidates.find(([, point]) =>
        isWorldPointNearCanvas(point, event.canvas, event.viewport),
      );
      if (!selected) return false;
      dragging.current = selected[0];
      return true;
    },
    [state.first, state.second, state.showTarget, state.target],
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

  const solutionText =
    derived.targetSolution.kind === "unique"
      ? `(${formatNumber(derived.targetSolution.solution[0])}, ${formatNumber(derived.targetSolution.solution[1])})`
      : derived.targetSolution.kind === "infinite"
        ? "无限多组"
        : "不可表示";

  return (
    <SceneLayout
      id="span"
      index="01"
      title="向量张成"
      subtitle="从一个方向，到整个平面"
      formulaLabel="线性组合"
      formula={
        <>
          {formatNumber(state.alpha)}v₁ + {formatNumber(state.beta)}v₂ ={" "}
          {formatVector(derived.combination)}
        </>
      }
      formulaStatus={derived.classification}
      formulaTone={
        derived.rank === 2
          ? "positive"
          : derived.rank === 1
            ? "warning"
            : "negative"
      }
      insight={
        derived.rank === 2 ? (
          <>
            <strong>两个不共线方向张成整个平面。</strong>{" "}
            每个目标向量都有且仅有一组坐标。
          </>
        ) : derived.rank === 1 ? (
          <>
            <strong>两个向量只提供一个独立方向。</strong>{" "}
            线性组合无法离开这条直线。
          </>
        ) : (
          <>
            <strong>没有非零方向。</strong> 所有线性组合都停留在原点。
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
            scale: isMobile ? 50 : 66,
            center: isMobile ? [0, 0.55] : [0, 0],
          }}
          duration={1250}
          ariaLabel="两个向量逐步张成直线或平面并形成线性组合"
          fallbackDescription={`${formatVector(state.first)} 与 ${formatVector(state.second)} 的张成空间是${derived.classification}。`}
          showExportButton
          exportFilename="basis-lab-span.png"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={stopDragging}
          onPointerCancel={stopDragging}
        />
      }
      inspector={
        <>
          <ControlSection
            title="生成向量"
            caption="箭头端点可在画布中直接拖动"
            action={
              <IconButton label="恢复默认向量" onClick={resetState}>
                <RotateCcw size={15} />
              </IconButton>
            }
          >
            <VectorInput
              label="v₁"
              name="first"
              value={state.first}
              onChange={(first) =>
                setState((current) => ({ ...current, first }))
              }
            />
            <VectorInput
              label="v₂"
              name="second"
              tone="yellow"
              value={state.second}
              onChange={(second) =>
                setState((current) => ({ ...current, second }))
              }
            />
            <PresetGrid
              label="张成空间预设"
              presets={spanPresets.map((preset) => ({
                label: preset.label,
                value: preset,
              }))}
              onSelect={(preset) => {
                setState((current) => ({
                  ...current,
                  first: preset.first,
                  second: preset.second,
                }));
                window.setTimeout(() => stageRef.current?.replay(), 0);
              }}
            />
          </ControlSection>

          <ControlSection title="组合系数">
            <RangeField
              label="α"
              value={state.alpha}
              min={-3}
              max={3}
              step={0.05}
              onChange={(alpha) =>
                setState((current) => ({ ...current, alpha }))
              }
            />
            <RangeField
              label="β"
              value={state.beta}
              min={-3}
              max={3}
              step={0.05}
              tone="yellow"
              onChange={(beta) => setState((current) => ({ ...current, beta }))}
            />
            <VectorInput
              label="目标"
              name="target"
              tone="blue"
              value={state.target}
              onChange={(target) =>
                setState((current) => ({ ...current, target }))
              }
            />
            <div className="toggle-grid">
              <Toggle
                label="系数格"
                checked={state.showLattice}
                onChange={(showLattice) =>
                  setState((current) => ({ ...current, showLattice }))
                }
              />
              <Toggle
                label="目标向量"
                checked={state.showTarget}
                onChange={(showTarget) =>
                  setState((current) => ({ ...current, showTarget }))
                }
              />
            </div>
          </ControlSection>

          <ControlSection title="空间读数">
            <MetricList
              metrics={[
                {
                  label: "rank",
                  value: String(derived.rank),
                  key: "rank",
                  tone: derived.rank === 2 ? "cyan" : "red",
                },
                {
                  label: "det[v₁ v₂]",
                  value: formatNumber(derived.determinant),
                  key: "determinant",
                },
                {
                  label: "span",
                  value: derived.classification,
                  key: "classification",
                  tone: "yellow",
                },
                {
                  label: "target coords",
                  value: solutionText,
                  key: "target-coordinates",
                  tone: "blue",
                },
              ]}
            />
            {derived.isBasis ? (
              <Notice tone="success">v₁ 与 v₂ 构成 R² 的一组基。</Notice>
            ) : (
              <Notice tone="warning">当前向量组不是 R² 的基。</Notice>
            )}
          </ControlSection>
        </>
      }
    />
  );
}
