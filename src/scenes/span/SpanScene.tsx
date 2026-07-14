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
import { SelectField } from "../../components/ui/SelectField";
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
  drawVector,
  getCanvasPalette,
  isWorldPointNearCanvas,
  lerpVec,
} from "../../rendering";
import { formatNumber, formatVector } from "../../utils/format";
import {
  deriveSpan,
  migrateSpanState,
  resizeSpanState,
  spanDefaults,
  spanPresets,
  type SpanVectorCount,
} from "./model";

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const vectorTones = ["cyan", "yellow", "blue", "red"] as const;
const subscripts = ["₁", "₂", "₃", "₄", "₅", "₆"] as const;
const countOptions = [1, 2, 3, 4, 5, 6].map((count) => ({
  value: String(count) as `${SpanVectorCount}`,
  label: `${count} 个向量`,
}));

function vectorLabel(index: number) {
  return `v${subscripts[index] ?? String(index + 1)}`;
}

function coefficientLabel(index: number) {
  return `c${subscripts[index] ?? String(index + 1)}`;
}

function vectorTone(index: number) {
  return vectorTones[index % vectorTones.length]!;
}

function vectorColor(
  index: number,
  palette: ReturnType<typeof getCanvasPalette>,
) {
  const colors = [palette.cyan, palette.yellow, palette.blue, palette.red];
  return colors[index % colors.length]!;
}

function formatCombination(coefficients: readonly number[]) {
  return coefficients
    .map((coefficient, index) => {
      const sign =
        index === 0
          ? coefficient < 0
            ? "−"
            : ""
          : coefficient < 0
            ? " − "
            : " + ";
      return `${sign}${formatNumber(Math.abs(coefficient))}${vectorLabel(index)}`;
    })
    .join("");
}

export function SpanScene({ theme }: SceneProps) {
  const isMobile = useMediaQuery("(max-width: 760px)");
  const [state, setState, resetState] = useLocalStorage(
    "basis-lab:span",
    spanDefaults,
    migrateSpanState,
  );
  const stageRef = useRef<VisualizationStageHandle>(null);
  const dragging = useRef<number | "target" | null>(null);
  const derived = useMemo(() => deriveSpan(state), [state]);

  const render = useCallback(
    (frame: VisualizationRenderFrame) => {
      const { ctx, viewport, width, height, easedProgress } = frame;
      const palette = getCanvasPalette(theme);
      ctx.fillStyle = palette.background;
      ctx.fillRect(0, 0, width, height);
      drawGrid(ctx, viewport, palette);
      drawAxes(ctx, viewport, palette);

      const spanProgress = clamp01((easedProgress - 0.38) / 0.62);
      const firstBasisIndex = derived.basisIndices[0];
      const secondBasisIndex = derived.basisIndices[1];
      const firstBasis =
        firstBasisIndex === undefined
          ? undefined
          : state.vectors[firstBasisIndex];
      const secondBasis =
        secondBasisIndex === undefined
          ? undefined
          : state.vectors[secondBasisIndex];

      if (
        derived.rank === 2 &&
        state.showLattice &&
        firstBasis &&
        secondBasis &&
        spanProgress > 0
      ) {
        ctx.save();
        ctx.globalAlpha = spanProgress;
        for (let coefficient = -6; coefficient <= 6; coefficient += 1) {
          const firstOffset = scaleVec2(firstBasis, coefficient);
          drawLine(
            ctx,
            viewport,
            addVec2(firstOffset, scaleVec2(secondBasis, -7)),
            addVec2(firstOffset, scaleVec2(secondBasis, 7)),
            {
              color: vectorColor(firstBasisIndex!, palette),
              width: 1,
              alpha: 0.3,
            },
          );
          const secondOffset = scaleVec2(secondBasis, coefficient);
          drawLine(
            ctx,
            viewport,
            addVec2(secondOffset, scaleVec2(firstBasis, -7)),
            addVec2(secondOffset, scaleVec2(firstBasis, 7)),
            {
              color: vectorColor(secondBasisIndex!, palette),
              width: 1,
              alpha: 0.27,
            },
          );
        }
        ctx.restore();
      } else if (derived.rank === 1 && firstBasis && spanProgress > 0) {
        drawInfiniteLine(ctx, viewport, firstBasis, {
          color: vectorColor(firstBasisIndex!, palette),
          width: 8,
          alpha: 0.11 * spanProgress,
        });
        drawInfiniteLine(ctx, viewport, firstBasis, {
          color: vectorColor(firstBasisIndex!, palette),
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

      const basisSet = new Set(derived.basisIndices);
      state.vectors.forEach((vector, index) => {
        const revealProgress = clamp01(easedProgress * 1.7 - index * 0.11);
        const animated = lerpVec([0, 0], vector, revealProgress);
        const color = vectorColor(index, palette);
        drawVector(ctx, viewport, animated, {
          color,
          label: vectorLabel(index),
          width: basisSet.has(index) ? 3 : 2,
          alpha: basisSet.has(index) ? 1 : 0.78,
        });
        drawPoint(
          ctx,
          viewport,
          vector,
          color,
          basisSet.has(index) ? 4.5 : 3.5,
          true,
          palette.background,
        );
      });

      if (easedProgress > 0.58) {
        const combinationProgress = clamp01((easedProgress - 0.58) / 0.42);
        let origin: Vec2 = [0, 0];
        state.vectors.forEach((vector, index) => {
          const contribution = scaleVec2(
            vector,
            (state.coefficients[index] ?? 0) * combinationProgress,
          );
          if (Math.hypot(contribution[0], contribution[1]) > 1e-8) {
            drawVector(ctx, viewport, contribution, {
              color: vectorColor(index, palette),
              label: `${coefficientLabel(index)}${vectorLabel(index)}`,
              origin,
              width: 1.7,
              alpha: 0.72,
            });
          }
          origin = addVec2(origin, contribution);
        });
        drawVector(ctx, viewport, origin, {
          color: palette.red,
          label: "Σcᵢvᵢ",
          labelOffset: [8, 18],
          width: 2.8,
        });
      }

      if (state.showTarget) {
        drawVector(ctx, viewport, state.target, {
          color: palette.neutral,
          label: "目标",
          width: 1.8,
          dash: [5, 4],
        });
        drawPoint(
          ctx,
          viewport,
          state.target,
          palette.neutral,
          4,
          true,
          palette.background,
        );
      }
    },
    [derived.basisIndices, derived.rank, state, theme],
  );

  const onPointerDown = useCallback(
    (event: VisualizationPointerEvent) => {
      const vectorIndex = state.vectors.findIndex((point) =>
        isWorldPointNearCanvas(point, event.canvas, event.viewport),
      );
      if (vectorIndex >= 0) {
        dragging.current = vectorIndex;
        return true;
      }
      if (
        state.showTarget &&
        isWorldPointNearCanvas(state.target, event.canvas, event.viewport)
      ) {
        dragging.current = "target";
        return true;
      }
      return false;
    },
    [state.showTarget, state.target, state.vectors],
  );

  const onPointerMove = useCallback(
    (event: VisualizationPointerEvent) => {
      const key = dragging.current;
      if (key === null) return;
      setState((current) =>
        key === "target"
          ? { ...current, target: event.world }
          : {
              ...current,
              vectors: current.vectors.map((vector, index) =>
                index === key ? event.world : vector,
              ),
            },
      );
    },
    [setState],
  );

  const stopDragging = useCallback(() => {
    dragging.current = null;
  }, []);

  const basisText =
    derived.basisIndices.length === 0
      ? "—"
      : derived.basisIndices.map(vectorLabel).join(", ");
  const solutionText =
    derived.targetSolution.kind === "unique"
      ? `${basisText}: (${formatNumber(derived.targetSolution.solution[0])}, ${formatNumber(derived.targetSolution.solution[1])})`
      : derived.targetSolution.kind === "infinite"
        ? "可表示（非唯一）"
        : "不可表示";
  const combinationFormula = formatCombination(state.coefficients);

  return (
    <SceneLayout
      id="span"
      index="01"
      title="向量张成"
      subtitle={`${state.vectors.length} 个 R² 向量 · 自动提取独立方向`}
      formulaLabel="线性组合"
      formula={
        <>
          {combinationFormula} = {formatVector(derived.combination)}
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
            <strong>{basisText} 是按输入顺序选出的平面基。</strong>{" "}
            其余向量不改变张成空间，但会参与当前线性组合。
          </>
        ) : derived.rank === 1 ? (
          <>
            <strong>当前向量组只提供一个独立方向。</strong>{" "}
            所有线性组合仍停留在同一直线上。
          </>
        ) : (
          <>
            <strong>当前向量组没有非零方向。</strong> 所有线性组合都停留在原点。
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
          ariaLabel={`${state.vectors.length} 个向量逐步张成原点、直线或平面并形成线性组合`}
          fallbackDescription={`${state.vectors.map(formatVector).join("、")} 的张成空间是${derived.classification}；自动基为 ${basisText}。`}
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
            title="生成向量组"
            caption="端点可在画布中拖动；基向量按输入顺序稳定选取"
            action={
              <IconButton
                label="恢复默认向量组"
                onClick={() => {
                  resetState();
                  window.setTimeout(() => stageRef.current?.replay(), 0);
                }}
              >
                <RotateCcw size={15} />
              </IconButton>
            }
          >
            <SelectField
              label="向量数量"
              value={String(state.vectors.length) as `${SpanVectorCount}`}
              options={countOptions}
              onChange={(value) => {
                stopDragging();
                setState((current) =>
                  resizeSpanState(current, Number(value) as SpanVectorCount),
                );
              }}
            />
            {state.vectors.map((vector, index) => (
              <VectorInput
                key={index}
                label={vectorLabel(index)}
                name={`vector-${index + 1}`}
                tone={vectorTone(index)}
                value={vector}
                onChange={(next) =>
                  setState((current) => ({
                    ...current,
                    vectors: current.vectors.map((entry, vectorIndex) =>
                      vectorIndex === index ? next : entry,
                    ),
                  }))
                }
              />
            ))}
            <PresetGrid
              label="张成空间预设"
              presets={spanPresets.map((preset) => ({
                label: preset.label,
                value: preset,
              }))}
              onSelect={(preset) => {
                stopDragging();
                setState((current) => ({
                  ...current,
                  vectors: preset.vectors.map((vector) => [...vector] as Vec2),
                  coefficients: [...preset.coefficients],
                }));
                window.setTimeout(() => stageRef.current?.replay(), 0);
              }}
            />
          </ControlSection>

          <ControlSection title="组合系数" caption="每个系数与同序号向量配对">
            {state.coefficients.map((coefficient, index) => (
              <RangeField
                key={index}
                label={`${coefficientLabel(index)} · ${vectorLabel(index)}`}
                value={coefficient}
                min={-3}
                max={3}
                step={0.05}
                tone={vectorTone(index)}
                onChange={(next) =>
                  setState((current) => ({
                    ...current,
                    coefficients: current.coefficients.map(
                      (entry, coefficientIndex) =>
                        coefficientIndex === index ? next : entry,
                    ),
                  }))
                }
              />
            ))}
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
                  label: "自动基",
                  value: basisText,
                  key: "basis-indices",
                  tone: "cyan",
                },
                {
                  label: "det[basis]",
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
            {derived.rank === 2 ? (
              <Notice tone="success">
                自动选出的 {basisText} 构成 R² 的一组基。
              </Notice>
            ) : (
              <Notice tone="warning">当前向量组不是 R² 的基。</Notice>
            )}
          </ControlSection>
        </>
      }
    />
  );
}
