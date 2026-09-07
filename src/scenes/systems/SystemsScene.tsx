import { lazy, Suspense, useCallback, useMemo } from "react";
import type { SceneProps } from "../../app/types";
import type { Dimension } from "../../math/nd/types";
import type { Vec2 } from "../../math";
import { SceneLayout } from "../../components/SceneLayout";
import {
  VisualizationStage,
  type VisualizationRenderFrame,
} from "../../components/VisualizationStage";
import { ControlSection } from "../../components/ui/ControlSection";
import { DynamicMatrixInput } from "../../components/ui/DynamicMatrixInput";
import { DynamicVectorInput } from "../../components/ui/DynamicVectorInput";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { MetricList } from "../../components/ui/MetricList";
import { RangeField } from "../../components/ui/RangeField";
import { Prediction } from "../../components/ui/Prediction";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import {
  drawAxes,
  drawGrid,
  drawVector,
  drawInfiniteLine,
  getCanvasPalette,
} from "../../rendering";
import { formatNumber } from "../../utils/format";
import { deriveSystems, migrateSystemsState, systemsDefaults } from "./model";

const ThreeSpanStage = lazy(() =>
  import("../span/ThreeSpanStage").then((m) => ({ default: m.ThreeSpanStage })),
);
const dimensions = [
  { value: "1", label: "1维" },
  { value: "2", label: "2维" },
  { value: "3", label: "3维" },
];
const vectorText = (v: readonly number[]) =>
  `(${v.map((n) => formatNumber(n)).join(", ")})`;
export function SystemsScene({ theme }: SceneProps) {
  const [state, setState, reset] = useLocalStorage(
    "basis-lab:systems",
    systemsDefaults,
    migrateSystemsState,
  );
  const d = useMemo(() => deriveSystems(state), [state]);
  const vectors = useMemo(
    () =>
      Array.from({ length: state.columns }, (_, j) =>
        state.matrix.map((row) => row[j]!),
      ),
    [state.matrix, state.columns],
  );
  const basisIndices = useMemo(
    () => Array.from({ length: d.rank }, (_, i) => i),
    [d.rank],
  );
  const render = useCallback(
    ({
      ctx,
      viewport,
      width,
      height,
      easedProgress,
    }: VisualizationRenderFrame) => {
      const p = getCanvasPalette(theme);
      ctx.fillStyle = p.background;
      ctx.fillRect(0, 0, width, height);
      drawGrid(ctx, viewport, p);
      drawAxes(ctx, viewport, p);
      const xy = (v: readonly number[]): Vec2 => [v[0] ?? 0, v[1] ?? 0];
      if (d.rank === 1)
        drawInfiniteLine(ctx, viewport, xy(d.columnBasis[0]!), {
          color: p.cyan,
          width: 12,
          alpha: 0.12,
        });
      if (d.rank === 2) {
        ctx.fillStyle = p.cyanFill;
        ctx.fillRect(0, 0, width, height);
      }
      vectors.forEach((v, i) =>
        drawVector(ctx, viewport, xy(v), {
          color: p.neutral,
          label: `a${i + 1}`,
          width: 1.5,
          dash: [4, 4],
        }),
      );
      drawVector(ctx, viewport, xy(state.b), {
        color: p.yellow,
        label: "b · 目标",
        width: 2,
      });
      const fit = xy(d.fitted.map((v) => v * easedProgress));
      drawVector(ctx, viewport, fit, {
        color: p.cyan,
        label: "Ax · 可达点",
        width: 3,
      });
      drawVector(ctx, viewport, xy(d.residual.map((v) => v * easedProgress)), {
        origin: fit,
        color: p.red,
        label: "r · 残差",
        labelOffset: [8, 20],
        dash: [5, 4],
      });
    },
    [theme, d, vectors, state.b],
  );
  const changeDimension = (key: "rows" | "columns", value: string) =>
    setState(
      migrateSystemsState({
        ...state,
        [key]: Number(value) as Dimension,
        parameters: [0, 0, 0],
      }),
    );
  const preset = (matrix: number[][], b: number[]) =>
    setState(
      migrateSystemsState({
        rows: matrix.length,
        columns: matrix[0]!.length,
        matrix,
        b,
      }),
    );
  return (
    <SceneLayout
      id="systems"
      index="08"
      title="解集与最小二乘"
      subtitle="从能否到达，到最近的可达点"
      formulaLabel="目标解集"
      formula="Ax = b̂，b = b̂ + r"
      formulaStatus={d.status}
      formulaTone={d.exact ? "positive" : "warning"}
      stage={
        state.rows === 3 ? (
          <Suspense
            fallback={<div className="stage-loading">正在装载三维空间…</div>}
          >
            <ThreeSpanStage
              columnBasis={d.columnBasis}
              solutionMode
              vectors={vectors}
              coefficients={d.solution}
              basisIndices={basisIndices}
              rank={d.rank as 0 | 1 | 2 | 3}
              target={state.b}
              showTarget
              theme={theme}
              exportFilename="basis-lab-systems.png"
            />
          </Suspense>
        ) : (
          <VisualizationStage
            showExportButton
            render={render}
            ariaLabel="方程组的列空间、目标与残差"
            exportFilename="basis-lab-systems.png"
          />
        )
      }
      insight={
        <>
          青色是可达点 Ax，黄色是目标
          b。最小二乘使二者距离最小，红色残差与列空间正交。自由参数沿零空间移动
          x，不改变 Ax；参数全为0时取得最小范数解。
        </>
      }
      inspector={
        <>
          <ControlSection
            title="问题与维数"
            caption="列数是未知数个数，行数是方程个数。"
          >
            <p className="dimension-label">方程个数 m · 陪域维数</p>
            <SegmentedControl
              label="方程个数"
              value={String(state.rows)}
              options={dimensions}
              onChange={(v) => changeDimension("rows", v)}
            />
            <p className="dimension-label">未知数个数 n · 定义域维数</p>
            <SegmentedControl
              label="未知数个数"
              value={String(state.columns)}
              options={dimensions}
              onChange={(v) => changeDimension("columns", v)}
            />
            <div className="preset-grid" aria-label="方程组预设">
              <button
                onClick={() =>
                  preset(
                    [
                      [1, 0],
                      [0, 1],
                    ],
                    [2, 1],
                  )
                }
              >
                唯一解
              </button>
              <button
                onClick={() =>
                  preset(
                    [
                      [1, 2],
                      [1, 2],
                    ],
                    [2, 2],
                  )
                }
              >
                无穷多解
              </button>
              <button onClick={reset}>无精确解</button>
              <button onClick={() => preset([[1], [1], [1]], [1, 2, 3])}>
                三维拟合
              </button>
            </div>
            <DynamicMatrixInput
              label="方程矩阵"
              value={{
                rows: state.rows,
                columns: state.columns,
                entries: state.matrix.flat(),
              }}
              onChange={(v) =>
                setState({
                  ...state,
                  matrix: Array.from({ length: state.rows }, (_, i) =>
                    v.entries.slice(i * state.columns, (i + 1) * state.columns),
                  ),
                  parameters: [0, 0, 0],
                })
              }
            />
            <DynamicVectorInput
              label="目标向量"
              name="b"
              tone="yellow"
              value={{ dimension: state.rows, entries: state.b }}
              onChange={(v) => setState({ ...state, b: v.entries })}
            />
          </ControlSection>
          <ControlSection
            title="解集与残差"
            caption="数值秩与精确性使用相对容差；接近退化时请同时检查残差。"
          >
            <MetricList
              metrics={[
                { label: "判定", value: d.status, key: "solution-status" },
                { label: "秩 / 未知数", value: `${d.rank} / ${state.columns}` },
                {
                  label: "最小范数 x*",
                  value: vectorText(d.minimum),
                  key: "minimum-solution",
                },
                {
                  label: "当前 x",
                  value: vectorText(d.solution),
                  key: "current-solution",
                },
                { label: "可达点 Ax", value: vectorText(d.fitted) },
                {
                  label: "距离 ‖r‖",
                  value: formatNumber(d.residualNorm),
                  key: "residual",
                },
              ]}
            />
          </ControlSection>
          <ControlSection
            title="沿零空间探索"
            caption={
              d.nullspace.length
                ? "x = x* + Σtᵢnᵢ。移动滑杆，观察 Ax 与距离保持不变。"
                : "零空间只有零向量，因此没有自由参数。"
            }
          >
            {d.nullspace.map((v, i) => (
              <div key={i}>
                <p className="nullspace-vector">
                  n{i + 1} = {vectorText(v)}
                </p>
                <RangeField
                  label={`自由参数 t${i + 1}`}
                  min={-4}
                  max={4}
                  step={0.05}
                  value={state.parameters[i] ?? 0}
                  onChange={(value) =>
                    setState({
                      ...state,
                      parameters: state.parameters.map((v, j) =>
                        j === i ? value : v,
                      ),
                    })
                  }
                />
              </div>
            ))}
            {d.nullspace.length > 0 && (
              <button
                className="text-button"
                onClick={() => setState({ ...state, parameters: [0, 0, 0] })}
              >
                回到最小范数解
              </button>
            )}
          </ControlSection>
          <ControlSection title="先预测，再验证">
            <Prediction
              question="目标在列空间之外时，增加零空间方向能消除残差吗？"
              options={["能，只要参数够大", "不能，Ax不会改变"]}
              correct={1}
              explanation="An=0，所以A(x+tn)=Ax。要改变最近的可达点，需要改变矩阵的列空间或目标。"
            />
          </ControlSection>
          <ControlSection advanced title="正交证书">
            <MetricList
              metrics={[
                {
                  label: "Aᵀr 的长度",
                  value: formatNumber(d.normalResidual),
                },
                {
                  label: "相对拟合残差",
                  value: formatNumber(d.relativeResidual),
                },
                { label: "零空间维数", value: String(d.nullspace.length) },
              ]}
            />
          </ControlSection>
        </>
      }
    />
  );
}
