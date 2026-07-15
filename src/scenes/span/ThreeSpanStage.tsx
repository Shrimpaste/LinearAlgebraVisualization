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
import type { RealVector } from "../../math/nd";
import { getCanvasPalette, type CanvasPalette } from "../../rendering";

export interface ThreeSpanStageHandle {
  replay(): void;
  seek(progress: number): void;
}

interface Props {
  vectors: readonly RealVector[];
  coefficients: readonly number[];
  basisIndices: readonly number[];
  rank: 0 | 1 | 2 | 3;
  target: RealVector;
  showTarget: boolean;
  theme: ThemeMode;
  exportFilename: string;
}

interface Runtime {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
}

interface ArrowItem {
  arrow: THREE.ArrowHelper;
  label: THREE.Sprite | null;
  vector: THREE.Vector3;
  origin: THREE.Vector3;
  revealAt: number;
}

interface Content {
  root: THREE.Group;
  generators: ArrowItem[];
  contributions: ArrowItem[];
  combination: ArrowItem;
}

const DURATION = 1250;
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

function vector3(vector: RealVector) {
  return new THREE.Vector3(vector[0] ?? 0, vector[1] ?? 0, vector[2] ?? 0);
}

function makeLabel(text: string, color: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 160;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.font = '500 28px "IBM Plex Mono", monospace';
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = color;
  context.fillText(text, 80, 32);
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
  sprite.scale.set(0.75, 0.3, 1);
  sprite.renderOrder = 20;
  return sprite;
}

function setArrow(item: ArrowItem, progress: number) {
  const current = item.vector.clone().multiplyScalar(progress);
  const length = current.length();
  item.arrow.position.copy(item.origin);
  item.arrow.visible = length > 1e-12;
  if (item.arrow.visible) {
    item.arrow.setDirection(current.normalize());
    item.arrow.setLength(
      length,
      Math.min(0.22, length * 0.2),
      Math.min(0.12, length * 0.12),
    );
  }
  if (item.label) {
    item.label.visible = item.arrow.visible;
    item.label.position
      .copy(item.origin)
      .add(item.vector.clone().multiplyScalar(progress));
    item.label.position.y += 0.15;
  }
}

function addAxes(root: THREE.Group, palette: CanvasPalette) {
  const colors = [palette.cyan, palette.yellow, palette.blue];
  const directions = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1),
  ];
  directions.forEach((direction, index) => {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      direction.clone().multiplyScalar(-EXTENT),
      direction.clone().multiplyScalar(EXTENT),
    ]);
    root.add(
      new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({
          color: colors[index],
          transparent: true,
          opacity: 0.62,
        }),
      ),
    );
    const label = makeLabel(`x${index + 1}`, colors[index]!);
    if (label) {
      label.position.copy(direction).multiplyScalar(EXTENT + 0.3);
      root.add(label);
    }
  });
  root.add(
    new THREE.GridHelper(
      EXTENT * 2,
      EXTENT * 2,
      palette.gridMajor,
      palette.gridMinor,
    ),
  );
}

function addRankGeometry(
  root: THREE.Group,
  basis: readonly RealVector[],
  rank: number,
  color: string,
) {
  if (rank === 1) {
    const direction = vector3(basis[0]!)
      .normalize()
      .multiplyScalar(EXTENT * 1.4);
    root.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          direction.clone().negate(),
          direction,
        ]),
        new THREE.LineBasicMaterial({
          color,
          transparent: true,
          opacity: 0.48,
        }),
      ),
    );
  } else if (rank === 2) {
    const first = vector3(basis[0]!).normalize();
    const secondRaw = vector3(basis[1]!);
    const second = secondRaw
      .addScaledVector(first, -secondRaw.dot(first))
      .normalize();
    const positions = new Float32Array([
      ...first
        .clone()
        .multiplyScalar(-EXTENT)
        .addScaledVector(second, -EXTENT)
        .toArray(),
      ...first
        .clone()
        .multiplyScalar(EXTENT)
        .addScaledVector(second, -EXTENT)
        .toArray(),
      ...first
        .clone()
        .multiplyScalar(EXTENT)
        .addScaledVector(second, EXTENT)
        .toArray(),
      ...first
        .clone()
        .multiplyScalar(-EXTENT)
        .addScaledVector(second, EXTENT)
        .toArray(),
    ]);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    root.add(
      new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.12,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      ),
    );
  }
}

function makeArrow(
  vector: THREE.Vector3,
  origin: THREE.Vector3,
  color: string,
  label: string,
  revealAt = 0,
): ArrowItem {
  const arrow = new THREE.ArrowHelper(UNIT_X, origin, 1, color);
  const sprite = makeLabel(label, color);
  return { arrow, label: sprite, vector, origin, revealAt };
}

function buildContent(props: Props, palette: CanvasPalette): Content {
  const root = new THREE.Group();
  addAxes(root, palette);
  const colors = [palette.cyan, palette.yellow, palette.blue, palette.red];
  const basis = props.basisIndices.map((index) => props.vectors[index]!);
  addRankGeometry(root, basis, props.rank, palette.cyan);
  const basisSet = new Set(props.basisIndices);
  const generators = props.vectors.map((vector, index) => {
    const color = colors[index % colors.length]!;
    const item = makeArrow(
      vector3(vector),
      new THREE.Vector3(),
      color,
      `v${index + 1}`,
      index * 0.07,
    );
    const lineMaterial = item.arrow.line.material as THREE.Material;
    const coneMaterial = item.arrow.cone.material as THREE.Material;
    lineMaterial.transparent = true;
    lineMaterial.opacity = basisSet.has(index) ? 1 : 0.48;
    coneMaterial.transparent = true;
    coneMaterial.opacity = basisSet.has(index) ? 1 : 0.48;
    root.add(item.arrow);
    if (item.label) root.add(item.label);
    return item;
  });
  let origin = new THREE.Vector3();
  const contributions = props.vectors.map((vector, index) => {
    const contribution = vector3(vector).multiplyScalar(
      props.coefficients[index] ?? 0,
    );
    const item = makeArrow(
      contribution,
      origin.clone(),
      colors[index % colors.length]!,
      `c${index + 1}v${index + 1}`,
    );
    origin = origin.clone().add(contribution);
    root.add(item.arrow);
    if (item.label) root.add(item.label);
    return item;
  });
  const combination = makeArrow(
    origin,
    new THREE.Vector3(),
    palette.red,
    "Σcᵢvᵢ",
  );
  root.add(combination.arrow);
  if (combination.label) root.add(combination.label);
  if (props.showTarget) {
    const target = makeArrow(
      vector3(props.target),
      new THREE.Vector3(),
      palette.neutral,
      "target",
    );
    const targetLineMaterial = target.arrow.line.material as THREE.Material;
    targetLineMaterial.transparent = true;
    targetLineMaterial.opacity = 0.7;
    root.add(target.arrow);
    if (target.label) root.add(target.label);
    setArrow(target, 1);
  }
  return { root, generators, contributions, combination };
}

function updateContent(content: Content, progress: number) {
  content.generators.forEach((item) =>
    setArrow(item, Math.max(0, Math.min(1, (progress - item.revealAt) / 0.35))),
  );
  const combinationProgress = Math.max(
    0,
    Math.min(1, (progress - 0.55) / 0.45),
  );
  content.contributions.forEach((item, index) => {
    const local = Math.max(
      0,
      Math.min(1, combinationProgress * content.contributions.length - index),
    );
    setArrow(item, local);
  });
  setArrow(content.combination, combinationProgress);
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
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export const ThreeSpanStage = forwardRef<ThreeSpanStageHandle, Props>(
  function ThreeSpanStage(props, forwardedRef) {
    const mountRef = useRef<HTMLDivElement>(null);
    const runtimeRef = useRef<Runtime | null>(null);
    const contentRef = useRef<Content | null>(null);
    const mountedRef = useRef(false);
    const timelineRef = useRef<AnimationTimeline | null>(null);
    if (!timelineRef.current)
      timelineRef.current = new AnimationTimeline({
        duration: DURATION,
        initialProgress: 1,
      });
    const timeline = timelineRef.current;
    const [snapshot, setSnapshot] = useState<TimelineSnapshot>(() =>
      timeline.getSnapshot(),
    );
    const snapshotRef = useRef(snapshot);
    const [error, setError] = useState<string | null>(null);

    const render = useCallback(
      (progress = snapshotRef.current.easedProgress) => {
        const runtime = runtimeRef.current;
        if (!runtime) return;
        try {
          if (contentRef.current) updateContent(contentRef.current, progress);
          runtime.renderer.render(runtime.scene, runtime.camera);
          runtime.renderer.domElement.dataset.progress =
            snapshotRef.current.progress.toFixed(4);
        } catch {
          if (mountedRef.current)
            setError("三维场景渲染失败，请检查图形加速设置。");
        }
      },
      [],
    );

    const resetCamera = useCallback(() => {
      const runtime = runtimeRef.current;
      if (!runtime) return;
      runtime.camera.position.set(6.7, 5.5, 7.8);
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
        renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
        renderer.domElement.className =
          "visualization-stage__canvas three-span-stage__canvas";
        renderer.domElement.dataset.testid = "visualization-stage-canvas";
        renderer.domElement.dataset.renderState = "static";
        renderer.domElement.dataset.playbackState = "complete";
        renderer.domElement.tabIndex = 0;
        renderer.domElement.setAttribute("role", "img");
        renderer.domElement.setAttribute(
          "aria-label",
          "R3 向量张成、秩几何与线性组合视图",
        );
        renderer.domElement.style.width = "100%";
        renderer.domElement.style.height = "100%";
        renderer.domElement.style.display = "block";
        mount.replaceChildren(renderer.domElement);
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 160);
        camera.position.set(6.7, 5.5, 7.8);
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = false;
        controls.minDistance = 2;
        controls.maxDistance = 36;
        controls.update();
        runtimeRef.current = { renderer, scene, camera, controls };
        const resize = () => {
          const bounds = mount.getBoundingClientRect();
          const width = Math.max(1, Math.round(bounds.width));
          const height = Math.max(1, Math.round(bounds.height));
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
        } else globalThis.addEventListener("resize", resize);
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
      const palette = getCanvasPalette(props.theme);
      runtime.renderer.setClearColor(palette.background, 1);
      contentRef.current = buildContent(
        {
          vectors: props.vectors,
          coefficients: props.coefficients,
          basisIndices: props.basisIndices,
          rank: props.rank,
          target: props.target,
          showTarget: props.showTarget,
          theme: props.theme,
          exportFilename: props.exportFilename,
        },
        palette,
      );
      runtime.scene.add(contentRef.current.root);
      setError(null);
      render();
    }, [
      props.basisIndices,
      props.coefficients,
      props.exportFilename,
      props.rank,
      props.showTarget,
      props.target,
      props.theme,
      props.vectors,
      render,
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
      const query = matchMedia?.("(prefers-reduced-motion: reduce)");
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
      if (blob) download(blob, props.exportFilename);
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

    return (
      <section
        className="three-span-stage"
        style={stageStyle}
        data-testid="visualization-stage"
        data-render-state={
          error
            ? "error"
            : snapshot.state === "playing"
              ? "animating"
              : "static"
        }
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
              <LocateFixed size={17} />
            </IconButton>
            <IconButton
              label="导出 PNG"
              onClick={() => void exportPng()}
              disabled={Boolean(error)}
            >
              <Download size={17} />
            </IconButton>
          </div>
          {error && (
            <div className="three-transform-stage__fallback" role="alert">
              <strong>三维视图不可用</strong>
              <span>{error}</span>
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
            disabled={snapshot.progress <= 0 || Boolean(error)}
          >
            <SkipBack size={17} />
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
            disabled={Boolean(error)}
          >
            <PlaybackIcon size={17} />
          </IconButton>
          <input
            className="visualization-stage__scrubber"
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={snapshot.progress}
            aria-label="动画进度"
            disabled={Boolean(error)}
            onChange={(event) =>
              timeline.seek(Number(event.currentTarget.value))
            }
          />
          <output>{Math.round(snapshot.progress * 100)}%</output>
        </div>
      </section>
    );
  },
);

ThreeSpanStage.displayName = "ThreeSpanStage";
