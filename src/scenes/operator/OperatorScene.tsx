import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
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
import { PresetGrid } from "../../components/ui/PresetGrid";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { SelectField } from "../../components/ui/SelectField";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import {
  type ComplexMatrix,
  type ComplexOperatorClassification,
  type ComplexVector,
  type Dimension,
  type Field,
} from "../../math/nd";
import { formatComplex } from "../../utils/formatLinear";
import { ReadonlyComplexMatrix } from "./ReadonlyComplexMatrix";
import { renderOperatorCanvas } from "./renderCanvas";
import {
  applyOperatorPreset,
  changeOperatorField,
  deriveOperator,
  migrateOperatorState,
  operatorDefaults,
  operatorPresetsForDimension,
  resizeOperatorState,
  type OperatorComponentFocus,
  type OperatorLessonMode,
  type OperatorPreset,
} from "./model";
import type { ThreeOperatorStageHandle } from "./ThreeOperatorStage";

const ThreeOperatorStage = lazy(() =>
  import("./ThreeOperatorStage").then((module) => ({
    default: module.ThreeOperatorStage,
  })),
);

type ResultView = "spectrum" | "factor" | "certificate";

interface LessonStep {
  readonly label: string;
  readonly formula: string;
  readonly progress: number;
}

const dimensionOptions = [
  { value: "1", label: "1 维" },
  { value: "2", label: "2 维" },
  { value: "3", label: "3 维" },
] as const;

const fieldOptions = [
  { value: "R", label: "实数 R" },
  { value: "C", label: "复数 C" },
] as const;

const lessonModeOptions = [
  { value: "apply", label: "作用于向量" },
  { value: "structure", label: "查看谱结构" },
] as const;

const resultViewOptions = [
  { value: "spectrum", label: "特征值" },
  { value: "factor", label: "U / Λ" },
  { value: "certificate", label: "验证" },
] as const;

const applySteps: readonly LessonStep[] = [
  { label: "输入", formula: "x", progress: 0 },
  { label: "谱坐标", formula: "c = U*x", progress: 0.25 },
  { label: "独立作用", formula: "d = Λc", progress: 0.5 },
  { label: "贡献重构", formula: "Ud = Σdᵢuᵢ", progress: 0.75 },
  { label: "结果", formula: "Ax", progress: 1 },
];

const structureSteps: readonly LessonStep[] = [
  { label: "谱点", formula: "σ(A)", progress: 0 },
  { label: "特征子空间", formula: "Auᵢ = λᵢuᵢ", progress: 1 / 3 },
  { label: "谱投影", formula: "Pλ", progress: 2 / 3 },
  { label: "恒等式", formula: "A = ΣλPλ", progress: 1 },
];

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
      const entry = value.entries[row * value.columns + column] ?? {
        real: 0,
        imag: 0,
      };
      return { re: entry.real, im: entry.imag };
    }),
  );
}

function toRealVectorInput(
  vector: ComplexVector,
  dimension: Dimension,
): DynamicVectorValue {
  return { dimension, entries: vector.map((entry) => entry.re) };
}

function fromRealVectorInput(value: DynamicVectorValue): ComplexVector {
  return value.entries.map((entry) => ({ re: entry, im: 0 }));
}

function toComplexVectorInput(
  vector: ComplexVector,
  dimension: Dimension,
): ComplexVectorValue {
  return {
    dimension,
    entries: vector.map((entry) => ({ real: entry.re, imag: entry.im })),
  };
}

function fromComplexVectorInput(value: ComplexVectorValue): ComplexVector {
  return value.entries.map((entry) => ({ re: entry.real, im: entry.imag }));
}

function classificationLabel(classification: ComplexOperatorClassification) {
  if (classification.selfAdjoint) return "self-adjoint";
  return classification.normal ? "normal" : "非 normal";
}

function formatResidual(value: number | undefined) {
  if (value === undefined) return "—";
  if (Math.abs(value) < 1e-12) return "0";
  if (Math.abs(value) < 1e-4) return value.toExponential(2);
  return value.toFixed(3).replace(/\.0+$/, "");
}

function vectorText(vector: ComplexVector) {
  return `[${vector.map(formatComplex).join(", ")}]`;
}

function failureMessage(
  spectral: Exclude<
    ReturnType<typeof deriveOperator>["spectral"],
    { success: true }
  >,
) {
  switch (spectral.reason) {
    case "not-normal":
      return "A*A 与 AA* 不一致，因此不存在酉谱分解；这不排除一般特征分解。";
    case "verification-failed":
      return "求解结果未通过重构、正交或特征方程残差验证。";
    case "solver-failed":
      return "特征求解器未能给出完整且稳定的酉特征基。";
  }
}

function LessonRail({
  steps,
  active,
  onSelect,
}: {
  readonly steps: readonly LessonStep[];
  readonly active: number;
  readonly onSelect: (index: number) => void;
}) {
  return (
    <div
      className="operator-lesson-rail"
      role="group"
      aria-label="谱分解教学步骤"
    >
      <IconButton
        label="上一步"
        onClick={() => onSelect(Math.max(0, active - 1))}
        disabled={active === 0}
      >
        <ChevronLeft size={17} aria-hidden="true" />
      </IconButton>
      <div
        className="operator-lesson-rail__steps"
        role="tablist"
        aria-label="教学阶段"
        style={{
          gridTemplateColumns: `repeat(${steps.length}, minmax(86px, 1fr))`,
        }}
      >
        {steps.map((step, index) => (
          <button
            type="button"
            role="tab"
            aria-selected={active === index}
            key={step.label}
            onClick={() => onSelect(index)}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{step.label}</strong>
            <small>{step.formula}</small>
          </button>
        ))}
      </div>
      <IconButton
        label="下一步"
        onClick={() => onSelect(Math.min(steps.length - 1, active + 1))}
        disabled={active === steps.length - 1}
      >
        <ChevronRight size={17} aria-hidden="true" />
      </IconButton>
    </div>
  );
}

export function OperatorScene({ theme }: SceneProps) {
  const [state, setState, resetState] = useLocalStorage(
    "basis-lab:operator",
    operatorDefaults,
    migrateOperatorState,
  );
  const [resultView, setResultView] = useState<ResultView>("spectrum");
  const [activeStep, setActiveStep] = useState(
    state.lessonMode === "apply"
      ? applySteps.length - 1
      : structureSteps.length - 1,
  );
  const canvasStageRef = useRef<VisualizationStageHandle>(null);
  const threeStageRef = useRef<ThreeOperatorStageHandle>(null);
  const replayTimerRef = useRef<ReturnType<
    typeof globalThis.setTimeout
  > | null>(null);
  const derived = useMemo(() => deriveOperator(state), [state]);
  const presets = useMemo(
    () => operatorPresetsForDimension(state.dimension),
    [state.dimension],
  );
  const steps = state.lessonMode === "apply" ? applySteps : structureSteps;
  const useThreeStage =
    state.field === "R" &&
    state.dimension === 3 &&
    derived.spectral.success &&
    Boolean(derived.application);

  useEffect(() => {
    if (!derived.spectral.success) {
      canvasStageRef.current?.pause();
      canvasStageRef.current?.seek(1);
    }
  }, [derived.spectral.success]);

  useEffect(
    () => () => {
      if (replayTimerRef.current !== null) {
        globalThis.clearTimeout(replayTimerRef.current);
      }
    },
    [],
  );

  const render = useCallback(
    (frame: VisualizationRenderFrame) =>
      renderOperatorCanvas(frame, theme, state, derived),
    [derived, state, theme],
  );

  const replayForState = useCallback((nextState: typeof state) => {
    const next = deriveOperator(nextState);
    const nextUsesThree =
      nextState.field === "R" &&
      nextState.dimension === 3 &&
      next.spectral.success &&
      Boolean(next.application);
    if (replayTimerRef.current !== null) {
      globalThis.clearTimeout(replayTimerRef.current);
    }
    replayTimerRef.current = globalThis.setTimeout(() => {
      replayTimerRef.current = null;
      if (!next.spectral.success) canvasStageRef.current?.seek(1);
      else if (nextUsesThree) threeStageRef.current?.replay();
      else canvasStageRef.current?.replay();
    }, 60);
  }, []);

  const selectPreset = (preset: OperatorPreset) => {
    const next = applyOperatorPreset(state, preset);
    setState(next);
    setActiveStep(0);
    replayForState(next);
  };

  const setField = (field: Field) => {
    const next = changeOperatorField(state, field);
    setState(next);
    setActiveStep(0);
    replayForState(next);
  };

  const setDimension = (dimension: Dimension) => {
    const next = resizeOperatorState(state, dimension);
    setState(next);
    setActiveStep(0);
    replayForState(next);
  };

  const setLessonMode = (lessonMode: OperatorLessonMode) => {
    const next = { ...state, lessonMode };
    setState(next);
    setActiveStep(0);
    replayForState(next);
  };

  const selectStep = (index: number) => {
    if (replayTimerRef.current !== null) {
      globalThis.clearTimeout(replayTimerRef.current);
      replayTimerRef.current = null;
    }
    const bounded = Math.min(steps.length - 1, Math.max(0, index));
    const progress = steps[bounded]!.progress;
    setActiveStep(bounded);
    if (useThreeStage) {
      threeStageRef.current?.pause();
      threeStageRef.current?.seek(progress);
    } else {
      canvasStageRef.current?.pause();
      canvasStageRef.current?.seek(progress);
    }
  };

  const syncActiveStep = useCallback(
    (progress: number) => {
      const count =
        state.lessonMode === "apply"
          ? applySteps.length
          : structureSteps.length;
      const next = Math.min(
        count - 1,
        Math.ceil(progress * (count - 1) - 1e-6),
      );
      setActiveStep((current) => (current === next ? current : next));
    },
    [state.lessonMode],
  );

  const className = classificationLabel(derived.classification);
  const isNonNormal = !derived.classification.normal;
  const formulaTone = derived.spectral.success
    ? "positive"
    : derived.classification.normal
      ? "warning"
      : "negative";
  const formula = derived.spectral.success
    ? state.lessonMode === "apply"
      ? "x → U*x → Λc → UΛc = Ax"
      : "A = Σ λPλ = U Λ U*"
    : derived.classification.normal
      ? "谱分解验证未通过"
      : "A*A ≠ AA*";
  const subtitle = isNonNormal
    ? `${state.field}${state.dimension} · 非 normal 交换子诊断`
    : state.lessonMode === "apply"
      ? `${state.field}${state.dimension} · 谱分解作用于测试向量`
      : `${state.field}${state.dimension} · normal 算子的谱结构`;
  const eigenvalues = derived.spectral.success
    ? derived.spectral.eigenvalues.map((value, index) => ({
        label: `λ${index + 1}`,
        value: formatComplex(value),
        key: `eigenvalue-${index + 1}`,
        tone: (["cyan", "yellow", "blue"] as const)[index],
      }))
    : [];
  const focusOptions = [
    { value: "all", label: "全部" },
    ...Array.from({ length: state.dimension }, (_, index) => ({
      value: String(index + 1) as OperatorComponentFocus,
      label: `分量 ${index + 1}`,
    })),
  ] as readonly { value: OperatorComponentFocus; label: string }[];
  const fallbackDescription =
    derived.spectral.success && derived.application
      ? state.lessonMode === "apply"
        ? `测试向量 x=${vectorText(state.vector)} 经 U*、Lambda 与 U 依次作用，得到 Ax=${vectorText(derived.application.output)}。`
        : `${state.dimension}维${className}算子，特征值为 ${derived.spectral.eigenvalues.map(formatComplex).join("，")}。`
      : isNonNormal
        ? `${state.dimension}维非 normal 算子，交换子 A*A-AA* 非零，因此不存在酉谱分解。`
        : `${state.dimension}维 normal 算子，但数值谱分解未通过验证。`;

  return (
    <SceneLayout
      id="operator"
      index="06"
      title="谱分解"
      subtitle={subtitle}
      formulaLabel={state.lessonMode === "apply" ? "向量流水线" : "谱恒等式"}
      formula={formula}
      formulaStatus={className}
      formulaTone={formulaTone}
      insight={
        isNonNormal ? (
          <>
            <strong>非 normal 只排除酉对角化。</strong>{" "}
            交换子热图给出失败位置；一般特征分解仍需另行判断。
          </>
        ) : !derived.spectral.success ? (
          <>
            <strong>normal 性成立，但数值证书未通过。</strong>{" "}
            当前结果不会作为谱分解展示。
          </>
        ) : derived.repeated ? (
          <>
            <strong>重根下 U 可变，谱投影 Pλ 不变。</strong>{" "}
            舞台按特征子空间分组，避免把某一组基误认为唯一答案。
          </>
        ) : state.lessonMode === "apply" ? (
          <>
            <strong>每个颜色始终跟随同一谱分量。</strong> 所有贡献相加与直接计算
            Ax 的残差为 {formatResidual(derived.application?.residual)}。
          </>
        ) : derived.classification.selfAdjoint ? (
          <>
            <strong>自伴算子的谱点都落在实轴上。</strong>{" "}
            互相正交的特征子空间给出唯一谱投影。
          </>
        ) : (
          <>
            <strong>实 normal 旋转对应实不变平面。</strong>{" "}
            三维舞台不会把复特征向量伪装成实箭头。
          </>
        )
      }
      stage={
        <div className="operator-stage-shell">
          {derived.spectral.success && (
            <LessonRail
              steps={steps}
              active={activeStep}
              onSelect={selectStep}
            />
          )}
          <div className="operator-stage-shell__viewport">
            {useThreeStage &&
            derived.spectral.success &&
            derived.application ? (
              <Suspense
                fallback={
                  <div className="visualization-stage__fallback">
                    正在按需加载 R3 谱舞台…
                  </div>
                }
              >
                <ThreeOperatorStage
                  ref={threeStageRef}
                  state={state}
                  derived={derived}
                  theme={theme}
                  onProgressChange={syncActiveStep}
                />
              </Suspense>
            ) : (
              <VisualizationStage
                key={`${state.field}-${state.dimension}-${state.lessonMode}`}
                ref={canvasStageRef}
                className="operator-stage"
                render={render}
                renderKey={state}
                duration={1700}
                ariaLabel={
                  isNonNormal
                    ? "非 normal 算子的交换子诊断"
                    : state.lessonMode === "apply"
                      ? "谱分解作用于测试向量的真实计算流水线"
                      : "normal 算子的谱点、特征子空间和谱投影"
                }
                fallbackDescription={fallbackDescription}
                showControls={derived.spectral.success}
                showViewControls={false}
                showExportButton
                exportFilename="basis-lab-operator-spectrum.png"
                onProgressChange={syncActiveStep}
              />
            )}
          </div>
        </div>
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
                  setActiveStep(applySteps.length - 1);
                  globalThis.setTimeout(
                    () => canvasStageRef.current?.seek(1),
                    0,
                  );
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

          <ControlSection title="教学视图" caption="谱结构与向量作用分开呈现">
            <SegmentedControl
              label="谱分解教学模式"
              value={state.lessonMode}
              options={lessonModeOptions}
              onChange={setLessonMode}
            />
            {state.lessonMode === "apply" &&
              (state.field === "R" ? (
                <DynamicVectorInput
                  label="x"
                  name="operator-input"
                  value={toRealVectorInput(state.vector, state.dimension)}
                  onChange={(value) =>
                    setState((current) => ({
                      ...current,
                      vector: fromRealVectorInput(value),
                    }))
                  }
                  tone="red"
                  testId="operator-vector-component"
                />
              ) : (
                <ComplexVectorInput
                  label="x"
                  name="operator-input"
                  value={toComplexVectorInput(state.vector, state.dimension)}
                  onChange={(value) =>
                    setState((current) => ({
                      ...current,
                      vector: fromComplexVectorInput(value),
                    }))
                  }
                  tone="red"
                />
              ))}
            {derived.spectral.success && (
              <SegmentedControl
                label="聚焦谱分量"
                value={state.focus}
                options={focusOptions}
                onChange={(focus) =>
                  setState((current) => ({ ...current, focus }))
                }
              />
            )}
          </ControlSection>

          <ControlSection advanced title="算子分类" caption="以 A* 为共轭转置">
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

          <ControlSection
            advanced
            title="谱结果"
            caption="结构、因子与数值证书"
          >
            {derived.spectral.success ? (
              <div className="operator-spectrum">
                <SegmentedControl
                  label="谱结果视图"
                  value={resultView}
                  options={resultViewOptions}
                  onChange={setResultView}
                />
                {resultView === "spectrum" ? (
                  <>
                    <div className="operator-spectrum__equation">A = Σ λPλ</div>
                    <MetricList metrics={eigenvalues} />
                    <div className="operator-eigenspace-list">
                      {derived.eigenspaces.map((space, index) => (
                        <div
                          key={`${space.indices.join("-")}-${formatComplex(space.eigenvalue)}`}
                        >
                          <span>E{index + 1}</span>
                          <strong>λ = {formatComplex(space.eigenvalue)}</strong>
                          <small>dim {space.indices.length} · Pλ 唯一</small>
                        </div>
                      ))}
                    </div>
                  </>
                ) : resultView === "factor" ? (
                  <div className="operator-spectrum__factor">
                    <div className="operator-spectrum__equation">
                      A = U Λ U*
                    </div>
                    <ReadonlyComplexMatrix
                      label="酉特征基矩阵"
                      symbol="U"
                      matrix={derived.spectral.U}
                      testId="operator-u-cell"
                    />
                    <ReadonlyComplexMatrix
                      label="特征值对角矩阵"
                      symbol="Λ"
                      matrix={derived.spectral.lambda}
                      testId="operator-lambda-cell"
                    />
                  </div>
                ) : (
                  <>
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
                          label: "application",
                          value: formatResidual(derived.application?.residual),
                          key: "application-residual",
                          tone: "blue",
                        },
                        {
                          label: "basis",
                          value: derived.repeated
                            ? "U 非唯一，Pλ 唯一"
                            : "确定至相位",
                          key: "basis-uniqueness",
                          tone: derived.repeated ? "yellow" : "blue",
                        },
                      ]}
                    />
                    <Notice tone={derived.repeated ? "info" : "success"}>
                      {derived.repeated
                        ? "结果按谱投影认证；同一特征子空间中的正交基可以改变。"
                        : "重构、正交、特征方程与向量应用残差均已通过验证。"}
                    </Notice>
                  </>
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
