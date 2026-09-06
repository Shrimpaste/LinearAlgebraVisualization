import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { RotateCcw } from "lucide-react";
import type { SceneProps } from "../../app/types";
import { SceneLayout } from "../../components/SceneLayout";
import {
  VisualizationStage,
  type VisualizationRenderFrame,
  type VisualizationStageHandle,
} from "../../components/VisualizationStage";
import { ControlSection } from "../../components/ui/ControlSection";
import {
  DynamicMatrixInput,
  type DynamicMatrixValue,
} from "../../components/ui/DynamicMatrixInput";
import { IconButton } from "../../components/ui/IconButton";
import { MetricList } from "../../components/ui/MetricList";
import { Notice } from "../../components/ui/Notice";
import { PresetGrid } from "../../components/ui/PresetGrid";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { SelectField } from "../../components/ui/SelectField";
import { Toggle } from "../../components/ui/Toggle";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { applyMat2, interpolateMat2, type Mat2, type Vec2 } from "../../math";
import type { Dimension, RealMatrix } from "../../math/nd";
import {
  drawAxes,
  drawGrid,
  drawLine,
  drawTransformedCircle,
  drawTransformedGrid,
  drawVector,
  getCanvasPalette,
} from "../../rendering";
import { formatNumber } from "../../utils/format";
import {
  formatDimension,
  formatRealMatrix,
  formatRealVector,
} from "../../utils/formatLinear";
import type { ThreeTransformStageHandle } from "../transform/ThreeTransformStage";
import {
  applyDecompositionPreset,
  decompositionDefaults,
  decompositionPresets,
  deriveDecomposition,
  migrateDecompositionState,
  resizeDecompositionState,
  type DecompositionMode,
  type DecompositionStage,
  type DecompositionStageDescriptor,
} from "./model";

const ThreeTransformStage = lazy(() =>
  import("../transform/ThreeTransformStage").then((module) => ({
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

function embedMatrix2D(stage: DecompositionStageDescriptor): Mat2 {
  return [
    stage.matrix[0]?.[0] ?? 0,
    stage.inputDimension === 2 ? (stage.matrix[0]?.[1] ?? 0) : 0,
    stage.outputDimension === 2 ? (stage.matrix[1]?.[0] ?? 0) : 0,
    stage.inputDimension === 2 && stage.outputDimension === 2
      ? (stage.matrix[1]?.[1] ?? 0)
      : 0,
  ];
}

function inputEmbedding2D(dimension: Dimension): Mat2 {
  return dimension === 1 ? [1, 0, 0, 0] : [1, 0, 0, 1];
}

function sampleVector(dimension: Dimension) {
  return [1.2, 0.75, 0.5].slice(0, dimension);
}

function sampleVector2D(dimension: Dimension): Vec2 {
  return dimension === 1 ? [1.2, 0] : [1.2, 0.75];
}

function residual(value: number) {
  if (!Number.isFinite(value)) return "∞";
  if (value === 0) return "0";
  return value < 0.001 ? value.toExponential(2) : formatNumber(value);
}

function factor(label: string, matrix: RealMatrix) {
  return (
    <div className="decomposition-factor" key={label}>
      <span className="decomposition-factor__label">{label}</span>
      <code className="decomposition-factor__value">
        {formatRealMatrix(matrix)}
      </code>
    </div>
  );
}

type PendingStageAction = "replay" | "complete";

interface PlaybackStageHandle {
  replay(): void;
  seek(progress: number): void;
}

export function DecompositionScene({ theme }: SceneProps) {
  const isMobile = useMediaQuery("(max-width: 760px)");
  const [state, setState, resetState] = useLocalStorage(
    "basis-lab:decomposition",
    decompositionDefaults,
    migrateDecompositionState,
  );
  const derived = useMemo(() => deriveDecomposition(state), [state]);
  const stageRef = useRef<VisualizationStageHandle>(null);
  const threeStageRef = useRef<ThreeTransformStageHandle>(null);
  const pendingStageActionRef = useRef<PendingStageAction | null>(null);
  const [stageActionRequest, setStageActionRequest] = useState(0);
  const usesThree = state.rows === 3 || state.columns === 3;

  const runPendingStageAction = useCallback(
    (handle: PlaybackStageHandle | null) => {
      const action = pendingStageActionRef.current;
      if (!handle || !action) return;
      if (action === "replay") handle.replay();
      else handle.seek(1);
      pendingStageActionRef.current = null;
    },
    [],
  );

  const queueStageAction = useCallback((action: PendingStageAction) => {
    pendingStageActionRef.current = action;
    setStageActionRequest((current) => current + 1);
  }, []);

  const bindCanvasStage = useCallback(
    (handle: VisualizationStageHandle | null) => {
      stageRef.current = handle;
      if (!usesThree) runPendingStageAction(handle);
    },
    [runPendingStageAction, usesThree],
  );

  const bindThreeStage = useCallback(
    (handle: ThreeTransformStageHandle | null) => {
      threeStageRef.current = handle;
      if (usesThree) runPendingStageAction(handle);
    },
    [runPendingStageAction, usesThree],
  );

  useEffect(() => {
    runPendingStageAction(usesThree ? threeStageRef.current : stageRef.current);
  }, [runPendingStageAction, stageActionRequest, usesThree]);

  const render = useCallback(
    (frame: VisualizationRenderFrame) => {
      const palette = getCanvasPalette(theme);
      const { ctx, viewport, width, height, easedProgress } = frame;
      ctx.fillStyle = palette.background;
      ctx.fillRect(0, 0, width, height);
      drawGrid(ctx, viewport, palette);
      drawAxes(ctx, viewport, palette);

      const stage = derived.currentStage;
      const sourceMatrix = inputEmbedding2D(stage.inputDimension);
      const targetMatrix = embedMatrix2D(stage);
      const animated = interpolateMat2(
        sourceMatrix,
        targetMatrix,
        easedProgress,
      );

      if (state.showGrid) {
        if (stage.inputDimension === 2) {
          drawTransformedGrid(ctx, viewport, animated, palette.red, 6, 1, 0.52);
        } else {
          drawLine(
            ctx,
            viewport,
            applyMat2(animated, [-6, 0]),
            applyMat2(animated, [6, 0]),
            { color: palette.red, width: 1.7, alpha: 0.82 },
          );
        }
      }

      if (state.showSphere) {
        if (stage.inputDimension === 2) {
          drawTransformedCircle(ctx, viewport, sourceMatrix, palette.neutral);
          drawTransformedCircle(
            ctx,
            viewport,
            animated,
            palette.red,
            palette.redFill,
          );
        } else {
          drawLine(ctx, viewport, [-1, 0], [1, 0], {
            color: palette.neutral,
            width: 1.7,
          });
          drawLine(
            ctx,
            viewport,
            applyMat2(animated, [-1, 0]),
            applyMat2(animated, [1, 0]),
            { color: palette.red, width: 2.5 },
          );
        }
      }

      const source = sampleVector2D(stage.inputDimension);
      const mapped = applyMat2(animated, source);
      if (state.showTrail) {
        drawLine(ctx, viewport, source, mapped, {
          color: palette.red,
          width: 1.2,
          alpha: 0.55,
          dash: [4, 4],
        });
      }
      drawVector(ctx, viewport, source, {
        color: palette.cyan,
        label: "x",
        width: 1.7,
        dash: [5, 4],
      });
      drawVector(ctx, viewport, mapped, {
        color: palette.red,
        label: stage.symbol + "x",
        width: 2.8,
      });

      for (let column = 0; column < stage.inputDimension; column += 1) {
        const basis: Vec2 = column === 0 ? [1, 0] : [0, 1];
        drawVector(ctx, viewport, applyMat2(animated, basis), {
          color: column === 0 ? palette.yellow : palette.blue,
          label: stage.symbol + "e" + String(column + 1),
          width: 2,
        });
      }
    },
    [
      derived.currentStage,
      state.showGrid,
      state.showSphere,
      state.showTrail,
      theme,
    ],
  );

  const selectPreset = (
    preset: (typeof decompositionPresets)[number]["value"],
  ) => {
    setState((current) => applyDecompositionPreset(current, preset));
    queueStageAction("replay");
  };

  const setMode = (mode: DecompositionMode) => {
    if (mode === state.mode) return;
    setState((current) => ({ ...current, mode, stage: "output" }));
    queueStageAction("replay");
  };

  const setStage = (stage: DecompositionStage) => {
    if (stage === state.stage) return;
    setState((current) => ({ ...current, stage }));
    queueStageAction("replay");
  };

  const conditionText = Number.isFinite(derived.svd.condition)
    ? formatNumber(derived.svd.condition)
    : "∞";
  const reconstructionResidual =
    state.mode === "svd"
      ? derived.svd.reconstructionResidual
      : derived.polar.polarReconstructionResidual;
  const orthogonalityResidual =
    state.mode === "svd"
      ? derived.svd.orthogonalityResidual
      : derived.polar.polarOrthogonalityResidual;
  const formulaTone = derived.rankDeficient ? "warning" : "positive";
  const factorReadout =
    state.mode === "svd"
      ? [
          factor("U", derived.svd.U),
          factor("Σ", derived.svd.sigma),
          factor("V", derived.svd.V),
        ]
      : [factor("Q", derived.polar.Q), factor("P", derived.polar.P)];

  return (
    <SceneLayout
      id="decomposition"
      index="07"
      title="奇异值与极分解"
      subtitle={formatDimension(state.rows, state.columns) + " · 仅实数域 R"}
      formulaLabel={state.mode === "svd" ? "奇异值分解" : "右极分解"}
      formula={state.mode === "svd" ? <>A = U Σ Vᵀ</> : <>A = Q P</>}
      formulaStatus={
        "rank " + String(derived.svd.rank) + " · κ₂ " + conditionText
      }
      formulaTone={formulaTone}
      insight={
        state.mode === "svd" && state.columns > state.rows ? (
          <>
            <strong>薄 Vᵀ 先投影到奇异方向坐标，Σ 伸缩，U 输出。</strong> R
            {state.columns} → R{state.rows} 包含降维，零空间方向被压到零。
          </>
        ) : state.mode === "svd" ? (
          <>
            <strong>Vᵀ 提取主方向坐标，Σ 沿正交轴伸缩，U 输出。</strong>{" "}
            奇异值为零时，相应方向被压到零。
          </>
        ) : derived.partialIsometry ? (
          <>
            <strong>Q 是部分等距映射（partial isometry）。</strong>{" "}
            对矩形或秩亏矩阵，其零空间上的延拓并不唯一。
          </>
        ) : (
          <>
            <strong>P 承担对称正半定伸缩，Q 承担保持长度的定向。</strong>
          </>
        )
      }
      stage={
        <div className="dimension-stage decomposition-stage">
          {usesThree ? (
            <Suspense
              fallback={
                <div className="stage-loading" role="status">
                  正在加载三维分解舞台…
                </div>
              }
            >
              <ThreeTransformStage
                ref={bindThreeStage}
                matrix={derived.currentStage.matrix}
                vector={sampleVector(derived.currentStage.inputDimension)}
                inputDimension={derived.currentStage.inputDimension}
                outputDimension={derived.currentStage.outputDimension}
                theme={theme}
                showGrid={state.showGrid}
                showSphere={state.showSphere}
                showTrail={state.showTrail}
                exportFilename="basis-lab-decomposition-3d.png"
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
              ref={bindCanvasStage}
              render={render}
              renderKey={{
                stage: derived.currentStage,
                showGrid: state.showGrid,
                showSphere: state.showSphere,
                showTrail: state.showTrail,
                theme,
              }}
              viewport={{ scale: isMobile ? 52 : 70, center: [0, 0] }}
              duration={950}
              ariaLabel={
                derived.currentStage.label +
                "阶段的" +
                String(derived.currentStage.inputDimension) +
                "维到" +
                String(derived.currentStage.outputDimension) +
                "维实线性映射"
              }
              fallbackDescription={
                derived.currentStage.symbol +
                " 的阶段矩阵为 " +
                formatRealMatrix(derived.currentStage.matrix)
              }
              showExportButton
              exportFilename="basis-lab-decomposition.png"
            />
          )}
        </div>
      }
      inspector={
        <>
          <ControlSection
            title="实矩阵 A"
            caption={
              String(state.rows) + " × " + String(state.columns) + " · R 上分解"
            }
            action={
              <IconButton
                label="恢复默认分解"
                onClick={() => {
                  resetState();
                  queueStageAction("complete");
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
                    resizeDecompositionState(
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
                    resizeDecompositionState(
                      current,
                      current.rows,
                      toDimension(value),
                    ),
                  )
                }
              />
            </div>
            <DynamicMatrixInput
              label="分解矩阵"
              value={toMatrixInput(state.matrix, state.rows, state.columns)}
              onChange={(matrix) =>
                setState((current) => ({
                  ...current,
                  matrix: fromMatrixInput(matrix),
                }))
              }
              testId="decomposition-matrix-cell"
            />
            <PresetGrid
              label="矩阵形状预设"
              presets={decompositionPresets}
              onSelect={selectPreset}
            />
            <Notice tone="info">
              支持 1–3 维实矩阵；可比较 SVD 与右极分解的作用路径。
            </Notice>
          </ControlSection>

          <ControlSection
            title="分解路径"
            caption="选择分解后逐阶段检查矩阵作用"
          >
            <SegmentedControl<DecompositionMode>
              label="分解模式"
              value={state.mode}
              options={[
                { value: "svd", label: "SVD" },
                { value: "polar", label: "右极 A = QP" },
              ]}
              onChange={setMode}
            />
            <SegmentedControl<DecompositionStage>
              label="分解阶段"
              value={state.stage}
              options={derived.stages.map((stage) => ({
                value: stage.id,
                label: stage.label,
              }))}
              onChange={setStage}
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
                label="样本轨迹"
                checked={state.showTrail}
                onChange={(showTrail) =>
                  setState((current) => ({ ...current, showTrail }))
                }
              />
            </div>
          </ControlSection>

          <ControlSection
            title={state.mode === "svd" ? "薄 SVD 因子" : "右极因子"}
            caption={
              state.mode === "svd"
                ? "U、V 列正交；Σ 只保留 min(m,n) 个奇异方向"
                : "P = VΣVᵀ，Q = UVᵀ"
            }
          >
            <div className="decomposition-factor-grid">{factorReadout}</div>
            {state.mode === "svd" && (
              <div className="decomposition-singular-values">
                <span>σ =</span>
                <code>{formatRealVector(derived.svd.singularValues)}</code>
              </div>
            )}
            {state.mode === "polar" && derived.partialIsometry && (
              <Notice tone="warning">
                Q 是 partial isometry；矩形或秩亏情形下该因子并不唯一。
              </Notice>
            )}
          </ControlSection>

          <ControlSection title="数值证书">
            <MetricList
              metrics={[
                {
                  label: "rank A",
                  value: String(derived.svd.rank),
                  key: "rank",
                  tone: derived.rankDeficient ? "red" : "cyan",
                },
                { label: "κ₂(A)", value: conditionText, key: "condition" },
                {
                  label: "reconstruction",
                  value: residual(reconstructionResidual),
                  key: "reconstruction-residual",
                  tone: "cyan",
                },
                {
                  label: "orthogonality",
                  value: residual(orthogonalityResidual),
                  key: "orthogonality-residual",
                  tone: "blue",
                },
                {
                  label: "symmetry(P)",
                  value: residual(derived.polar.symmetryResidual),
                  key: "symmetry-residual",
                  tone: "yellow",
                },
              ]}
            />
          </ControlSection>
        </>
      }
    />
  );
}
