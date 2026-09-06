import { lazy, Suspense, useCallback, useEffect, useMemo, useRef } from "react";
import { RotateCcw } from "lucide-react";
import type { SceneProps } from "../../app/types";
import {
  IDENTITY_MAT2,
  applyMat2,
  interpolateMat2,
  type Mat2,
  type Vec2,
} from "../../math";
import type { Dimension, RealMatrix } from "../../math/nd";
import {
  VisualizationStage,
  type VisualizationPointerEvent,
  type VisualizationRenderFrame,
  type VisualizationStageHandle,
} from "../../components/VisualizationStage";
import { SceneLayout } from "../../components/SceneLayout";
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
import { OrderedRealBasisInput } from "../../components/ui/OrderedRealBasisInput";
import { PresetGrid } from "../../components/ui/PresetGrid";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { SelectField } from "../../components/ui/SelectField";
import { Toggle } from "../../components/ui/Toggle";
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
import { formatNumber } from "../../utils/format";
import { formatRealVector } from "../../utils/formatLinear";
import {
  changeTransformBasisMode,
  changeTransformSharedBasis,
  deriveTransform,
  migrateTransformState,
  rectangularIdentity,
  resizeTransformState,
  transformDefaults,
  transformPresetsForShape,
  type TransformDirection,
  type TransformMode,
} from "./model";
import type { ThreeTransformStageHandle } from "./ThreeTransformStage";

const ThreeTransformStage = lazy(() =>
  import("./ThreeTransformStage").then((module) => ({
    default: module.ThreeTransformStage,
  })),
);

const dimensionOptions = [
  { value: "1", label: "1 维" },
  { value: "2", label: "2 维" },
  { value: "3", label: "3 维" },
] as const;

function toDimension(value: "1" | "2" | "3"): Dimension {
  return Number(value) as Dimension;
}

function toMatrixInput(
  matrix: RealMatrix,
  rows: Dimension,
  columns: Dimension,
): DynamicMatrixValue {
  return { rows, columns, entries: matrix.flat() };
}

function fromMatrixInput(value: DynamicMatrixValue): RealMatrix {
  return Array.from({ length: value.rows }, (_, row) =>
    Array.from(
      { length: value.columns },
      (_, column) => value.entries[row * value.columns + column] ?? 0,
    ),
  );
}

function toVectorInput(
  entries: readonly number[],
  dimension: Dimension,
): DynamicVectorValue {
  return { dimension, entries };
}

function toMat2(matrix: RealMatrix): Mat2 {
  return [
    matrix[0]?.[0] ?? 0,
    matrix[0]?.[1] ?? 0,
    matrix[1]?.[0] ?? 0,
    matrix[1]?.[1] ?? 0,
  ];
}

function toVec2(vector: readonly number[]): Vec2 {
  return [vector[0] ?? 0, vector[1] ?? 0];
}

function basisColumn(matrix: RealMatrix, column: number): Vec2 {
  return [matrix[0]?.[column] ?? 0, matrix[1]?.[column] ?? 0];
}

function interpolateTransformStage(
  target: Mat2,
  intermediate: Mat2 | null,
  progress: number,
) {
  if (!intermediate) return interpolateMat2(IDENTITY_MAT2, target, progress);
  return progress <= 0.5
    ? interpolateMat2(IDENTITY_MAT2, intermediate, progress * 2)
    : interpolateMat2(intermediate, target, (progress - 0.5) * 2);
}

function observedTransformOutput(values: readonly number[]) {
  return values.map((value) => Number(value.toFixed(6))).join(",");
}

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
    migrateTransformState,
  );
  const stageRef = useRef<VisualizationStageHandle>(null);
  const threeStageRef = useRef<ThreeTransformStageHandle>(null);
  const dragging = useRef<"vector" | null>(null);
  const derived = useMemo(() => deriveTransform(state), [state]);
  const usesThree = state.rows === 3 || state.columns === 3;
  const activeCodomainBasis =
    state.sharedBasis && state.rows === state.columns
      ? state.domainBasis
      : state.codomainBasis;
  const presets = useMemo(
    () => transformPresetsForShape(state.rows, state.columns),
    [state.columns, state.rows],
  );

  useEffect(() => {
    if (state.direction === "inverse" && !derived.inverseAvailable) {
      setState((current) => ({ ...current, direction: "forward" }));
    }
  }, [derived.inverseAvailable, setState, state.direction]);

  const replay = useCallback(() => {
    if (usesThree) threeStageRef.current?.replay();
    else stageRef.current?.replay();
  }, [usesThree]);

  const render = useCallback(
    (frame: VisualizationRenderFrame) => {
      const palette = paintBackground(frame, theme);
      const { ctx, viewport, easedProgress } = frame;
      drawGrid(ctx, viewport, palette);
      drawAxes(ctx, viewport, palette);
      ctx.canvas.dataset.transformBasisImages = state.showBasisImages
        ? "visible"
        : "hidden";

      const sourceVector = toVec2(state.vector);
      if (!derived.valid || derived.matrix === null) {
        delete ctx.canvas.dataset.transformOutput;
        drawVector(ctx, viewport, sourceVector, {
          color: palette.cyan,
          label: "v",
          width: 2.4,
        });
        return;
      }

      const target = toMat2(derived.matrix);
      const intermediate = derived.stageOneMatrix
        ? toMat2(derived.stageOneMatrix)
        : null;
      const animatedMatrix = interpolateTransformStage(
        target,
        intermediate,
        easedProgress,
      );

      if (state.showGrid) {
        if (state.columns === 2) {
          drawTransformedGrid(
            ctx,
            viewport,
            animatedMatrix,
            palette.red,
            7,
            1,
            0.5,
          );
        } else {
          drawLine(
            ctx,
            viewport,
            applyMat2(animatedMatrix, [-7, 0]),
            applyMat2(animatedMatrix, [7, 0]),
            { color: palette.red, width: 1.6, alpha: 0.8 },
          );
        }
      }

      if (state.showSphere) {
        if (state.columns === 2) {
          drawTransformedCircle(ctx, viewport, IDENTITY_MAT2, palette.neutral);
          drawTransformedCircle(
            ctx,
            viewport,
            animatedMatrix,
            palette.red,
            palette.redFill,
          );
        } else {
          drawLine(ctx, viewport, [-1, 0], [1, 0], {
            color: palette.neutral,
            width: 1.6,
          });
          drawLine(
            ctx,
            viewport,
            applyMat2(animatedMatrix, [-1, 0]),
            applyMat2(animatedMatrix, [1, 0]),
            { color: palette.red, width: 2.5 },
          );
        }
      }

      if (state.showBasisImages) {
        for (let column = 0; column < state.columns; column += 1) {
          drawVector(ctx, viewport, basisColumn(derived.matrix, column), {
            color: column === 0 ? palette.cyan : palette.yellow,
            label: "Te" + String(column + 1),
            labelOffset: [8, 16],
            width: 3.4,
            dash: [2, 5],
            alpha: 0.42,
            headSize: 8,
          });
        }
      }

      if (state.basisMode === "custom") {
        for (let index = 0; index < state.columns; index += 1) {
          const source = basisColumn(state.domainBasis, index);
          drawVector(ctx, viewport, source, {
            color: index === 0 ? palette.blue : palette.yellow,
            label: "v" + String(index + 1),
            width: 1.4,
            dash: [5, 4],
            alpha: 0.72,
          });
          if (derived.firstForwardMatrix) {
            const stageOne = applyMat2(
              toMat2(derived.firstForwardMatrix),
              source,
            );
            drawVector(ctx, viewport, stageOne, {
              color: palette.cyan,
              label: "T₁(v" + String(index + 1) + ")",
              width: 1.7,
              alpha: 0.8,
            });
            if (derived.compositionEnabled && derived.forwardMatrix) {
              drawVector(
                ctx,
                viewport,
                applyMat2(toMat2(derived.forwardMatrix), source),
                {
                  color: palette.red,
                  label: "T₂T₁(v" + String(index + 1) + ")",
                  width: 2,
                },
              );
            }
          }
        }
        for (let index = 0; index < state.rows; index += 1) {
          drawVector(ctx, viewport, basisColumn(activeCodomainBasis, index), {
            color: index === 0 ? palette.cyan : palette.neutral,
            label: "w" + String(index + 1),
            width: 1.3,
            dash: [2, 4],
            alpha: 0.65,
          });
        }
      }

      const animatedOutput = applyMat2(animatedMatrix, sourceVector);
      ctx.canvas.dataset.transformOutput =
        observedTransformOutput(animatedOutput);
      ctx.canvas.dataset.transformBasisPath =
        state.basisMode === "custom" && derived.compositionEnabled
          ? "v_i->T1(v_i)->T2T1(v_i)"
          : state.basisMode === "custom"
            ? "v_i->T(v_i)"
            : "standard";
      if (state.showTrail) {
        const points = 28;
        let previous = sourceVector;
        for (let index = 1; index <= points; index += 1) {
          const progress = (index / points) * easedProgress;
          const sample = interpolateTransformStage(
            target,
            intermediate,
            progress,
          );
          const next = applyMat2(sample, sourceVector);
          drawLine(ctx, viewport, previous, next, {
            color: palette.red,
            width: 1.2,
            alpha: 0.18 + 0.55 * (index / points),
          });
          previous = next;
        }
      }

      drawVector(ctx, viewport, sourceVector, {
        color: palette.cyan,
        label: "v",
        dash: [5, 4],
        width: 1.7,
        alpha: 0.9,
      });
      drawVector(ctx, viewport, animatedOutput, {
        color: palette.red,
        label:
          easedProgress < 0.99
            ? "Tₜv"
            : state.direction === "inverse"
              ? "T⁻¹v"
              : "Tv",
        width: 2.8,
      });
      drawPoint(
        ctx,
        viewport,
        sourceVector,
        palette.cyan,
        4,
        true,
        palette.background,
      );
    },
    [activeCodomainBasis, derived, state, theme],
  );

  const onPointerDown = useCallback(
    (event: VisualizationPointerEvent) => {
      if (
        isWorldPointNearCanvas(
          toVec2(state.vector),
          event.canvas,
          event.viewport,
        )
      ) {
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
      setState((current) => ({
        ...current,
        vector: current.columns === 1 ? [event.world[0]] : [...event.world],
      }));
    },
    [setState],
  );

  const stopDragging = useCallback(() => {
    dragging.current = null;
  }, []);

  const selectPreset = (matrix: RealMatrix) => {
    setState((current) => ({ ...current, matrix }));
    window.setTimeout(replay, 0);
  };

  const outputText =
    derived.output === null ? "—" : formatRealVector(derived.output);
  const determinantText =
    derived.determinant === null ? "—" : formatNumber(derived.determinant);
  const traceText = derived.trace === null ? "—" : formatNumber(derived.trace);
  const conditionText =
    derived.condition === null
      ? "—"
      : Number.isFinite(derived.condition)
        ? formatNumber(derived.condition)
        : "∞";
  const basisValid =
    derived.domainBasisAnalysis.isBasis &&
    derived.codomainBasisAnalysis.isBasis;
  const formulaTone = !derived.valid
    ? "negative"
    : derived.rank !== null &&
        derived.rank < Math.min(state.rows, state.columns)
      ? "warning"
      : "positive";

  const invalidOverlay = !derived.valid ? (
    <div className="stage-invalid-overlay" role="status">
      当前基或逆映射不可用
    </div>
  ) : null;

  return (
    <SceneLayout
      id="transform"
      index="02"
      title="线性变换"
      subtitle={
        "R" +
        String(state.columns) +
        " → R" +
        String(state.rows) +
        " · 自定义矩阵、前后基与顺序复合"
      }
      formulaLabel={
        derived.compositionEnabled ? "标准坐标复合 T₂ ∘ T₁" : "标准坐标映射"
      }
      formula={
        <>
          {state.direction === "inverse" ? "T⁻¹" : "T"} · v = {outputText}
        </>
      }
      formulaStatus={
        !basisValid
          ? "换基不可用"
          : state.direction === "inverse" && !derived.inverseAvailable
            ? "逆映射不可用"
            : derived.orientation + " · rank " + String(derived.rank ?? "—")
      }
      formulaTone={formulaTone}
      insight={
        !basisValid ? (
          <>
            <strong>定义域基 B 与陪域基 C 都必须可逆。</strong> 坐标矩阵通过 C A
            B⁻¹ 还原到标准坐标。
          </>
        ) : derived.compositionEnabled ? (
          <>
            <strong>时间轴先应用 T₁，再从中间状态应用 T₂。</strong>{" "}
            复合矩阵按右到左顺序计算为 T₂T₁，反向演示则依次撤销 T₂ 与 T₁。
          </>
        ) : state.direction === "inverse" ? (
          <>
            <strong>逆映射逐步撤销原变换。</strong>{" "}
            只有方阵满秩且条件稳定时才开放 T⁻¹。
          </>
        ) : state.rows !== state.columns ? (
          <>
            <strong>矩形矩阵连接不同维数的空间。</strong> 3D
            舞台把定义域对象嵌入共同环境后展示投影或嵌入。
          </>
        ) : derived.rank !== null && derived.rank < state.columns ? (
          <>
            <strong>空间维数被压低。</strong>{" "}
            至少一个方向的信息丢失，因此不存在逆变换。
          </>
        ) : (
          <>
            <strong>前后基只改变坐标描述，不改变线性映射。</strong>{" "}
            画布始终显示标准坐标中的实际几何作用。
          </>
        )
      }
      stage={
        <div className="dimension-stage">
          {usesThree ? (
            <Suspense
              fallback={
                <div className="stage-loading" role="status">
                  正在加载三维舞台…
                </div>
              }
            >
              <ThreeTransformStage
                ref={threeStageRef}
                matrix={
                  derived.matrix ??
                  rectangularIdentity(state.rows, state.columns)
                }
                intermediateMatrix={derived.stageOneMatrix}
                basisVectors={
                  state.basisMode === "custom" ? state.domainBasis : null
                }
                basisPath={
                  state.basisMode === "custom" && derived.compositionEnabled
                    ? "v_i->T1(v_i)->T2T1(v_i)"
                    : state.basisMode === "custom"
                      ? "v_i->T(v_i)"
                      : "standard"
                }
                vector={state.vector}
                inputDimension={state.columns}
                outputDimension={state.rows}
                theme={theme}
                showGrid={state.showGrid}
                showSphere={state.showSphere}
                showTrail={state.showTrail}
                showBasisImages={state.showBasisImages}
                exportFilename="basis-lab-transform-3d.png"
              />
            </Suspense>
          ) : (
            <VisualizationStage
              key={
                (isMobile ? "mobile" : "desktop") +
                "-" +
                String(state.rows) +
                "-" +
                String(state.columns)
              }
              ref={stageRef}
              render={render}
              renderKey={state}
              viewport={{
                scale: isMobile ? 50 : 67,
                center: isMobile ? [0, 0.3] : [0, 0],
              }}
              duration={1050}
              ariaLabel={
                String(state.columns) +
                "维到" +
                String(state.rows) +
                "维线性变换"
              }
              fallbackDescription={
                derived.valid
                  ? "标准坐标映射 T 把向量 " +
                    formatRealVector(state.vector) +
                    " 映射到 " +
                    outputText +
                    "。"
                  : "坐标基或逆映射无效，变换结果未定义。"
              }
              showExportButton
              exportFilename="basis-lab-transform.png"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={stopDragging}
              onPointerCancel={stopDragging}
            />
          )}
          {invalidOverlay}
        </div>
      }
      inspector={
        <>
          <ControlSection
            title="空间与矩阵"
            caption={
              "A 是 " +
              String(state.rows) +
              " × " +
              String(state.columns) +
              " 坐标矩阵"
            }
            action={
              <IconButton
                label="恢复默认变换"
                onClick={() => {
                  resetState();
                  window.setTimeout(() => stageRef.current?.seek(1), 0);
                }}
              >
                <RotateCcw size={15} />
              </IconButton>
            }
          >
            <div className="dimension-row">
              <SelectField
                label="输出行数"
                value={String(state.rows) as "1" | "2" | "3"}
                options={dimensionOptions}
                onChange={(value) =>
                  setState((current) =>
                    resizeTransformState(
                      current,
                      toDimension(value),
                      current.columns,
                    ),
                  )
                }
              />
              <SelectField
                label="输入列数"
                value={String(state.columns) as "1" | "2" | "3"}
                options={dimensionOptions}
                onChange={(value) =>
                  setState((current) =>
                    resizeTransformState(
                      current,
                      current.rows,
                      toDimension(value),
                    ),
                  )
                }
              />
            </div>
            <SegmentedControl<TransformMode>
              label="演示模式"
              value={state.mode}
              options={[
                { value: "single", label: "单步变换" },
                {
                  value: "composition",
                  label: "顺序复合",
                  disabled: state.rows !== state.columns,
                },
              ]}
              onChange={(mode) => {
                setState((current) => ({ ...current, mode }));
                window.setTimeout(replay, 0);
              }}
            />
            {state.rows !== state.columns && (
              <Notice tone="info">
                复合演示使用同一维空间中的连续变换；矩形映射仍可单步观察。
              </Notice>
            )}
            <DynamicMatrixInput
              label={state.mode === "composition" ? "第一步矩阵" : "变换矩阵"}
              symbol={state.mode === "composition" ? "A₁" : "A"}
              value={toMatrixInput(state.matrix, state.rows, state.columns)}
              onChange={(matrix) =>
                setState((current) => ({
                  ...current,
                  matrix: fromMatrixInput(matrix),
                }))
              }
            />
            {state.mode === "composition" && (
              <DynamicMatrixInput
                label="第二步矩阵"
                symbol="A₂"
                value={toMatrixInput(
                  state.secondMatrix,
                  state.rows,
                  state.columns,
                )}
                onChange={(matrix) =>
                  setState((current) => ({
                    ...current,
                    secondMatrix: fromMatrixInput(matrix),
                  }))
                }
                testId="composition-matrix-cell"
              />
            )}
            <PresetGrid
              label={state.mode === "composition" ? "第一步预设" : "变换预设"}
              presets={presets}
              onSelect={selectPreset}
            />
            <SegmentedControl<TransformDirection>
              label="变换方向"
              value={state.direction}
              options={[
                { value: "forward", label: "正向 T" },
                {
                  value: "inverse",
                  label: "逆向 T⁻¹",
                  disabled: !derived.inverseAvailable,
                },
              ]}
              onChange={(direction) => {
                setState((current) => ({ ...current, direction }));
                window.setTimeout(replay, 0);
              }}
            />
          </ControlSection>

          <ControlSection
            advanced
            title="前后坐标基"
            caption="[T]C←B 通过 C A B⁻¹ 还原标准坐标映射"
          >
            <SegmentedControl
              label="坐标基模式"
              value={state.basisMode}
              options={[
                { value: "standard", label: "标准基" },
                { value: "custom", label: "自定义基" },
              ]}
              onChange={(basisMode) =>
                setState((current) =>
                  changeTransformBasisMode(current, basisMode),
                )
              }
            />
            {state.basisMode === "custom" && (
              <>
                {state.rows === state.columns && (
                  <Toggle
                    label="W = V，共享同一有序基"
                    checked={state.sharedBasis}
                    onChange={(sharedBasis) =>
                      setState((current) =>
                        changeTransformSharedBasis(current, sharedBasis),
                      )
                    }
                  />
                )}
                <OrderedRealBasisInput
                  label="定义域有序基"
                  symbol="v"
                  basis={state.domainBasis}
                  dimension={state.columns}
                  onChange={(domainBasis) =>
                    setState((current) => ({
                      ...current,
                      domainBasis,
                      codomainBasis: current.sharedBasis
                        ? domainBasis
                        : current.codomainBasis,
                    }))
                  }
                  testId="domain-basis-cell"
                />
                {(!state.sharedBasis || state.rows !== state.columns) && (
                  <OrderedRealBasisInput
                    label="陪域有序基"
                    symbol="w"
                    basis={state.codomainBasis}
                    dimension={state.rows}
                    onChange={(codomainBasis) =>
                      setState((current) => ({ ...current, codomainBasis }))
                    }
                    testId="codomain-basis-cell"
                  />
                )}
                {!basisValid && (
                  <Notice tone="warning">
                    基向量线性相关或数值上过度病态，无法稳定建立坐标映射。
                  </Notice>
                )}
              </>
            )}
          </ControlSection>

          <ControlSection
            title="测试向量"
            caption={
              usesThree ? "三维舞台支持鼠标环绕观察" : "端点可在画布中拖动"
            }
          >
            <DynamicVectorInput
              label="v"
              name="sample"
              value={toVectorInput(state.vector, state.columns)}
              onChange={(vector) =>
                setState((current) => ({
                  ...current,
                  vector: vector.entries,
                }))
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
                label="单位球 / 圆"
                checked={state.showSphere}
                onChange={(showSphere) =>
                  setState((current) => ({ ...current, showSphere }))
                }
              />
              <Toggle
                label="向量轨迹"
                checked={state.showTrail}
                onChange={(showTrail) =>
                  setState((current) => ({ ...current, showTrail }))
                }
              />
              <Toggle
                label="标准基像 Teᵢ"
                checked={state.showBasisImages}
                onChange={(showBasisImages) =>
                  setState((current) => ({ ...current, showBasisImages }))
                }
              />
            </div>
          </ControlSection>

          <ControlSection advanced title="变换读数">
            <MetricList
              metrics={[
                {
                  label: "det T",
                  value: determinantText,
                  key: "determinant",
                  tone:
                    derived.determinant !== null && derived.determinant < 0
                      ? "red"
                      : "cyan",
                },
                { label: "tr T", value: traceText, key: "trace" },
                {
                  label: "rank T",
                  value:
                    derived.valid && derived.rank !== null
                      ? String(derived.rank)
                      : "—",
                  key: "rank",
                },
                { label: "κ₂(T)", value: conditionText, key: "condition" },
                {
                  label: state.direction === "inverse" ? "T⁻¹v" : "Tv",
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
