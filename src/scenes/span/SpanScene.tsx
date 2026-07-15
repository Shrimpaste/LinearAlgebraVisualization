import { lazy, Suspense, useCallback, useMemo, useRef } from "react";
import { RotateCcw } from "lucide-react";
import type { SceneProps } from "../../app/types";
import type { Dimension, RealVector } from "../../math/nd";
import {
  VisualizationStage,
  type VisualizationPointerEvent,
  type VisualizationRenderFrame,
  type VisualizationStageHandle,
} from "../../components/VisualizationStage";
import { SceneLayout } from "../../components/SceneLayout";
import { ControlSection } from "../../components/ui/ControlSection";
import { DynamicVectorInput } from "../../components/ui/DynamicVectorInput";
import { IconButton } from "../../components/ui/IconButton";
import { MetricList } from "../../components/ui/MetricList";
import { Notice } from "../../components/ui/Notice";
import { RangeField } from "../../components/ui/RangeField";
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
  drawVector,
  getCanvasPalette,
  isWorldPointNearCanvas,
  lerpVec,
} from "../../rendering";
import { formatNumber } from "../../utils/format";
import { formatRealVector } from "../../utils/formatLinear";
import {
  deriveSpan,
  migrateSpanState,
  resizeSpanDimension,
  resizeSpanState,
  spanDefaults,
  type SpanVectorCount,
} from "./model";
import type { ThreeSpanStageHandle } from "./ThreeSpanStage";

const ThreeSpanStage = lazy(() =>
  import("./ThreeSpanStage").then((module) => ({
    default: module.ThreeSpanStage,
  })),
);
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const vectorTones = ["cyan", "yellow", "blue", "red"] as const;
const subscripts = ["₁", "₂", "₃", "₄", "₅", "₆"] as const;
const countOptions = [1, 2, 3, 4, 5, 6].map((count) => ({
  value: String(count) as `${SpanVectorCount}`,
  label: `${count} 个向量`,
}));
const dimensionOptions = [1, 2, 3].map((dimension) => ({
  value: String(dimension) as `${Dimension}`,
  label: `R${dimension}`,
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
  return [palette.cyan, palette.yellow, palette.blue, palette.red][index % 4]!;
}
function asCanvasVector(
  vector: RealVector,
  dimension: Dimension,
): readonly [number, number] {
  return [vector[0] ?? 0, dimension === 1 ? 0 : (vector[1] ?? 0)];
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
  const threeStageRef = useRef<ThreeSpanStageHandle>(null);
  const dragging = useRef<number | "target" | null>(null);
  const derived = useMemo(() => deriveSpan(state), [state]);
  const usesThree = state.dimension === 3;

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
      const spanProgress = clamp01((easedProgress - 0.35) / 0.65);
      const firstIndex = derived.basisIndices[0];
      const secondIndex = derived.basisIndices[1];
      const first =
        firstIndex === undefined
          ? undefined
          : asCanvasVector(state.vectors[firstIndex]!, state.dimension);
      const second =
        secondIndex === undefined
          ? undefined
          : asCanvasVector(state.vectors[secondIndex]!, state.dimension);
      if (
        derived.rank === 2 &&
        state.showLattice &&
        first &&
        second &&
        spanProgress > 0
      ) {
        ctx.save();
        ctx.globalAlpha = spanProgress;
        for (let coefficient = -6; coefficient <= 6; coefficient += 1) {
          const firstOffset: [number, number] = [
            first[0] * coefficient,
            first[1] * coefficient,
          ];
          drawLine(
            ctx,
            viewport,
            [firstOffset[0] - second[0] * 7, firstOffset[1] - second[1] * 7],
            [firstOffset[0] + second[0] * 7, firstOffset[1] + second[1] * 7],
            { color: vectorColor(firstIndex!, palette), width: 1, alpha: 0.3 },
          );
          const secondOffset: [number, number] = [
            second[0] * coefficient,
            second[1] * coefficient,
          ];
          drawLine(
            ctx,
            viewport,
            [secondOffset[0] - first[0] * 7, secondOffset[1] - first[1] * 7],
            [secondOffset[0] + first[0] * 7, secondOffset[1] + first[1] * 7],
            {
              color: vectorColor(secondIndex!, palette),
              width: 1,
              alpha: 0.27,
            },
          );
        }
        ctx.restore();
      } else if (derived.rank === 1 && first && spanProgress > 0) {
        drawInfiniteLine(ctx, viewport, first, {
          color: vectorColor(firstIndex!, palette),
          width: 8,
          alpha: 0.11 * spanProgress,
        });
        drawInfiniteLine(ctx, viewport, first, {
          color: vectorColor(firstIndex!, palette),
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
        const point = asCanvasVector(vector, state.dimension);
        const reveal = clamp01(easedProgress * 1.7 - index * 0.11);
        const animated = lerpVec([0, 0], point, reveal);
        const color = vectorColor(index, palette);
        if (Math.hypot(...point) > 0) {
          drawVector(ctx, viewport, animated, {
            color,
            label: vectorLabel(index),
            width: basisSet.has(index) ? 3 : 2,
            alpha: basisSet.has(index) ? 1 : 0.72,
          });
          drawPoint(
            ctx,
            viewport,
            point,
            color,
            basisSet.has(index) ? 4.5 : 3.5,
            true,
            palette.background,
          );
        } else {
          const offset: [number, number] = [0, -14 - index * 13];
          drawPoint(
            ctx,
            viewport,
            [0, 0],
            color,
            4 + (index % 2),
            true,
            palette.background,
          );
          drawLabel(
            ctx,
            viewport,
            [0, 0],
            `${vectorLabel(index)} = 0`,
            color,
            offset,
          );
        }
      });
      if (easedProgress > 0.58) {
        const progress = clamp01((easedProgress - 0.58) / 0.42);
        let origin: [number, number] = [0, 0];
        state.vectors.forEach((vector, index) => {
          const point = asCanvasVector(vector, state.dimension);
          const coefficient = (state.coefficients[index] ?? 0) * progress;
          const contribution: [number, number] = [
            point[0] * coefficient,
            point[1] * coefficient,
          ];
          if (Math.hypot(...contribution) > 1e-12)
            drawVector(ctx, viewport, contribution, {
              color: vectorColor(index, palette),
              label: `${coefficientLabel(index)}${vectorLabel(index)}`,
              origin,
              width: 1.7,
              alpha: 0.72,
            });
          origin = [origin[0] + contribution[0], origin[1] + contribution[1]];
        });
        drawVector(ctx, viewport, origin, {
          color: palette.red,
          label: "Σcᵢvᵢ",
          labelOffset: [8, 18],
          width: 2.8,
        });
      }
      if (state.showTarget) {
        const target = asCanvasVector(state.target, state.dimension);
        drawVector(ctx, viewport, target, {
          color: palette.neutral,
          label: "目标",
          width: 1.8,
          dash: [5, 4],
        });
        drawPoint(
          ctx,
          viewport,
          target,
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
      const index = state.vectors.findIndex((vector) =>
        isWorldPointNearCanvas(
          asCanvasVector(vector, state.dimension),
          event.canvas,
          event.viewport,
        ),
      );
      if (index >= 0) {
        dragging.current = index;
        return true;
      }
      if (
        state.showTarget &&
        isWorldPointNearCanvas(
          asCanvasVector(state.target, state.dimension),
          event.canvas,
          event.viewport,
        )
      ) {
        dragging.current = "target";
        return true;
      }
      return false;
    },
    [state],
  );
  const onPointerMove = useCallback(
    (event: VisualizationPointerEvent) => {
      const key = dragging.current;
      if (key === null) return;
      const next = state.dimension === 1 ? [event.world[0]] : [...event.world];
      setState((current) =>
        key === "target"
          ? { ...current, target: next }
          : {
              ...current,
              vectors: current.vectors.map((vector, index) =>
                index === key ? next : vector,
              ),
            },
      );
    },
    [setState, state.dimension],
  );
  const stopDragging = useCallback(() => {
    dragging.current = null;
  }, []);

  const basisText =
    derived.basisIndices.length === 0
      ? "—"
      : derived.basisIndices.map(vectorLabel).join(", ");
  const solutionText =
    derived.targetSolution.kind === "none"
      ? "不可表示"
      : `${derived.targetSolution.kind === "unique" ? "唯一" : "可表示（非唯一）"} ${formatRealVector(derived.targetSolution.solution)}`;
  const fullRank = derived.rank === state.dimension;

  return (
    <SceneLayout
      id="span"
      index="01"
      title="向量张成"
      subtitle={`${state.vectors.length} 个 R${state.dimension} 向量 · 自动提取输入序最大独立子集`}
      formulaLabel="线性组合"
      formula={
        <>
          {formatCombination(state.coefficients)} ={" "}
          {formatRealVector(derived.combination)}
        </>
      }
      formulaStatus={derived.classification}
      formulaTone={
        fullRank ? "positive" : derived.rank > 0 ? "warning" : "negative"
      }
      insight={
        fullRank ? (
          <>
            <strong>{basisText} 按输入顺序构成张成空间的一组基。</strong>{" "}
            其余向量仍参与当前线性组合。
          </>
        ) : derived.rank > 0 ? (
          <>
            <strong>当前生成组张成 {derived.classification}。</strong>{" "}
            自动子集无需手动指定，并保持输入顺序。
          </>
        ) : (
          <>
            <strong>当前向量组没有非零方向。</strong> 所有线性组合都停留在原点。
          </>
        )
      }
      stage={
        <div className="dimension-stage">
          {usesThree ? (
            <Suspense
              fallback={
                <div className="stage-loading" role="status">
                  正在加载三维张成舞台…
                </div>
              }
            >
              <ThreeSpanStage
                ref={threeStageRef}
                vectors={state.vectors}
                coefficients={state.coefficients}
                basisIndices={derived.basisIndices}
                rank={derived.rank}
                target={state.target}
                showTarget={state.showTarget}
                theme={theme}
                exportFilename="basis-lab-span-3d.png"
              />
            </Suspense>
          ) : (
            <VisualizationStage
              key={`${isMobile ? "mobile" : "desktop"}-${state.dimension}`}
              ref={stageRef}
              render={render}
              renderKey={state}
              viewport={{
                scale: isMobile ? 50 : 66,
                center: isMobile ? [0, 0.55] : [0, 0],
              }}
              duration={1250}
              ariaLabel={`${state.vectors.length} 个 R${state.dimension} 向量张成${derived.classification}`}
              fallbackDescription={`${state.vectors.map(formatRealVector).join("、")} 的张成空间是${derived.classification}；自动基为 ${basisText}。`}
              showExportButton
              exportFilename="basis-lab-span.png"
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
            title="生成向量组"
            caption={
              usesThree
                ? "三维舞台支持环绕观察；独立子集按输入顺序稳定选取"
                : "端点可在画布中拖动；独立子集按输入顺序稳定选取"
            }
            action={
              <IconButton
                label="恢复默认向量组"
                onClick={() => {
                  resetState();
                  setTimeout(replay, 0);
                }}
              >
                <RotateCcw size={15} />
              </IconButton>
            }
          >
            <div className="dimension-row">
              <SelectField
                label="空间"
                value={String(state.dimension) as `${Dimension}`}
                options={dimensionOptions}
                onChange={(value) => {
                  stopDragging();
                  setState((current) =>
                    resizeSpanDimension(current, Number(value) as Dimension),
                  );
                }}
              />
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
            </div>
            {state.vectors.map((vector, index) => (
              <DynamicVectorInput
                key={index}
                label={vectorLabel(index)}
                name={`vector-${index + 1}`}
                tone={vectorTone(index)}
                value={{ dimension: state.dimension, entries: vector }}
                onChange={(next) =>
                  setState((current) => ({
                    ...current,
                    vectors: current.vectors.map((entry, vectorIndex) =>
                      vectorIndex === index ? next.entries : entry,
                    ),
                  }))
                }
              />
            ))}
          </ControlSection>
          <ControlSection
            title="组合与目标"
            caption="所有生成向量及其同序号系数都参与求和"
          >
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
            <DynamicVectorInput
              label="目标"
              name="target"
              tone="blue"
              value={{ dimension: state.dimension, entries: state.target }}
              onChange={(target) =>
                setState((current) => ({ ...current, target: target.entries }))
              }
            />
            <div className="toggle-grid">
              {state.dimension === 2 && (
                <Toggle
                  label="系数格"
                  checked={state.showLattice}
                  onChange={(showLattice) =>
                    setState((current) => ({ ...current, showLattice }))
                  }
                />
              )}
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
                  tone: fullRank ? "cyan" : "red",
                },
                {
                  label: "自动独立子集",
                  value: basisText,
                  key: "basis-indices",
                  tone: "cyan",
                },
                {
                  label: `det[basis]`,
                  value:
                    derived.determinant === null
                      ? "—"
                      : formatNumber(derived.determinant),
                  key: "determinant",
                },
                {
                  label: "span",
                  value: derived.classification,
                  key: "classification",
                  tone: "yellow",
                },
                {
                  label: "target membership",
                  value: solutionText,
                  key: "target-coordinates",
                  tone: derived.targetInSpan ? "blue" : "red",
                },
              ]}
            />
            {fullRank ? (
              <Notice tone="success">
                自动选出的 {basisText} 张成整个 R{state.dimension}。
              </Notice>
            ) : (
              <Notice tone="warning">
                当前生成组未张成整个 R{state.dimension}。
              </Notice>
            )}
          </ControlSection>
        </>
      }
    />
  );
}
