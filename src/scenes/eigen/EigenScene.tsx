import { lazy, Suspense, useCallback, useMemo, useRef } from "react";
import { RotateCcw } from "lucide-react";
import type { SceneProps } from "../../app/types";
import {
  applyRealMatrix,
  identityRealMatrix,
  type ComplexScalar,
  type Dimension,
  type RealMatrix,
} from "../../math/nd";
import {
  VisualizationStage,
  type VisualizationRenderFrame,
  type VisualizationStageHandle,
} from "../../components/VisualizationStage";
import { SceneLayout } from "../../components/SceneLayout";
import { ControlSection } from "../../components/ui/ControlSection";
import { DynamicMatrixInput } from "../../components/ui/DynamicMatrixInput";
import { DynamicVectorInput } from "../../components/ui/DynamicVectorInput";
import { IconButton } from "../../components/ui/IconButton";
import { MetricList } from "../../components/ui/MetricList";
import { Notice } from "../../components/ui/Notice";
import { PresetGrid } from "../../components/ui/PresetGrid";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import {
  drawAxes,
  drawGrid,
  drawInfiniteLine,
  drawLabel,
  drawVector,
  getCanvasPalette,
} from "../../rendering";
import { formatNumber } from "../../utils/format";
import { formatRealMatrix } from "../../utils/formatLinear";
import {
  basisVector,
  changeEigenBasisMode,
  deriveEigen,
  eigenDefaults,
  eigenPresets,
  migrateEigenState,
  resizeEigenState,
  setBasisVector,
  type EigenBasisMode,
} from "./model";

const ThreeEigenStage = lazy(() =>
  import("./ThreeEigenStage").then((module) => ({
    default: module.ThreeEigenStage,
  })),
);

function dynamicMatrix(matrix: RealMatrix, dimension: Dimension) {
  return {
    rows: dimension,
    columns: dimension,
    entries: matrix.flat(),
  } as const;
}

function fromEntries(
  entries: readonly number[],
  dimension: Dimension,
): RealMatrix {
  return Array.from({ length: dimension }, (_, row) =>
    Array.from(
      { length: dimension },
      (_, column) => entries[row * dimension + column] ?? 0,
    ),
  );
}

function eigenvalueText(value: ComplexScalar) {
  if (value.im === 0) return formatNumber(value.re);
  return `${formatNumber(value.re)} ${value.im < 0 ? "−" : "+"} ${formatNumber(Math.abs(value.im))}i`;
}

export function EigenScene({ theme }: SceneProps) {
  const isMobile = useMediaQuery("(max-width: 760px)");
  const [state, setState, resetState] = useLocalStorage(
    "basis-lab:eigen",
    eigenDefaults,
    migrateEigenState,
  );
  const stageRef = useRef<VisualizationStageHandle>(null);
  const derived = useMemo(() => deriveEigen(state), [state]);
  const eigensystem = derived.eigensystem;
  const valid = derived.physicalMatrix !== null && eigensystem !== null;
  const certified = eigensystem?.status === "real-eigenbasis";

  const render = useCallback(
    ({ ctx, viewport, width, height }: VisualizationRenderFrame) => {
      const palette = getCanvasPalette(theme);
      ctx.fillStyle = palette.background;
      ctx.fillRect(0, 0, width, height);
      drawGrid(ctx, viewport, palette);
      drawAxes(ctx, viewport, palette);
      if (!eigensystem || !derived.physicalMatrix) return;
      if (state.dimension === 1) {
        const value = eigensystem.eigenvalues[0]?.re ?? 0;
        drawVector(ctx, viewport, [1.4, 0], {
          color: palette.cyan,
          label: "v₁",
          width: 2.4,
        });
        drawVector(ctx, viewport, [1.4 * value, 0], {
          color: palette.red,
          label: "T(v₁)",
          width: 2.8,
        });
        return;
      }
      if (eigensystem.status === "complex") {
        drawLabel(
          ctx,
          viewport,
          [-1.45, 1.65],
          "无可认证实特征几何",
          palette.red,
          [0, 0],
        );
        return;
      }
      eigensystem.realEigenpairs.forEach((pair, index) => {
        const vector = [pair.vector[0]!, pair.vector[1]!] as const;
        const color = index === 0 ? palette.cyan : palette.yellow;
        drawInfiniteLine(ctx, viewport, vector, {
          color,
          width: 1.7,
          dash: [7, 5],
        });
        drawVector(ctx, viewport, vector, {
          color,
          label: `v${index + 1}`,
          width: 2.4,
        });
        const mapped = applyRealMatrix(derived.physicalMatrix!, pair.vector);
        drawVector(ctx, viewport, [mapped[0]!, mapped[1]!], {
          color: palette.red,
          label: `T(v${index + 1})`,
          width: 2.2,
          alpha: 0.82,
        });
      });
    },
    [derived.physicalMatrix, eigensystem, state.dimension, theme],
  );

  const setMode = (basisMode: EigenBasisMode) => {
    setState((current) => changeEigenBasisMode(current, basisMode) ?? current);
    window.setTimeout(() => stageRef.current?.replay(), 0);
  };
  const formula = eigensystem
    ? eigensystem.eigenvalues
        .map((value, index) => `λ${index + 1} = ${eigenvalueText(value)}`)
        .join(", ")
    : "特征系统不可用";
  const unavailable =
    eigensystem?.status === "complex"
      ? "含非实特征值：保留复特征值文本，不绘制伪实几何。"
      : eigensystem?.status === "defective"
        ? "特征向量不足：算子在实数域有缺陷，实特征基不可用。"
        : "求解结果未通过残差认证。";

  return (
    <SceneLayout
      id="eigen"
      index="03"
      title="特征系统"
      subtitle={`T: V → V · V = ℝ${state.dimension} · 单一共享坐标基 Q`}
      formulaLabel="特征值"
      formula={formula}
      formulaStatus={
        valid ? (certified ? "已认证实特征基" : "实特征基不可用") : "Q 无效"
      }
      formulaTone={valid && certified ? "positive" : "warning"}
      insight={
        certified ? (
          <>
            <strong>每个显示的 vᵢ 均通过 Avᵢ = λᵢvᵢ 残差认证。</strong> P
            的列严格对应下方显示顺序。
          </>
        ) : (
          <>
            <strong>
              {valid ? unavailable : "Q 必须由线性无关的 qᵢ 组成。"}
            </strong>
          </>
        )
      }
      stage={
        state.dimension === 3 ? (
          <Suspense
            fallback={
              <div className="visualization-stage__fallback">
                正在按需加载三维特征视图…
              </div>
            }
          >
            <ThreeEigenStage
              matrix={derived.physicalMatrix ?? identityRealMatrix(3)}
              eigenpairs={eigensystem?.realEigenpairs ?? []}
              hasRealGeometry={
                eigensystem?.status !== "complex" &&
                (eigensystem?.realEigenpairs.length ?? 0) > 0
              }
              theme={theme}
            />
          </Suspense>
        ) : (
          <VisualizationStage
            key={`${state.dimension}-${isMobile ? "mobile" : "desktop"}`}
            ref={stageRef}
            render={render}
            renderKey={state}
            viewport={{ scale: isMobile ? 55 : 76, center: [0, 0] }}
            duration={800}
            ariaLabel={`${state.dimension}维实线性算子的认证特征方向`}
            fallbackDescription={`${formula}。${certified ? "存在认证实特征基。" : unavailable}`}
            showExportButton
            exportFilename="basis-lab-eigen.png"
          />
        )
      }
      inspector={
        <>
          <ControlSection
            title="实线性自同空间"
            caption="输入与输出都是同一个 V；维数仅为 1、2 或 3"
            action={
              <IconButton label="恢复默认特征实验" onClick={resetState}>
                <RotateCcw size={15} />
              </IconButton>
            }
          >
            <SegmentedControl
              label="实空间维数"
              value={String(state.dimension)}
              options={[
                { value: "1", label: "1D" },
                { value: "2", label: "2D" },
                { value: "3", label: "3D" },
              ]}
              onChange={(value) =>
                setState((current) =>
                  resizeEigenState(current, Number(value) as Dimension),
                )
              }
            />
          </ControlSection>
          <ControlSection
            title="算子坐标矩阵"
            caption={
              state.basisMode === "standard"
                ? "A = [T]E"
                : "[T]Q = Q⁻¹AQ；编辑的是当前 Q 坐标表示"
            }
          >
            <SegmentedControl
              label="显示与编辑坐标基"
              value={state.basisMode}
              options={[
                { value: "standard", label: "标准基" },
                { value: "custom", label: "自定义 Q" },
              ]}
              onChange={setMode}
            />
            <DynamicMatrixInput
              label="当前坐标中的算子矩阵"
              symbol={state.basisMode === "standard" ? "A" : "[T]Q"}
              value={dynamicMatrix(state.matrix, state.dimension)}
              onChange={(value) =>
                setState((current) => ({
                  ...current,
                  matrix: fromEntries(value.entries, current.dimension),
                }))
              }
              testId="eigen-matrix-cell"
            />
            <PresetGrid
              label="特征系统预设（当前坐标）"
              presets={eigenPresets(state.dimension)}
              onSelect={(matrix) =>
                setState((current) => ({ ...current, matrix }))
              }
            />
          </ControlSection>
          <ControlSection
            title="共享自定义基 Q"
            caption="按顺序输入 Q = (q₁, …, qₙ)；同一 Q 同时用于定义域与陪域"
          >
            {Array.from({ length: state.dimension }, (_, index) => (
              <DynamicVectorInput
                key={index}
                label={`q${index + 1}`}
                name={`q${index + 1}`}
                value={{
                  dimension: state.dimension,
                  entries: basisVector(state.basis, index),
                }}
                onChange={(value) =>
                  setState((current) => ({
                    ...current,
                    basis: setBasisVector(current.basis, index, value.entries),
                  }))
                }
                tone={index === 0 ? "cyan" : index === 1 ? "yellow" : "blue"}
                testId="eigen-basis-component"
              />
            ))}
            {!derived.basisAnalysis.isBasis && (
              <Notice tone="warning">
                Q 退化；无法切换坐标或恢复物理算子。
              </Notice>
            )}
          </ControlSection>
          <ControlSection
            title="认证实特征基"
            caption="显示顺序定义 P = (v₁, …, vₙ)，不计算 Jordan 形"
          >
            {eigensystem?.realEigenpairs.map((pair, index) => (
              <DynamicVectorInput
                key={index}
                label={`v${index + 1} · λ=${formatNumber(pair.value)} · residual=${formatNumber(pair.residual)}`}
                name={`v${index + 1}`}
                value={{ dimension: state.dimension, entries: pair.vector }}
                onChange={() => undefined}
                disabled
                tone={index === 0 ? "cyan" : index === 1 ? "yellow" : "blue"}
                testId="eigenvector-component"
              />
            ))}
            {certified &&
            eigensystem?.realEigenbasis &&
            eigensystem.eigenbasisCoordinates ? (
              <MetricList
                metrics={[
                  {
                    label: "P = (v₁,…,vₙ)",
                    value: formatRealMatrix(eigensystem.realEigenbasis),
                    key: "eigenbasis-p",
                    tone: "cyan",
                  },
                  {
                    label: "[T]P = P⁻¹ A P",
                    value: formatRealMatrix(eigensystem.eigenbasisCoordinates),
                    key: "eigenbasis-coordinate-matrix",
                    tone: "blue",
                  },
                  {
                    label: "最大残差",
                    value: formatNumber(eigensystem.eigenbasisResidual ?? 0),
                    key: "eigenbasis-residual",
                  },
                ]}
              />
            ) : (
              <Notice tone="warning">
                [T]P = P⁻¹AP：不可用。{valid ? unavailable : "Q 无效。"}
              </Notice>
            )}
          </ControlSection>
        </>
      }
    />
  );
}
