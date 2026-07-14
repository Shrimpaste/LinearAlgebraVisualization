import { useCallback, useEffect, useMemo, useRef } from "react";
import { RotateCcw } from "lucide-react";
import type { SceneProps } from "../../app/types";
import { SceneLayout } from "../../components/SceneLayout";
import {
  VisualizationStage,
  type VisualizationRenderFrame,
  type VisualizationStageHandle,
} from "../../components/VisualizationStage";
import {
  ComplexMatrixInput,
  type ComplexMatrixValue,
} from "../../components/ui/ComplexMatrixInput";
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
import { useLocalStorage } from "../../hooks/useLocalStorage";
import {
  absComplex,
  type ComplexMatrix,
  type ComplexScalar,
  type Dimension,
  type Field,
  type NormalSpectralSuccess,
} from "../../math/nd";
import { getCanvasPalette } from "../../rendering";
import { formatNumber } from "../../utils/format";
import { formatComplex } from "../../utils/formatLinear";
import { compactOperatorDisplayMatrix } from "./display";
import {
  applyOperatorPreset,
  changeOperatorField,
  deriveOperator,
  migrateOperatorState,
  operatorDefaults,
  operatorPresetsForDimension,
  resizeOperatorState,
  type OperatorPreset,
} from "./model";

const dimensionOptions = [
  { value: "1", label: "1 维" },
  { value: "2", label: "2 维" },
  { value: "3", label: "3 维" },
] as const;

const fieldOptions = [
  { value: "R", label: "实数 R" },
  { value: "C", label: "复数 C" },
] as const;

function toDimension(value: "1" | "2" | "3"): Dimension {
  return Number(value) as Dimension;
}

function toRealMatrixInput(
  matrix: ComplexMatrix,
  dimension: Dimension,
): DynamicMatrixValue {
  return {
    rows: dimension,
    columns: dimension,
    entries: matrix.flat().map((entry) => entry.re),
  };
}

function fromRealMatrixInput(value: DynamicMatrixValue): ComplexMatrix {
  return Array.from({ length: value.rows }, (_, row) =>
    Array.from({ length: value.columns }, (_, column) => ({
      re: value.entries[row * value.columns + column] ?? 0,
      im: 0,
    })),
  );
}

function toComplexMatrixInput(
  matrix: ComplexMatrix,
  dimension: Dimension,
): ComplexMatrixValue {
  return {
    rows: dimension,
    columns: dimension,
    entries: matrix.flat().map((entry) => ({
      real: entry.re,
      imag: entry.im,
    })),
  };
}

function fromComplexMatrixInput(value: ComplexMatrixValue): ComplexMatrix {
  return Array.from({ length: value.rows }, (_, row) =>
    Array.from({ length: value.columns }, (_, column) => {
      const entry = value.entries[row * value.columns + column];
      return { re: entry?.real ?? 0, im: entry?.imag ?? 0 };
    }),
  );
}

function formatResidual(value: number | undefined) {
  if (value === undefined) return "—";
  if (value === 0) return "0";
  return value < 1e-5 ? value.toExponential(2) : formatNumber(value);
}

function classificationLabel(
  classification: ReturnType<typeof deriveOperator>["classification"],
) {
  if (classification.selfAdjoint) return "self-adjoint";
  if (classification.normal) return "normal";
  return "非 normal";
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function drawCanvasArrow(
  context: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  color: string,
  alpha: number,
  width = 2,
) {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  context.save();
  context.globalAlpha = alpha;
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = width;
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(fromX, fromY);
  context.lineTo(toX, toY);
  context.stroke();
  context.beginPath();
  context.moveTo(toX, toY);
  context.lineTo(
    toX - 8 * Math.cos(angle - Math.PI / 6),
    toY - 8 * Math.sin(angle - Math.PI / 6),
  );
  context.lineTo(
    toX - 8 * Math.cos(angle + Math.PI / 6),
    toY - 8 * Math.sin(angle + Math.PI / 6),
  );
  context.closePath();
  context.fill();
  context.restore();
}

function drawProgressLine(
  context: CanvasRenderingContext2D,
  fromX: number,
  toX: number,
  y: number,
  progress: number,
  color: string,
) {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = 1.5;
  context.setLineDash([5, 4]);
  context.beginPath();
  context.moveTo(fromX, y);
  context.lineTo(fromX + (toX - fromX) * clamp01(progress), y);
  context.stroke();
  context.restore();
}

function spectralColumn(result: NormalSpectralSuccess, column: number) {
  return result.U.map((row) => row[column]!);
}

function drawProjectionGlyph(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  vector: readonly ComplexScalar[],
  realGeometry: boolean,
  color: string,
  secondary: string,
  alpha: number,
) {
  context.save();
  context.globalAlpha = alpha;
  if (realGeometry && vector.length <= 2) {
    const dx = (vector[0]?.re ?? 1) * 24;
    const dy = -(vector[1]?.re ?? 0) * 24;
    drawCanvasArrow(context, x, y, x + dx, y + dy, color, 1, 2.2);
  } else {
    const colors = [color, secondary, "#856000"];
    vector.forEach((entry, index) => {
      const magnitude = Math.min(1, absComplex(entry));
      const angle = Math.atan2(entry.im, entry.re);
      const radius = 7 + magnitude * 18;
      context.strokeStyle = colors[index] ?? color;
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(
        x + Math.cos(angle) * radius,
        y - Math.sin(angle) * radius,
      );
      context.stroke();
      context.fillStyle = colors[index] ?? color;
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

function drawEigenvalueGlyph(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  eigenvalue: ComplexScalar,
  color: string,
  alpha: number,
) {
  const magnitude = absComplex(eigenvalue);
  const radius = 10 + Math.min(12, magnitude * 3);
  const phase = Math.atan2(eigenvalue.im, eigenvalue.re);
  context.save();
  context.globalAlpha = alpha;
  context.strokeStyle = color;
  context.lineWidth = 1.5;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.stroke();
  drawCanvasArrow(
    context,
    x,
    y,
    x + Math.cos(phase) * radius,
    y - Math.sin(phase) * radius,
    color,
    1,
    1.7,
  );
  context.restore();
}

function renderSpectralPipeline(
  frame: VisualizationRenderFrame,
  theme: SceneProps["theme"],
  field: Field,
  dimension: Dimension,
  derived: ReturnType<typeof deriveOperator>,
) {
  const palette = getCanvasPalette(theme);
  const { ctx, width, height, easedProgress } = frame;
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.strokeStyle = palette.gridMinor;
  ctx.lineWidth = 1;
  for (let x = 0; x <= width; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += 48) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(width, y + 0.5);
    ctx.stroke();
  }
  ctx.restore();

  const projectionIsComplex =
    field === "C" ||
    (derived.spectral.success &&
      (derived.spectral.eigenvalues.some(
        (value) => Math.abs(value.im) > 1e-8,
      ) ||
        derived.spectral.U.some((row) =>
          row.some((value) => Math.abs(value.im) > 1e-8),
        )));
  const projectionLabel = projectionIsComplex
    ? `C${dimension} 分量/相位投影 · 非完整复空间几何`
    : dimension === 3
      ? "R3 分量投影 · 非完整三维几何"
      : `${dimension}D 特征方向`;

  ctx.fillStyle = palette.textSoft;
  ctx.font = '10px "IBM Plex Mono", monospace';
  ctx.textAlign = "left";
  ctx.fillText(projectionLabel, 16, 23);

  if (!derived.spectral.success) {
    const isNonNormal = !derived.classification.normal;
    const centerX = width / 2;
    const centerY = height / 2;
    ctx.textAlign = "center";
    ctx.fillStyle = isNonNormal ? palette.red : palette.yellow;
    ctx.font = '600 22px "IBM Plex Mono", monospace';
    ctx.fillText(
      isNonNormal ? "A*A  ≠  AA*" : "A*A  =  AA*",
      centerX,
      centerY - 10,
    );
    ctx.fillStyle = palette.text;
    ctx.font = '500 12px "IBM Plex Sans", sans-serif';
    ctx.fillText(
      isNonNormal
        ? "非 normal：酉谱流水线已停止"
        : "normal，但数值分解未通过验证",
      centerX,
      centerY + 20,
    );
    ctx.fillStyle = palette.textSoft;
    ctx.font = '10px "IBM Plex Mono", monospace';
    ctx.fillText(
      `normal residual ${formatResidual(derived.classification.normalResidual)}`,
      centerX,
      centerY + 44,
    );
    return;
  }

  const result = derived.spectral;
  const firstPhase = clamp01(easedProgress * 3);
  const secondPhase = clamp01(easedProgress * 3 - 1);
  const thirdPhase = clamp01(easedProgress * 3 - 2);
  const xInput = width * 0.08;
  const xProject = width * 0.32;
  const xLambda = width * 0.62;
  const xOutput = width * 0.86;

  ctx.textAlign = "center";
  ctx.fillStyle = palette.text;
  ctx.font = '600 12px "IBM Plex Mono", monospace';
  ctx.fillText("v", xInput, 50);
  ctx.fillText("U*", xProject, 50);
  ctx.fillText("Λ", xLambda, 50);
  ctx.fillText("U", xOutput, 50);

  const top = 83;
  const bottom = Math.max(top, height - 62);
  const gap = dimension === 1 ? 0 : (bottom - top) / (dimension - 1);
  result.eigenvalues.forEach((eigenvalue, index) => {
    const y = dimension === 1 ? (top + bottom) / 2 : top + gap * index;
    const column = spectralColumn(result, index);

    ctx.fillStyle = palette.neutral;
    ctx.beginPath();
    ctx.arc(xInput, y, 4, 0, Math.PI * 2);
    ctx.fill();
    drawProgressLine(
      ctx,
      xInput + 7,
      xProject - 28,
      y,
      firstPhase,
      palette.cyan,
    );
    drawProjectionGlyph(
      ctx,
      xProject,
      y,
      column,
      !projectionIsComplex && dimension <= 2,
      palette.cyan,
      palette.blue,
      0.18 + 0.82 * firstPhase,
    );
    drawProgressLine(
      ctx,
      xProject + 28,
      xLambda - 25,
      y,
      secondPhase,
      palette.yellow,
    );
    drawEigenvalueGlyph(
      ctx,
      xLambda,
      y,
      eigenvalue,
      palette.yellow,
      0.15 + 0.85 * secondPhase,
    );
    drawProgressLine(
      ctx,
      xLambda + 25,
      xOutput - 27,
      y,
      thirdPhase,
      palette.red,
    );
    const phase = Math.atan2(eigenvalue.im, eigenvalue.re);
    const outputLength = 10 + Math.min(22, absComplex(eigenvalue) * 4);
    drawCanvasArrow(
      ctx,
      xOutput - 12,
      y,
      xOutput - 12 + Math.cos(phase) * outputLength,
      y - Math.sin(phase) * outputLength,
      palette.red,
      0.12 + 0.88 * thirdPhase,
      2.2,
    );

    ctx.textAlign = "center";
    ctx.font = '10px "IBM Plex Mono", monospace';
    ctx.fillStyle = palette.cyan;
    ctx.fillText(`u${index + 1}`, xProject, y + 34);
    ctx.fillStyle = palette.yellow;
    ctx.fillText(`λ${index + 1}=${formatComplex(eigenvalue)}`, xLambda, y + 34);
  });

  ctx.textAlign = "left";
  ctx.fillStyle = palette.textSoft;
  ctx.font = '10px "IBM Plex Mono", monospace';
  const footer = derived.repeated
    ? "重复特征值：当前酉基仅是该特征子空间中的一种选择"
    : `reconstruction residual ${formatResidual(result.reconstructionResidual)}`;
  ctx.fillText(footer, 16, height - 18);
}

function failureMessage(
  spectral: Exclude<
    ReturnType<typeof deriveOperator>["spectral"],
    { success: true }
  >,
) {
  switch (spectral.reason) {
    case "not-normal":
      return "A*A 与 AA* 不一致，当前算子不存在酉谱分解。";
    case "verification-failed":
      return "求解结果未通过重构、正交或特征方程残差验证。";
    case "solver-failed":
      return "特征求解器未能给出完整且稳定的酉特征基。";
  }
}

export function OperatorScene({ theme }: SceneProps) {
  const [state, setState, resetState] = useLocalStorage(
    "basis-lab:operator",
    operatorDefaults,
    migrateOperatorState,
  );
  const stageRef = useRef<VisualizationStageHandle>(null);
  const derived = useMemo(() => deriveOperator(state), [state]);
  const presets = useMemo(
    () => operatorPresetsForDimension(state.dimension),
    [state.dimension],
  );

  useEffect(() => {
    if (!derived.spectral.success) {
      stageRef.current?.pause();
      stageRef.current?.seek(1);
    }
  }, [derived.spectral.success]);

  const render = useCallback(
    (frame: VisualizationRenderFrame) =>
      renderSpectralPipeline(
        frame,
        theme,
        state.field,
        state.dimension,
        derived,
      ),
    [derived, state.dimension, state.field, theme],
  );

  const replayIfAvailable = useCallback((nextState: typeof state) => {
    const next = deriveOperator(nextState);
    window.setTimeout(() => {
      if (next.spectral.success) stageRef.current?.replay();
      else stageRef.current?.seek(1);
    }, 0);
  }, []);

  const selectPreset = (preset: OperatorPreset) => {
    const next = applyOperatorPreset(state, preset);
    setState(next);
    replayIfAvailable(next);
  };

  const setField = (field: Field) => {
    const next = changeOperatorField(state, field);
    setState(next);
    replayIfAvailable(next);
  };

  const setDimension = (dimension: Dimension) => {
    const next = resizeOperatorState(state, dimension);
    setState(next);
    replayIfAvailable(next);
  };

  const className = classificationLabel(derived.classification);
  const isNonNormal = !derived.classification.normal;
  const formulaTone = derived.spectral.success
    ? "positive"
    : derived.classification.normal
      ? "warning"
      : "negative";
  const formula = derived.spectral.success
    ? "A = U Λ U*"
    : derived.classification.normal
      ? "谱分解验证未通过"
      : "A*A ≠ AA*";
  const eigenvalues = derived.spectral.success
    ? derived.spectral.eigenvalues.map((value, index) => ({
        label: `λ${index + 1}`,
        value: formatComplex(value),
        key: `eigenvalue-${index + 1}`,
        tone: (["cyan", "yellow", "blue"] as const)[index],
      }))
    : [];
  const fallbackDescription = derived.spectral.success
    ? `${state.dimension}维${className}算子，特征值为 ${derived.spectral.eigenvalues.map(formatComplex).join("，")}。`
    : isNonNormal
      ? `${state.dimension}维非 normal 算子，不存在 A=UΛU* 酉谱分解。`
      : `${state.dimension}维 normal 算子，但数值谱分解未通过验证。`;

  return (
    <SceneLayout
      id="operator"
      index="06"
      title="谱分解"
      subtitle={`${state.field}${state.dimension} · normal 算子的正交谱流水线`}
      formulaLabel="谱恒等式"
      formula={formula}
      formulaStatus={className}
      formulaTone={formulaTone}
      insight={
        isNonNormal ? (
          <>
            <strong>酉谱分解只属于 normal 算子。</strong>{" "}
            当前交换子残差非零，舞台不会伪造 U 与 Λ。
          </>
        ) : !derived.spectral.success ? (
          <>
            <strong>normal 性判定通过，但谱分解验证失败。</strong>{" "}
            求解器未能给出通过残差门槛的稳定酉特征基。
          </>
        ) : derived.repeated ? (
          <>
            <strong>重复特征值对应一个特征子空间。</strong>{" "}
            该子空间内可以选择不同的正交基，U 因而不唯一。
          </>
        ) : derived.classification.selfAdjoint ? (
          <>
            <strong>自伴算子的特征值为实数。</strong>{" "}
            酉基把空间拆成互相正交的特征方向。
          </>
        ) : (
          <>
            <strong>normal 但非自伴的算子仍可酉对角化。</strong>{" "}
            复特征值同时编码幅值缩放与相位旋转。
          </>
        )
      }
      stage={
        <VisualizationStage
          key={`${state.field}-${state.dimension}`}
          ref={stageRef}
          className="operator-stage"
          render={render}
          renderKey={state}
          duration={1500}
          ariaLabel="normal 算子的酉谱分解流水线"
          fallbackDescription={fallbackDescription}
          showControls={derived.spectral.success}
          showViewControls={false}
          showExportButton
          exportFilename="basis-lab-operator-spectrum.png"
        />
      }
      inspector={
        <>
          <ControlSection
            title="算子矩阵"
            caption="编辑 1–3 维实或复方阵"
            action={
              <IconButton
                label="恢复默认谱实验"
                onClick={() => {
                  resetState();
                  window.setTimeout(() => stageRef.current?.seek(1), 0);
                }}
              >
                <RotateCcw size={15} />
              </IconButton>
            }
          >
            <div className="operator-control-row">
              <SegmentedControl
                label="标量域"
                value={state.field}
                options={fieldOptions}
                onChange={setField}
              />
              <SelectField
                label="空间维数"
                value={String(state.dimension) as "1" | "2" | "3"}
                options={dimensionOptions}
                onChange={(value) => setDimension(toDimension(value))}
              />
            </div>
            {state.field === "R" ? (
              <DynamicMatrixInput
                label="算子矩阵"
                value={toRealMatrixInput(state.matrix, state.dimension)}
                onChange={(value) =>
                  setState((current) => ({
                    ...current,
                    matrix: fromRealMatrixInput(value),
                  }))
                }
                testId="operator-matrix-cell"
              />
            ) : (
              <ComplexMatrixInput
                label="复算子矩阵"
                value={toComplexMatrixInput(state.matrix, state.dimension)}
                onChange={(value) =>
                  setState((current) => ({
                    ...current,
                    matrix: fromComplexMatrixInput(value),
                  }))
                }
                testId="operator-matrix-cell"
              />
            )}
            <PresetGrid
              label="谱分解预设"
              presets={presets.map((preset) => ({
                label: preset.label,
                value: preset,
              }))}
              onSelect={selectPreset}
            />
          </ControlSection>

          <ControlSection title="算子分类" caption="以 A* 为共轭转置">
            <MetricList
              metrics={[
                {
                  label: "class",
                  value: className,
                  key: "operator-class",
                  tone: derived.classification.normal ? "cyan" : "red",
                },
                {
                  label: "dimension",
                  value: `${state.field}${state.dimension}`,
                  key: "operator-dimension",
                },
                {
                  label: "normal residual",
                  value: formatResidual(derived.classification.normalResidual),
                  key: "normal-residual",
                },
                {
                  label: "self-adjoint residual",
                  value: formatResidual(
                    derived.classification.selfAdjointResidual,
                  ),
                  key: "self-adjoint-residual",
                },
              ]}
            />
          </ControlSection>

          <ControlSection title="酉谱分解" caption="A = U Λ U*">
            {derived.spectral.success ? (
              <div className="operator-spectrum">
                <div
                  className="operator-spectrum__equation"
                  aria-label="A 等于 U 乘 Lambda 乘 U 共轭转置"
                >
                  A = U Λ U*
                </div>
                <MetricList metrics={eigenvalues} />
                <div className="operator-spectrum__factor">
                  <ComplexMatrixInput
                    label="酉特征基矩阵"
                    symbol="U"
                    value={toComplexMatrixInput(
                      compactOperatorDisplayMatrix(derived.spectral.U),
                      state.dimension,
                    )}
                    onChange={() => undefined}
                    disabled
                    testId="operator-u-cell"
                  />
                </div>
                <MetricList
                  metrics={[
                    {
                      label: "reconstruction",
                      value: formatResidual(
                        derived.spectral.reconstructionResidual,
                      ),
                      key: "reconstruction-residual",
                      tone: "cyan",
                    },
                    {
                      label: "orthogonality",
                      value: formatResidual(
                        derived.spectral.orthogonalityResidual,
                      ),
                      key: "orthogonality-residual",
                    },
                    {
                      label: "eigen equation",
                      value: formatResidual(derived.spectral.eigenResidual),
                      key: "eigen-residual",
                    },
                    {
                      label: "basis",
                      value: derived.repeated ? "非唯一" : "确定至相位",
                      key: "basis-uniqueness",
                      tone: derived.repeated ? "yellow" : "blue",
                    },
                  ]}
                />
                {derived.repeated ? (
                  <div className="operator-spectrum__repeated">
                    <Notice tone="info">
                      重复特征值的特征子空间内，酉基 U 的选择不唯一。
                    </Notice>
                  </div>
                ) : (
                  <Notice tone="success">
                    重构、正交与特征方程残差均已通过验证。
                  </Notice>
                )}
              </div>
            ) : (
              <Notice tone="warning">{failureMessage(derived.spectral)}</Notice>
            )}
          </ControlSection>
        </>
      }
    />
  );
}
