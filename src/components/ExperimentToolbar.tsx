import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Undo2, Redo2, Share2 } from "lucide-react";
import type { SceneId } from "../app/types";
import {
  captureExperiment,
  encodeExperiment,
  openExperiment,
  sceneKey,
  transferExperiment,
  validateExperiment,
  type Experiment,
} from "../app/experiments";
import {
  stateControllers,
  stateRevision,
  subscribeState,
} from "../app/stateBridge";
import { IconButton } from "./ui/IconButton";

const destinations: { value: SceneId; label: string }[] = [
  { value: "systems", label: "解集与最小二乘" },
  { value: "transform", label: "线性变换" },
  { value: "determinant", label: "行列式" },
  { value: "eigen", label: "特征系统" },
  { value: "operator", label: "谱分解" },
  { value: "decomposition", label: "SVD / 极分解" },
];
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function teachingCard(scene: SceneId) {
  const root = document.querySelector<HTMLElement>(`[data-module="${scene}"]`);
  const source = root?.querySelector("canvas");
  if (!source) throw new Error("画布尚未就绪。");
  const experiment = captureExperiment(scene);
  const parameterLabels: Record<string, string> = {
    matrix: "矩阵 A",
    secondMatrix: "第二步矩阵",
    vector: "测试向量",
    vectors: "生成向量组",
    coefficients: "组合系数",
    b: "目标 b",
    target: "目标向量",
    parameters: "自由参数",
    probe: "候选方向",
    basis: "共享坐标基",
    domainBasis: "定义域基",
    codomainBasis: "陪域基",
    metric: "度量矩阵 G",
    first: "向量 u",
    second: "向量 v",
    mode: "实验模式",
    field: "标量域",
  };
  const text = [
    root?.querySelector("h1")?.textContent ?? scene,
    root?.querySelector(".formula-readout")?.textContent ?? "",
    `当前进度 ${Math.round((experiment.view?.progress ?? 1) * 100)}% · 图形为当前态，参数定义目标实验`,
    ...Object.entries(experiment.state as Record<string, unknown>)
      .filter(([key]) => key in parameterLabels)
      .map(
        ([key, value]) => `${parameterLabels[key]}: ${JSON.stringify(value)}`,
      ),
    root?.querySelector(".insight-strip > div, .mobile-note p")?.textContent ??
      "",
  ];
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法生成图卡。");
  ctx.font = '14px "Microsoft YaHei", monospace';
  const lines = text.flatMap((paragraph) => {
    const wrapped: string[] = [];
    let line = "";
    for (const char of paragraph) {
      if (ctx.measureText(line + char).width > 1000) {
        wrapped.push(line);
        line = "";
      }
      line += char;
    }
    return [...wrapped, line];
  });
  const width = 1100,
    imageHeight = Math.round((source.height / source.width) * 1000);
  canvas.width = width;
  canvas.height = imageHeight + 90 + lines.length * 24;
  ctx.fillStyle = "#f4f6f4";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#171b1a";
  ctx.font = '600 24px "Microsoft YaHei", sans-serif';
  ctx.fillText("基域 · 实验图卡", 50, 42);
  ctx.drawImage(source, 50, 65, 1000, imageHeight);
  ctx.font = '14px "Microsoft YaHei", monospace';
  lines.forEach((line, i) => ctx.fillText(line, 50, imageHeight + 95 + i * 24));
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("图卡导出失败。");
  download(blob, `basis-lab-${scene}-lesson.png`);
}

export function ExperimentToolbar({ scene }: { scene: SceneId }) {
  useSyncExternalStore(subscribeState, stateRevision, stateRevision);
  const controller = stateControllers.get(sceneKey(scene));
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [target, setTarget] = useState<SceneId>("transform");
  const input = useRef<HTMLInputElement>(null);
  const [saved, setSaved] = useState<Experiment[]>(() => {
    try {
      const value: unknown = JSON.parse(
        localStorage.getItem("basis-lab:snapshots") ?? "[]",
      );
      return Array.isArray(value)
        ? value
            .slice(0, 20)
            .filter((item) => item?.format === "basis-lab-experiment")
        : [];
    } catch {
      return [];
    }
  });
  const perform = async (action: () => Promise<void> | void) => {
    try {
      await action();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "操作未完成，请重试。",
      );
    }
  };
  const saveList = (items: Experiment[]) => {
    localStorage.setItem("basis-lab:snapshots", JSON.stringify(items));
    setSaved(items);
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        !(event.ctrlKey || event.metaKey) ||
        event.key.toLowerCase() !== "z" ||
        (event.target instanceof Element &&
          event.target.closest("input,textarea,select,[contenteditable]"))
      )
        return;
      event.preventDefault();
      const current = stateControllers.get(sceneKey(scene));
      if (event.shiftKey) current?.redo();
      else current?.undo();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [scene]);
  return (
    <div className="experiment-toolbar">
      <div className="experiment-quick-actions">
        <IconButton
          label="撤销实验修改"
          disabled={!controller?.canUndo()}
          onClick={() => controller?.undo()}
        >
          <Undo2 size={16} />
        </IconButton>
        <IconButton
          label="重做实验修改"
          disabled={!controller?.canRedo()}
          onClick={() => controller?.redo()}
        >
          <Redo2 size={16} />
        </IconButton>
        <IconButton
          label="分享当前实验"
          onClick={() =>
            void perform(async () => {
              const experiment = captureExperiment(scene);
              const url = new URL(window.location.href);
              url.hash = `${scene}?experiment=${encodeExperiment(experiment)}`;
              await navigator.clipboard.writeText(url.href);
              setMessage("实验链接已复制，包含参数与当前步骤。");
            })
          }
        >
          <Share2 size={16} />
        </IconButton>
        <span>修改可撤销 · Ctrl Z</span>
      </div>
      <details>
        <summary>实验快照、导出与跨模块</summary>
        <div className="experiment-actions">
          <label>
            快照名称
            <input
              value={name}
              maxLength={80}
              placeholder="例如：旋转后的面积"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <button
            className="text-button"
            type="button"
            onClick={() =>
              void perform(() => {
                saveList(
                  [
                    captureExperiment(scene, name.trim() || "未命名实验"),
                    ...saved,
                  ].slice(0, 20),
                );
                setMessage("已保存快照（最多20个）。");
              })
            }
          >
            保存快照
          </button>
          {saved.map((item, i) => (
            <div className="snapshot-row" key={`${item.name}-${i}`}>
              <span>
                {item.name} · {item.scene}
              </span>
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  void perform(async () => {
                    openExperiment(await validateExperiment(item));
                  })
                }
              >
                载入
              </button>
              <button
                type="button"
                className="text-button"
                aria-label={`删除快照 ${item.name}`}
                onClick={() =>
                  void perform(() =>
                    saveList(saved.filter((_, index) => index !== i)),
                  )
                }
              >
                删除
              </button>
            </div>
          ))}
          <div className="experiment-button-row">
            <button
              type="button"
              className="text-button"
              onClick={() =>
                void perform(() =>
                  download(
                    new Blob(
                      [
                        JSON.stringify(
                          captureExperiment(scene, name || "当前实验"),
                          null,
                          2,
                        ),
                      ],
                      { type: "application/json" },
                    ),
                    `basis-lab-${scene}.json`,
                  ),
                )
              }
            >
              导出参数 JSON
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => input.current?.click()}
            >
              导入实验
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => void perform(() => teachingCard(scene))}
            >
              导出教学图卡
            </button>
          </div>
          <input
            ref={input}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            aria-label="导入实验文件"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file)
                void perform(async () => {
                  if (file.size > 64000)
                    throw new Error("实验文件不能超过64KB。");
                  const experiment = await validateExperiment(
                    JSON.parse(await file.text()),
                  );
                  openExperiment(experiment);
                });
            }}
          />
          <label>
            携带当前实际映射到
            <select
              value={target}
              onChange={(event) => setTarget(event.target.value as SceneId)}
            >
              {destinations.map((item) => (
                <option value={item.value} key={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="text-button"
            onClick={() =>
              void perform(async () =>
                openExperiment(
                  await transferExperiment(captureExperiment(scene), target),
                ),
              )
            }
          >
            带入矩阵
          </button>
          <small>
            带入标准坐标中的实际映射；不兼容的维数或非零虚部会明确提示。
          </small>
        </div>
      </details>
      {message && (
        <p role="status" className="experiment-message">
          {message}
        </p>
      )}
    </div>
  );
}
