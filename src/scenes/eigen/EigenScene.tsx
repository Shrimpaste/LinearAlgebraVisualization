import { useCallback, useMemo, useRef } from "react";
import { RotateCcw } from "lucide-react";
import type { SceneProps } from "../../app/types";
import {
  IDENTITY_MAT2,
  applyMat2,
  interpolateMat2,
  scaleVec2,
  type EigenAnalysis,
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
import { RangeField } from "../../components/ui/RangeField";
import { Toggle } from "../../components/ui/Toggle";
import { VectorInput } from "../../components/ui/VectorInput";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import {
  drawAxes,
  drawCircle,
  drawGrid,
  drawInfiniteLine,
  drawLabel,
  drawLine,
  drawPoint,
  drawTransformedCircle,
  drawVector,
  getCanvasPalette,
  isWorldPointNearCanvas,
} from "../../rendering";
import { formatNumber, formatVector } from "../../utils/format";
import { deriveEigen, eigenDefaults, eigenPresets } from "./model";

function analysisLabel(analysis: EigenAnalysis) {
  switch (analysis.kind) {
    case "two-real":
      return "两个实特征方向";
    case "repeated":
      return "重根 · 全方向";
    case "defective":
      return "重根 · 单一方向";
    case "complex":
      return "共轭复根";
  }
}

function eigenFormula(analysis: EigenAnalysis) {
  switch (analysis.kind) {
    case "two-real":
      return `λ₁ = ${formatNumber(analysis.eigenpairs[0].value)}, λ₂ = ${formatNumber(analysis.eigenpairs[1].value)}`;
    case "repeated":
    case "defective":
      return `λ = ${formatNumber(analysis.eigenvalue)}（二重）`;
    case "complex":
      return `λ = ${formatNumber(analysis.realPart)} ± ${formatNumber(analysis.imaginaryMagnitude)}i`;
  }
}

function eigenInsight(analysis: EigenAnalysis) {
  switch (analysis.kind) {
    case "two-real":
      return (
        <>
          <strong>高亮直线在变换后不发生偏转。</strong>{" "}
          向量只沿原方向按对应特征值伸缩或翻转。
        </>
      );
    case "repeated":
      return (
        <>
          <strong>矩阵是纯粹的标量伸缩。</strong>{" "}
          平面中的每个非零方向都是特征方向。
        </>
      );
    case "defective":
      return (
        <>
          <strong>代数重数为二，几何重数只有一。</strong>{" "}
          仅一条直线保持方向，矩阵不能在实数域对角化。
        </>
      );
    case "complex":
      return (
        <>
          <strong>实平面中没有不偏转的方向。</strong>{" "}
          每个非零向量都同时经历旋转与伸缩。
        </>
      );
  }
}

export function EigenScene({ theme }: SceneProps) {
  const isMobile = useMediaQuery("(max-width: 760px)");
  const [state, setState, resetState] = useLocalStorage(
    "basis-lab:eigen",
    eigenDefaults,
  );
  const stageRef = useRef<VisualizationStageHandle>(null);
  const dragging = useRef(false);
  const derived = useMemo(() => deriveEigen(state), [state]);
  const { analysis } = derived;

  const render = useCallback(
    (frame: VisualizationRenderFrame) => {
      const { ctx, viewport, width, height, easedProgress } = frame;
      const palette = getCanvasPalette(theme);
      ctx.fillStyle = palette.background;
      ctx.fillRect(0, 0, width, height);
      drawGrid(ctx, viewport, palette);
      drawAxes(ctx, viewport, palette);

      const animated = interpolateMat2(
        IDENTITY_MAT2,
        state.matrix,
        easedProgress,
      );
      drawCircle(ctx, viewport, [0, 0], 1.35, {
        stroke: palette.neutral,
        dash: [4, 4],
        alpha: 0.65,
      });
      drawTransformedCircle(
        ctx,
        viewport,
        animated,
        palette.red,
        palette.redFill,
        1.35,
      );

      if (state.showField) {
        const samples = 28;
        for (let index = 0; index < samples; index += 1) {
          const angle = (index / samples) * Math.PI * 2;
          const source: Vec2 = [Math.cos(angle) * 1.35, Math.sin(angle) * 1.35];
          const target = applyMat2(animated, source);
          drawLine(ctx, viewport, source, target, {
            color: palette.neutral,
            width: 0.9,
            alpha: 0.22,
          });
          drawPoint(ctx, viewport, target, palette.neutral, 1.6, false);
        }
      }

      if (analysis.kind === "two-real") {
        analysis.eigenpairs.forEach((pair, index) => {
          const color = index === 0 ? palette.blue : palette.yellow;
          const label = index === 0 ? "q₁" : "q₂";
          drawInfiniteLine(ctx, viewport, pair.vector, {
            color,
            width: 1.7,
            alpha: 0.9,
            dash: [7, 5],
          });
          drawVector(ctx, viewport, pair.vector, { color, label, width: 2.2 });
          const animatedScale = 1 + (pair.value - 1) * easedProgress;
          drawVector(ctx, viewport, scaleVec2(pair.vector, animatedScale), {
            color,
            label: `${label}·${formatNumber(animatedScale)}`,
            width: 2.8,
            alpha: 0.9,
          });
        });
      } else if (analysis.kind === "repeated") {
        drawCircle(ctx, viewport, [0, 0], 1.75, {
          stroke: palette.blue,
          width: 2,
          alpha: 0.75,
        });
        drawLabel(
          ctx,
          viewport,
          [1.25, 1.25],
          "所有方向均为特征方向",
          palette.blue,
          [8, -4],
        );
      } else if (analysis.kind === "defective") {
        drawInfiniteLine(ctx, viewport, analysis.eigenvector, {
          color: palette.blue,
          width: 2,
          dash: [7, 5],
        });
        drawVector(ctx, viewport, analysis.eigenvector, {
          color: palette.blue,
          label: "q",
          width: 2.6,
        });
      } else {
        const sense = analysis.rotationSense === "counterclockwise" ? "↺" : "↻";
        drawLabel(
          ctx,
          viewport,
          [1.4, 1.55],
          `${sense} 无实特征方向`,
          palette.red,
          [0, 0],
        );
      }

      drawVector(ctx, viewport, state.seed, {
        color: palette.cyan,
        label: "seed",
        width: 2.1,
        dash: [5, 4],
      });
      drawPoint(
        ctx,
        viewport,
        state.seed,
        palette.cyan,
        4,
        true,
        palette.background,
      );

      if (state.showOrbit && derived.orbit.length > 1) {
        const visibleSegments = Math.ceil(
          easedProgress * (derived.orbit.length - 1),
        );
        for (let index = 1; index <= visibleSegments; index += 1) {
          const previous = derived.orbit[index - 1]!;
          const current = derived.orbit[index]!;
          drawLine(ctx, viewport, previous, current, {
            color: palette.red,
            width: 1.4,
            alpha: 0.35 + (index / derived.orbit.length) * 0.5,
          });
          drawPoint(ctx, viewport, current, palette.red, 3, false);
          drawLabel(
            ctx,
            viewport,
            current,
            String(index),
            palette.red,
            [5, -5],
          );
        }
      }
    },
    [analysis, derived.orbit, state, theme],
  );

  const onPointerDown = useCallback(
    (event: VisualizationPointerEvent) => {
      if (!isWorldPointNearCanvas(state.seed, event.canvas, event.viewport)) {
        return false;
      }
      dragging.current = true;
      return true;
    },
    [state.seed],
  );

  const onPointerMove = useCallback(
    (event: VisualizationPointerEvent) => {
      if (!dragging.current) return;
      setState((current) => ({ ...current, seed: event.world }));
    },
    [setState],
  );

  const stopDragging = () => {
    dragging.current = false;
  };

  const setPreset = (matrix: Mat2) => {
    setState((current) => ({ ...current, matrix }));
    window.setTimeout(() => stageRef.current?.replay(), 0);
  };

  const notice =
    analysis.kind === "complex" ? (
      <Notice tone="warning">判别式小于零，实数域内没有特征向量。</Notice>
    ) : analysis.kind === "defective" ? (
      <Notice tone="warning">仅有一个线性无关特征向量，矩阵不可对角化。</Notice>
    ) : (
      <Notice tone="success">实特征方向已在画布中高亮。</Notice>
    );

  return (
    <SceneLayout
      id="eigen"
      index="03"
      title="特征系统"
      subtitle="寻找变换中不偏转的方向"
      formulaLabel="特征值"
      formula={eigenFormula(analysis)}
      formulaStatus={analysisLabel(analysis)}
      formulaTone={
        analysis.kind === "complex" || analysis.kind === "defective"
          ? "warning"
          : "positive"
      }
      insight={eigenInsight(analysis)}
      stage={
        <VisualizationStage
          key={isMobile ? "mobile" : "desktop"}
          ref={stageRef}
          render={render}
          renderKey={state}
          viewport={{
            scale: isMobile ? 50 : 73,
            center: isMobile ? [0, 0.3] : [0, 0],
          }}
          duration={1150}
          ariaLabel="矩阵作用下的方向场、特征方向与幂迭代轨迹"
          fallbackDescription={`${analysisLabel(analysis)}，${eigenFormula(analysis)}。`}
          showExportButton
          exportFilename="basis-lab-eigen.png"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={stopDragging}
          onPointerCancel={stopDragging}
        />
      }
      inspector={
        <>
          <ControlSection
            title="线性算子"
            caption="特征多项式为 λ² − tr(A)λ + det(A)"
            action={
              <IconButton label="恢复默认算子" onClick={resetState}>
                <RotateCcw size={15} />
              </IconButton>
            }
          >
            <MatrixInput
              label="特征矩阵"
              value={state.matrix}
              onChange={(matrix) =>
                setState((current) => ({ ...current, matrix }))
              }
            />
            <PresetGrid
              label="特征系统预设"
              presets={eigenPresets}
              onSelect={setPreset}
            />
          </ControlSection>

          <ControlSection
            title="幂迭代"
            caption="反复应用 A 并归一化，观察方向收敛"
          >
            <VectorInput
              label="seed"
              name="seed"
              value={state.seed}
              onChange={(seed) => setState((current) => ({ ...current, seed }))}
            />
            <RangeField
              label="迭代次数"
              value={state.iterations}
              min={1}
              max={9}
              step={1}
              format={(value) => `${value} 次`}
              onChange={(iterations) =>
                setState((current) => ({ ...current, iterations }))
              }
            />
            <div className="toggle-grid">
              <Toggle
                label="方向场"
                checked={state.showField}
                onChange={(showField) =>
                  setState((current) => ({ ...current, showField }))
                }
              />
              <Toggle
                label="迭代轨迹"
                checked={state.showOrbit}
                onChange={(showOrbit) =>
                  setState((current) => ({ ...current, showOrbit }))
                }
              />
            </div>
          </ControlSection>

          <ControlSection title="谱读数">
            <MetricList
              metrics={[
                {
                  label: "tr A",
                  value: formatNumber(analysis.trace),
                  key: "trace",
                },
                {
                  label: "det A",
                  value: formatNumber(analysis.determinant),
                  key: "determinant",
                },
                {
                  label: "Δ",
                  value: formatNumber(analysis.discriminant),
                  key: "discriminant",
                  tone: analysis.discriminant < 0 ? "red" : "blue",
                },
                {
                  label: "seed",
                  value: formatVector(state.seed),
                  key: "seed",
                  tone: "cyan",
                },
              ]}
            />
            {notice}
          </ControlSection>
        </>
      }
    />
  );
}
