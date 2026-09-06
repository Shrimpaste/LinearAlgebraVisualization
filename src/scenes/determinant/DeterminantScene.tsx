import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { linear } from "../../engine/easing";
import { RotateCcw } from "lucide-react";
import type { SceneProps } from "../../app/types";
import { addVec2, type Mat2, type Vec2 } from "../../math";
import {
  VisualizationStage,
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
import { Toggle } from "../../components/ui/Toggle";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import {
  drawAxes,
  drawGrid,
  drawLabel,
  drawPolygon,
  drawVector,
  getCanvasPalette,
} from "../../rendering";
import { formatNumber } from "../../utils/format";
import {
  determinantDefaults,
  determinantPresets,
  deriveDeterminant,
  determinantFrame,
} from "./model";

export function DeterminantScene({ theme }: SceneProps) {
  const isMobile = useMediaQuery("(max-width: 760px)");
  const [state, setState, resetState] = useLocalStorage(
    "basis-lab:determinant",
    determinantDefaults,
  );
  const stageRef = useRef<VisualizationStageHandle>(null);
  const derived = useMemo(() => deriveDeterminant(state), [state]);
  const [progress, setProgress] = useState(1);
  const replayRequested = useRef(false);
  const current = deriveDeterminant({
    ...state,
    matrix: determinantFrame(state, progress),
  });
  useEffect(() => {
    if (replayRequested.current) {
      replayRequested.current = false;
      stageRef.current?.replay();
    }
  }, [state]);

  const render = useCallback(
    (frame: VisualizationRenderFrame) => {
      const { ctx, viewport, width, height, easedProgress } = frame;
      const palette = getCanvasPalette(theme);
      ctx.fillStyle = palette.background;
      ctx.fillRect(0, 0, width, height);
      if (state.showGrid) drawGrid(ctx, viewport, palette);
      drawAxes(ctx, viewport, palette);

      const animated = determinantFrame(state, easedProgress);
      const first: Vec2 = [animated[0], animated[2]];
      const second: Vec2 = [animated[1], animated[3]];
      const corner = addVec2(first, second);

      if (state.showSource) {
        drawPolygon(
          ctx,
          viewport,
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
          ],
          {
            fill: palette.neutralFill,
            stroke: palette.neutral,
            dash: [5, 4],
          },
        );
      }

      const currentDet = animated[0] * animated[3] - animated[1] * animated[2];
      const fill = currentDet < 0 ? palette.redFill : palette.cyanFill;
      const stroke = currentDet < 0 ? palette.red : palette.cyan;
      drawPolygon(ctx, viewport, [[0, 0], first, corner, second], {
        fill,
        stroke,
        width: 2.2,
      });

      drawVector(ctx, viewport, first, {
        color: palette.red,
        label: "a₁",
        width: 2.5,
      });
      drawVector(ctx, viewport, second, {
        color: palette.yellow,
        label: "a₂",
        width: 2.5,
      });

      if (state.showSweep && Math.abs(currentDet) > 0.002) {
        const slices = 13;
        for (let index = 1; index < slices; index += 1) {
          const ratio = index / slices;
          const start: Vec2 = [second[0] * ratio, second[1] * ratio];
          const end: Vec2 = [start[0] + first[0], start[1] + first[1]];
          const startCanvas = viewport.worldToCanvas(start);
          const endCanvas = viewport.worldToCanvas(end);
          ctx.save();
          ctx.strokeStyle = stroke;
          ctx.globalAlpha = 0.18;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(startCanvas[0], startCanvas[1]);
          ctx.lineTo(endCanvas[0], endCanvas[1]);
          ctx.stroke();
          ctx.restore();
        }
      }

      const center: Vec2 = [corner[0] / 2, corner[1] / 2];
      drawLabel(
        ctx,
        viewport,
        center,
        `当前有向面积 = ${formatNumber(currentDet)}`,
        palette.text,
        [10, -8],
      );
    },
    [state, theme],
  );

  const swapColumns = () => {
    replayRequested.current = true;
    setState((current) => ({
      ...current,
      animationFrom: current.matrix,
      animationKind: "linear",
      operation: "交换两列：目标面积变号；交换过程中会经过退化状态。",
      matrix: [
        current.matrix[1],
        current.matrix[0],
        current.matrix[3],
        current.matrix[2],
      ],
    }));
  };

  const addFirstToSecond = (factor: number) => {
    replayRequested.current = true;
    setState((current) => ({
      ...current,
      animationFrom: current.matrix,
      animationKind: "linear",
      operation: `第二列加上 ${factor} 倍第一列：底与高不变，整个过程面积保持。`,
      matrix: [
        current.matrix[0],
        current.matrix[1] + factor * current.matrix[0],
        current.matrix[2],
        current.matrix[3] + factor * current.matrix[2],
      ],
    }));
  };

  const scaleSecond = () => {
    replayRequested.current = true;
    setState((current) => ({
      ...current,
      animationFrom: current.matrix,
      animationKind: "linear",
      operation: "第二列乘以 2：高度与目标面积一起乘以 2。",
      matrix: [
        current.matrix[0],
        current.matrix[1] * 2,
        current.matrix[2],
        current.matrix[3] * 2,
      ],
    }));
  };

  const setPreset = (matrix: Mat2) => {
    replayRequested.current = true;
    const rotation =
      matrix[0] === 0 && matrix[1] === -1 && matrix[2] === 1 && matrix[3] === 0;
    setState((current) => ({
      ...current,
      matrix,
      animationFrom: undefined,
      animationKind: rotation ? "rotation" : "linear",
      operation: rotation
        ? "按角度旋转：整个过程面积保持为 1。"
        : "从单位矩阵线性插值到目标 A；中间态可能退化。",
    }));
  };

  const tone =
    derived.rank < 2
      ? "negative"
      : derived.determinant < 0
        ? "warning"
        : "positive";

  return (
    <SceneLayout
      id="determinant"
      index="05"
      title="行列式"
      subtitle="读取面积缩放与空间定向"
      formulaLabel="目标 det A"
      formula={
        <>
          {formatNumber(state.matrix[0])} × {formatNumber(state.matrix[3])} −{" "}
          {formatNumber(state.matrix[1])} × {formatNumber(state.matrix[2])} ={" "}
          {formatNumber(derived.determinant)}
        </>
      }
      formulaStatus={derived.orientation}
      formulaTone={tone}
      insight={
        state.operation ? (
          <>
            <strong>{state.operation}</strong> 当前 M(t) 与目标 A
            的读数分别显示。
          </>
        ) : derived.rank < 2 ? (
          <>
            <strong>平行四边形坍缩为线段。</strong> 面积变为零，矩阵不再可逆。
          </>
        ) : derived.determinant < 0 ? (
          <>
            <strong>负号记录定向翻转。</strong> 几何面积仍是 |det A| ={" "}
            {formatNumber(derived.area)}。
          </>
        ) : (
          <>
            <strong>行列式是局部面积的统一缩放因子。</strong>{" "}
            平面中每个区域都按相同比例改变。
          </>
        )
      }
      stage={
        <VisualizationStage
          key={isMobile ? "mobile" : "desktop"}
          ref={stageRef}
          render={render}
          renderKey={state}
          viewport={{ scale: isMobile ? 68 : 92, center: [0.35, 0.25] }}
          duration={950}
          easing={linear}
          onProgressChange={setProgress}
          ariaLabel="单位正方形变换为有向平行四边形"
          fallbackDescription={`矩阵行列式为 ${formatNumber(derived.determinant)}，面积缩放为 ${formatNumber(derived.area)}。`}
          showExportButton
          exportFilename="basis-lab-determinant.png"
        />
      }
      inspector={
        <>
          <ControlSection
            title="矩阵"
            caption="两列分别是平行四边形的两条边"
            action={
              <IconButton label="恢复默认矩阵" onClick={resetState}>
                <RotateCcw size={15} />
              </IconButton>
            }
          >
            <MatrixInput
              label="行列式矩阵"
              value={state.matrix}
              onChange={(matrix) =>
                setState((current) => ({
                  ...current,
                  matrix,
                  animationFrom: undefined,
                  animationKind: "linear",
                  operation: undefined,
                }))
              }
            />
            <PresetGrid
              label="行列式预设"
              presets={determinantPresets}
              onSelect={setPreset}
            />
          </ControlSection>

          <ControlSection title="列操作" caption="观察哪些操作改变行列式">
            <div
              className="current-frame-readout"
              aria-live="off"
              data-testid="determinant-current"
            >
              当前 det M(t) ={" "}
              <strong>{formatNumber(current.determinant)}</strong>
              <span>
                目标 det A = {formatNumber(derived.determinant)} ·{" "}
                {Math.round(progress * 100)}%
              </span>
            </div>
            <div className="operation-row">
              <button
                type="button"
                className="text-button"
                onClick={swapColumns}
              >
                交换两列
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => addFirstToSecond(1)}
              >
                a₂ += a₁
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => addFirstToSecond(-1)}
              >
                a₂ −= a₁
              </button>
              <button
                type="button"
                className="text-button"
                onClick={scaleSecond}
              >
                a₂ ×2
              </button>
            </div>
          </ControlSection>

          <ControlSection title="图层">
            <div className="toggle-grid">
              <Toggle
                label="原始单位方形"
                checked={state.showSource}
                onChange={(showSource) =>
                  setState((current) => ({ ...current, showSource }))
                }
              />
              <Toggle
                label="坐标网格"
                checked={state.showGrid}
                onChange={(showGrid) =>
                  setState((current) => ({ ...current, showGrid }))
                }
              />
              <Toggle
                label="面积扫描线"
                checked={state.showSweep}
                onChange={(showSweep) =>
                  setState((current) => ({ ...current, showSweep }))
                }
              />
            </div>
          </ControlSection>

          <ControlSection title="面积读数">
            <MetricList
              metrics={[
                {
                  label: "det A",
                  value: formatNumber(derived.determinant),
                  key: "determinant",
                  tone: derived.determinant < 0 ? "red" : "cyan",
                },
                {
                  label: "|det A|",
                  value: formatNumber(derived.area),
                  key: "area",
                  tone: "yellow",
                },
                { label: "rank A", value: String(derived.rank), key: "rank" },
                {
                  label: "orientation",
                  value: derived.orientation,
                  key: "orientation",
                },
              ]}
            />
            {derived.rank < 2 ? (
              <Notice tone="warning">
                列向量线性相关，二维面积被压缩到零。
              </Notice>
            ) : (
              <Notice tone="success">矩阵可逆，面积与定向信息完整。</Notice>
            )}
          </ControlSection>
        </>
      }
    />
  );
}
