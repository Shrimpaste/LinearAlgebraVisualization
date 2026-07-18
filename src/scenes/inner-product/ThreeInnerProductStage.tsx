import {
  Download,
  LocateFixed,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
} from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ThemeMode } from "../../app/types";
import { IconButton } from "../../components/ui/IconButton";
import { AnimationTimeline, type TimelineSnapshot } from "../../engine";
import {
  applyRealMatrix,
  choleskyMetricEmbedding,
  type RealMatrix,
  type RealVector,
} from "../../math/nd";
import { getCanvasPalette, type CanvasPalette } from "../../rendering";
import type { InnerProductMode } from "./model";

export interface ThreeInnerProductStageHandle {
  replay(): void;
  seek(progress: number): void;
}

interface Props {
  readonly first: RealVector;
  readonly second: RealVector;
  readonly metric: RealMatrix;
  readonly mode: InnerProductMode;
  readonly projection: RealVector | null;
  readonly residual: RealVector | null;
  readonly orthonormal: readonly RealVector[];
  readonly valid: boolean;
  readonly showUnitSphere: boolean;
  readonly theme: ThemeMode;
  readonly exportFilename: string;
}

interface Runtime {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
}

interface ArrowVisual {
  arrow: THREE.ArrowHelper;
  label: THREE.Sprite | null;
  labelNudge: THREE.Vector3;
}

interface ProjectionVisual {
  projected: THREE.Vector3;
  residual: THREE.Vector3;
  projectionArrow: ArrowVisual;
  residualArrow: ArrowVisual;
}

interface MorphVisual extends ArrowVisual {
  from: THREE.Vector3;
  to: THREE.Vector3;
}

interface Content {
  root: THREE.Group;
  projection: ProjectionVisual | null;
  morphs: readonly MorphVisual[];
  metricCoordinates: {
    first: THREE.Vector3;
    second: THREE.Vector3;
    projection: THREE.Vector3 | null;
    residual: THREE.Vector3 | null;
  } | null;
}

const DURATION = 1100;
const EXTENT = 4;
const UNIT_X = new THREE.Vector3(1, 0, 0);
const stageStyle = {
  display: "flex",
  flexDirection: "column",
  width: "100%",
  height: "100%",
  minWidth: 0,
  minHeight: 0,
} as const;
const viewportStyle = {
  position: "relative",
  flex: "1 1 auto",
  minWidth: 0,
  minHeight: 240,
  overflow: "hidden",
} as const;
const mountStyle = { position: "absolute", inset: 0 } as const;

const modeLabels: Record<InnerProductMode, string> = {
  projection: "正交投影",
  "gram-schmidt": "Gram–Schmidt 正交化",
  axioms: "内积公理验证",
};

function embed(vector: RealVector, factor: RealMatrix) {
  const embedded = applyRealMatrix(factor, vector);
  return new THREE.Vector3(
    embedded[0] ?? 0,
    embedded[1] ?? 0,
    embedded[2] ?? 0,
  );
}

function makeLabel(text: string, color: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 72;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.font = '500 29px "IBM Plex Mono", monospace';
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = color;
  context.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    }),
  );
  sprite.scale.set(0.9, 0.34, 1);
  sprite.renderOrder = 20;
  return sprite;
}

function makeArrow(
  color: string,
  labelText: string,
  labelNudge = new THREE.Vector3(),
): ArrowVisual {
  const arrow = new THREE.ArrowHelper(UNIT_X, new THREE.Vector3(), 1, color);
  return { arrow, label: makeLabel(labelText, color), labelNudge };
}

function setArrow(
  visual: ArrowVisual,
  vector: THREE.Vector3,
  origin = new THREE.Vector3(),
) {
  const length = vector.length();
  visual.arrow.position.copy(origin);
  visual.arrow.visible = length > 1e-10;
  if (visual.arrow.visible) {
    visual.arrow.setDirection(vector.clone().normalize());
    visual.arrow.setLength(
      length,
      Math.min(0.24, length * 0.2),
      Math.min(0.13, length * 0.12),
    );
  }
  if (visual.label) {
    visual.label.visible = visual.arrow.visible;
    visual.label.position.copy(origin).add(vector);
    if (length > 1e-10) {
      visual.label.position.addScaledVector(vector, 0.13 / length);
    }
    visual.label.position.add(visual.labelNudge);
  }
}

function setArrowOpacity(visual: ArrowVisual, opacity: number) {
  for (const material of [
    visual.arrow.line.material,
    visual.arrow.cone.material,
  ]) {
    const arrowMaterial = material as THREE.Material;
    arrowMaterial.transparent = opacity < 1;
    arrowMaterial.opacity = opacity;
    arrowMaterial.depthWrite = opacity >= 1;
  }
}

function addAxes(root: THREE.Group, palette: CanvasPalette) {
  const colors = [palette.cyan, palette.yellow, palette.blue];
  for (let axis = 0; axis < 3; axis += 1) {
    const direction = new THREE.Vector3().setComponent(axis, 1);
    const geometry = new THREE.BufferGeometry().setFromPoints([
      direction.clone().multiplyScalar(-EXTENT),
      direction.clone().multiplyScalar(EXTENT),
    ]);
    root.add(
      new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({
          color: colors[axis],
          transparent: true,
          opacity: 0.5,
        }),
      ),
    );
    const label = makeLabel(`ξ${["₁", "₂", "₃"][axis]}`, colors[axis]!);
    if (label) {
      label.position.copy(direction).multiplyScalar(EXTENT + 0.3);
      root.add(label);
    }
  }
  root.add(
    new THREE.GridHelper(
      EXTENT * 2,
      EXTENT * 2,
      palette.gridMajor,
      palette.gridMinor,
    ),
  );
}

function addUnitSphere(root: THREE.Group, palette: CanvasPalette) {
  const geometry = new THREE.SphereGeometry(1, 32, 20);
  root.add(
    new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color: palette.blue,
        transparent: true,
        opacity: 0.07,
        depthWrite: false,
      }),
    ),
  );
  root.add(
    new THREE.LineSegments(
      new THREE.WireframeGeometry(geometry),
      new THREE.LineBasicMaterial({
        color: palette.blue,
        transparent: true,
        opacity: 0.14,
      }),
    ),
  );
}

function addInfiniteLine(
  root: THREE.Group,
  direction: THREE.Vector3,
  color: string,
) {
  if (direction.lengthSq() <= 1e-12) return;
  const extent = direction
    .clone()
    .normalize()
    .multiplyScalar(EXTENT * 1.35);
  const geometry = new THREE.BufferGeometry().setFromPoints([
    extent.clone().negate(),
    extent,
  ]);
  const line = new THREE.Line(
    geometry,
    new THREE.LineDashedMaterial({
      color,
      transparent: true,
      opacity: 0.48,
      dashSize: 0.16,
      gapSize: 0.1,
    }),
  );
  line.computeLineDistances();
  root.add(line);
}

function buildContent(props: Props, palette: CanvasPalette): Content {
  const root = new THREE.Group();
  addAxes(root, palette);
  const factor = props.valid ? choleskyMetricEmbedding(props.metric) : null;
  if (!factor) {
    return { root, projection: null, morphs: [], metricCoordinates: null };
  }
  if (props.showUnitSphere) addUnitSphere(root, palette);

  const first = embed(props.first, factor);
  const second = embed(props.second, factor);
  const projected = props.projection ? embed(props.projection, factor) : null;
  const residual = props.residual ? embed(props.residual, factor) : null;

  let projectionVisual: ProjectionVisual | null = null;
  const morphs: MorphVisual[] = [];
  if (props.mode === "gram-schmidt") {
    const firstSource = first.lengthSq() > 1e-12 ? first : second;
    props.orthonormal.slice(0, 2).forEach((vector, index) => {
      const visual = makeArrow(
        index === 0 ? palette.blue : palette.yellow,
        `q${["₁", "₂"][index]}`,
        new THREE.Vector3(
          index === 0 ? 0.08 : -0.08,
          index === 0 ? 0.2 : -0.18,
          0,
        ),
      ) as MorphVisual;
      visual.from = index === 0 ? firstSource : second;
      visual.to = embed(vector, factor);
      root.add(visual.arrow);
      if (visual.label) root.add(visual.label);
      morphs.push(visual);
    });
  } else {
    const firstArrow = makeArrow(
      palette.cyan,
      "u",
      props.mode === "projection"
        ? new THREE.Vector3(0.28, 0.08, 0.18)
        : new THREE.Vector3(0.08, -0.18, 0),
    );
    const secondArrow = makeArrow(
      palette.red,
      "v",
      new THREE.Vector3(0.06, 0.18, 0.04),
    );
    root.add(firstArrow.arrow, secondArrow.arrow);
    if (firstArrow.label) root.add(firstArrow.label);
    if (secondArrow.label) root.add(secondArrow.label);
    setArrow(firstArrow, first);
    setArrow(secondArrow, second);
    if (props.mode === "projection" && projected && residual) {
      setArrowOpacity(firstArrow, 0.42);
      addInfiniteLine(root, second, palette.red);
      const projectionArrow = makeArrow(
        palette.yellow,
        "projᵥu",
        new THREE.Vector3(-0.08, 0.34, 0),
      );
      const residualArrow = makeArrow(
        palette.blue,
        "r",
        new THREE.Vector3(-0.1, -0.38, 0),
      );
      root.add(projectionArrow.arrow, residualArrow.arrow);
      if (projectionArrow.label) root.add(projectionArrow.label);
      if (residualArrow.label) root.add(residualArrow.label);
      projectionVisual = {
        projected,
        residual,
        projectionArrow,
        residualArrow,
      };
    }
  }

  return {
    root,
    projection: projectionVisual,
    morphs,
    metricCoordinates: { first, second, projection: projected, residual },
  };
}

function updateContent(content: Content, progress: number) {
  if (content.projection) {
    const projection = content.projection.projected
      .clone()
      .multiplyScalar(progress);
    const residual = content.projection.residual
      .clone()
      .multiplyScalar(progress);
    setArrow(content.projection.projectionArrow, projection);
    setArrow(content.projection.residualArrow, residual, projection);
  }
  content.morphs.forEach((visual) => {
    setArrow(visual, visual.from.clone().lerp(visual.to, progress));
  });
}

function vectorData(vector: THREE.Vector3 | null) {
  return vector
    ? [vector.x, vector.y, vector.z]
        .map((value) => Number(value.toFixed(6)))
        .join(",")
    : "";
}

function dispose(root: THREE.Object3D) {
  root.traverse((object) => {
    const renderable = object as THREE.Object3D & {
      geometry?: THREE.BufferGeometry;
      material?: THREE.Material | THREE.Material[];
    };
    renderable.geometry?.dispose();
    const materials = Array.isArray(renderable.material)
      ? renderable.material
      : renderable.material
        ? [renderable.material]
        : [];
    materials.forEach((material) => {
      Object.values(material).forEach((value) => {
        if (value instanceof THREE.Texture) value.dispose();
      });
      material.dispose();
    });
  });
  root.removeFromParent();
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export const ThreeInnerProductStage = forwardRef<
  ThreeInnerProductStageHandle,
  Props
>(function ThreeInnerProductStage(props, forwardedRef) {
  const {
    first,
    second,
    metric,
    mode,
    projection,
    residual,
    orthonormal,
    valid,
    showUnitSphere,
    theme,
    exportFilename,
  } = props;
  const mountRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  const contentRef = useRef<Content | null>(null);
  const mountedRef = useRef(false);
  const timelineRef = useRef<AnimationTimeline | null>(null);
  if (!timelineRef.current) {
    timelineRef.current = new AnimationTimeline({
      duration: DURATION,
      initialProgress: 1,
    });
  }
  const timeline = timelineRef.current;
  const [snapshot, setSnapshot] = useState<TimelineSnapshot>(() =>
    timeline.getSnapshot(),
  );
  const snapshotRef = useRef(snapshot);
  const [error, setError] = useState<string | null>(null);
  const [metricAvailable, setMetricAvailable] = useState(valid);

  const render = useCallback((progress = snapshotRef.current.easedProgress) => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    try {
      if (contentRef.current) updateContent(contentRef.current, progress);
      runtime.renderer.render(runtime.scene, runtime.camera);
      runtime.renderer.domElement.dataset.progress =
        snapshotRef.current.progress.toFixed(4);
    } catch {
      if (mountedRef.current) {
        setError("三维场景渲染失败，请检查图形加速设置。");
      }
    }
  }, []);

  const resetCamera = useCallback(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.camera.position.set(6.6, 5.1, 7.3);
    runtime.controls.target.set(0, 0, 0);
    runtime.controls.update();
    render();
  }, [render]);

  useImperativeHandle(
    forwardedRef,
    () => ({
      replay: () => timeline.replay(),
      seek: (value) => timeline.seek(value),
    }),
    [timeline],
  );

  useEffect(() => {
    mountedRef.current = true;
    const mount = mountRef.current;
    if (!mount) return;
    let resizeObserver: ResizeObserver | null = null;
    try {
      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        preserveDrawingBuffer: true,
        powerPreference: "high-performance",
      });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
      renderer.domElement.className =
        "visualization-stage__canvas three-inner-product-stage__canvas";
      renderer.domElement.dataset.testid = "visualization-stage-canvas";
      renderer.domElement.dataset.renderState = "static";
      renderer.domElement.dataset.playbackState = "complete";
      renderer.domElement.tabIndex = 0;
      renderer.domElement.setAttribute("role", "img");
      renderer.domElement.setAttribute(
        "aria-label",
        "R3 内积的 G 等距三维度量视图",
      );
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      renderer.domElement.style.display = "block";
      mount.replaceChildren(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 160);
      camera.position.set(6.6, 5.1, 7.3);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = false;
      controls.enablePan = true;
      controls.minDistance = 2;
      controls.maxDistance = 36;
      controls.target.set(0, 0, 0);
      controls.update();
      runtimeRef.current = { renderer, scene, camera, controls };

      const resize = () => {
        const bounds = mount.getBoundingClientRect();
        const width = Math.max(1, Math.round(bounds.width));
        const height = Math.max(1, Math.round(bounds.height));
        renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        render();
      };
      const contextLost = (event: Event) => {
        event.preventDefault();
        timeline.pause();
        setError("图形上下文已丢失，正在等待浏览器恢复。");
      };
      const contextRestored = () => {
        renderer.resetState();
        setError(null);
        resize();
      };
      const keydown = (event: KeyboardEvent) => {
        if (event.key === " ") {
          if (snapshotRef.current.state === "playing") timeline.pause();
          else timeline.play();
        } else if (event.key === "Home") timeline.seek(0);
        else if (event.key === "End") timeline.seek(1);
        else if (event.key === "0") resetCamera();
        else return;
        event.preventDefault();
      };
      const controlsChange = () => render();
      controls.addEventListener("change", controlsChange);
      renderer.domElement.addEventListener("webglcontextlost", contextLost);
      renderer.domElement.addEventListener(
        "webglcontextrestored",
        contextRestored,
      );
      renderer.domElement.addEventListener("keydown", keydown);
      if (typeof ResizeObserver === "function") {
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(mount);
      } else {
        globalThis.addEventListener("resize", resize);
      }
      resize();
      return () => {
        mountedRef.current = false;
        resizeObserver?.disconnect();
        globalThis.removeEventListener("resize", resize);
        controls.removeEventListener("change", controlsChange);
        renderer.domElement.removeEventListener(
          "webglcontextlost",
          contextLost,
        );
        renderer.domElement.removeEventListener(
          "webglcontextrestored",
          contextRestored,
        );
        renderer.domElement.removeEventListener("keydown", keydown);
        if (contentRef.current) dispose(contentRef.current.root);
        contentRef.current = null;
        controls.dispose();
        renderer.renderLists.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        runtimeRef.current = null;
        mount.replaceChildren();
      };
    } catch {
      setError(
        "浏览器无法启动 WebGL。请启用图形加速或使用支持 WebGL 2 的浏览器。",
      );
    }
  }, [render, resetCamera, timeline]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    if (contentRef.current) dispose(contentRef.current.root);
    try {
      const palette = getCanvasPalette(theme);
      runtime.renderer.setClearColor(palette.background, 1);
      const content = buildContent(
        {
          first,
          second,
          metric,
          mode,
          projection,
          residual,
          orthonormal,
          valid,
          showUnitSphere,
          theme,
          exportFilename,
        },
        palette,
      );
      runtime.scene.add(content.root);
      contentRef.current = content;
      const available = Boolean(content.metricCoordinates);
      setMetricAvailable(available);
      const canvas = runtime.renderer.domElement;
      canvas.dataset.innerProductMode = mode;
      canvas.dataset.metricGeometry = available ? "available" : "unavailable";
      canvas.dataset.metricFirst = vectorData(
        content.metricCoordinates?.first ?? null,
      );
      canvas.dataset.metricSecond = vectorData(
        content.metricCoordinates?.second ?? null,
      );
      canvas.dataset.metricProjection = vectorData(
        content.metricCoordinates?.projection ?? null,
      );
      canvas.dataset.metricResidual = vectorData(
        content.metricCoordinates?.residual ?? null,
      );
      canvas.setAttribute(
        "aria-label",
        `R3 内积的${modeLabels[mode]}，G 等距三维度量视图`,
      );
      setError(null);
      render();
    } catch {
      contentRef.current = null;
      setMetricAvailable(false);
      setError("三维度量参数无效，无法完成渲染。");
    }
  }, [
    exportFilename,
    first,
    metric,
    mode,
    orthonormal,
    projection,
    render,
    residual,
    second,
    showUnitSphere,
    theme,
    valid,
  ]);

  useEffect(() => {
    const unsubscribe = timeline.subscribe((next) => {
      snapshotRef.current = next;
      if (mountedRef.current) setSnapshot(next);
      const canvas = runtimeRef.current?.renderer.domElement;
      if (canvas) {
        canvas.dataset.playbackState = next.state;
        canvas.dataset.renderState =
          next.state === "playing" ? "animating" : "static";
      }
      render(next.easedProgress);
    });
    return () => {
      unsubscribe();
      timeline.pause();
    };
  }, [render, timeline]);

  useEffect(() => {
    const query = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    const update = () => timeline.setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [timeline]);

  const exportPng = async () => {
    const renderer = runtimeRef.current?.renderer;
    if (!renderer || error) return;
    render();
    const blob = await new Promise<Blob | null>((resolve) =>
      renderer.domElement.toBlob(resolve, "image/png"),
    );
    if (blob) download(blob, exportFilename);
  };
  const primary = () =>
    snapshot.state === "playing"
      ? timeline.pause()
      : snapshot.progress >= 1
        ? timeline.replay()
        : timeline.play();
  const PlaybackIcon =
    snapshot.state === "playing"
      ? Pause
      : snapshot.progress >= 1
        ? RotateCcw
        : Play;
  const unavailable = !valid || !metricAvailable;

  return (
    <section
      className="three-inner-product-stage"
      style={stageStyle}
      data-testid="visualization-stage"
      data-render-state={
        error ? "error" : snapshot.state === "playing" ? "animating" : "static"
      }
      data-observation="real-metric-3d"
    >
      <div style={viewportStyle}>
        <div ref={mountRef} style={mountStyle} />
        <div
          className="visualization-stage__view-controls"
          role="toolbar"
          aria-label="三维视图"
        >
          <IconButton
            label="重置相机"
            onClick={resetCamera}
            disabled={Boolean(error)}
          >
            <LocateFixed size={17} aria-hidden="true" />
          </IconButton>
          <IconButton
            label="导出 PNG"
            onClick={() => void exportPng()}
            disabled={Boolean(error)}
          >
            <Download size={17} aria-hidden="true" />
          </IconButton>
        </div>
        {(error || unavailable) && (
          <div className="three-transform-stage__fallback" role="alert">
            <strong>三维度量视图不可用</strong>
            <span>
              {error ?? "当前 G 不是对称正定矩阵，无法建立等距三维坐标。"}
            </span>
          </div>
        )}
      </div>
      <div
        className="visualization-stage__transport"
        role="group"
        aria-label="动画时间轴"
      >
        <IconButton
          label="回到起点"
          onClick={() => timeline.seek(0)}
          disabled={snapshot.progress <= 0 || Boolean(error) || unavailable}
        >
          <SkipBack size={17} aria-hidden="true" />
        </IconButton>
        <IconButton
          label={
            snapshot.state === "playing"
              ? "暂停"
              : snapshot.progress >= 1
                ? "重新播放"
                : "播放"
          }
          onClick={primary}
          disabled={Boolean(error) || unavailable}
        >
          <PlaybackIcon size={17} aria-hidden="true" />
        </IconButton>
        <input
          className="visualization-stage__scrubber"
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={snapshot.progress}
          aria-label="动画进度"
          aria-valuetext={`${Math.round(snapshot.progress * 100)}%`}
          disabled={Boolean(error) || unavailable}
          onChange={(event) => timeline.seek(Number(event.currentTarget.value))}
        />
        <output>{Math.round(snapshot.progress * 100)}%</output>
      </div>
    </section>
  );
});

ThreeInnerProductStage.displayName = "ThreeInnerProductStage";
