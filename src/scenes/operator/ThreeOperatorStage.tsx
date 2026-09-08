import { registerStage } from "../../app/stageSession";
import { Download, LocateFixed, Pause, Play, SkipBack } from "lucide-react";
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
import { addComplexVectors, type ComplexVector } from "../../math/nd";
import { getCanvasPalette, type CanvasPalette } from "../../rendering";
import { formatComplex } from "../../utils/formatLinear";
import {
  deriveOperator,
  type OperatorComponentFocus,
  type OperatorLessonMode,
  type OperatorState,
} from "./model";

type SuccessfulDerived = Extract<
  ReturnType<typeof deriveOperator>,
  { application: object }
>;

interface Props {
  readonly state: OperatorState;
  readonly derived: SuccessfulDerived;
  readonly theme: ThemeMode;
  readonly onProgressChange?: (progress: number) => void;
}

export interface ThreeOperatorStageHandle {
  replay(): void;
  pause(): void;
  seek(progress: number): void;
  getProgress(): number;
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
  color: string;
  labelNudge: THREE.Vector3;
}

interface VisualPart {
  readonly indices: readonly number[];
  readonly projected: THREE.Vector3;
  readonly mapped: THREE.Vector3;
  readonly visual: ArrowVisual;
}

interface Content {
  readonly root: THREE.Group;
  readonly structure: THREE.Group;
  readonly input: ArrowVisual;
  readonly output: ArrowVisual;
  readonly parts: readonly VisualPart[];
  readonly focus: OperatorComponentFocus;
  readonly mode: OperatorLessonMode;
}

const DURATION = 1700;
const EXTENT = 4.2;
const APPLY_SCALE = 2.05;
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

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

function toVector3(vector: ComplexVector) {
  return new THREE.Vector3(
    vector[0]?.re ?? 0,
    vector[1]?.re ?? 0,
    vector[2]?.re ?? 0,
  );
}

function makeLabel(text: string, color: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 80;
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) return null;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.font = '500 29px "IBM Plex Mono", monospace';
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = color;
  context.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.premultiplyAlpha = true;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.02,
      premultipliedAlpha: true,
      depthTest: false,
      depthWrite: false,
    }),
  );
  sprite.scale.set(1.25, 0.39, 1);
  sprite.renderOrder = 30;
  return sprite;
}

function makeArrow(
  color: string,
  label: string,
  labelNudge = new THREE.Vector3(),
): ArrowVisual {
  return {
    arrow: new THREE.ArrowHelper(UNIT_X, new THREE.Vector3(), 1, color),
    label: label ? makeLabel(label, color) : null,
    color,
    labelNudge,
  };
}

function setArrow(
  visual: ArrowVisual,
  vector: THREE.Vector3,
  origin = new THREE.Vector3(),
) {
  const length = vector.length();
  visual.arrow.position.copy(origin);
  visual.arrow.visible = length > 1e-9;
  if (visual.arrow.visible) {
    visual.arrow.setDirection(vector.clone().normalize());
    visual.arrow.setLength(
      length,
      Math.min(0.25, length * 0.18),
      Math.min(0.14, length * 0.11),
    );
  }
  if (visual.label) {
    visual.label.visible = visual.arrow.visible;
    visual.label.position.copy(origin).add(vector);
    if (length > 1e-9)
      visual.label.position.addScaledVector(vector, 0.14 / length);
    visual.label.position.add(visual.labelNudge);
  }
}

function setArrowOpacity(visual: ArrowVisual, opacity: number) {
  const value = clamp01(opacity);
  for (const material of [
    visual.arrow.line.material,
    visual.arrow.cone.material,
  ]) {
    const arrowMaterial = material as THREE.Material;
    arrowMaterial.transparent = value < 1;
    arrowMaterial.opacity = value;
    arrowMaterial.depthWrite = value >= 0.95;
  }
  if (visual.label) {
    const material = visual.label.material as THREE.SpriteMaterial;
    material.opacity = value;
    material.transparent = value < 1;
  }
}

function addArrow(root: THREE.Group, visual: ArrowVisual) {
  root.add(visual.arrow);
  if (visual.label) root.add(visual.label);
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
          opacity: 0.28,
        }),
      ),
    );
  }
  const grid = new THREE.GridHelper(
    EXTENT * 2,
    12,
    palette.gridMajor,
    palette.gridMinor,
  );
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.48;
  root.add(grid);
}

function addDirection(
  root: THREE.Group,
  direction: THREE.Vector3,
  color: string,
  labelText: string,
) {
  if (direction.lengthSq() <= 1e-12) return;
  const unit = direction.normalize();
  const geometry = new THREE.BufferGeometry().setFromPoints([
    unit.clone().multiplyScalar(-EXTENT * 0.82),
    unit.clone().multiplyScalar(EXTENT * 0.82),
  ]);
  root.add(
    new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.82 }),
    ),
  );
  const label = makeLabel(labelText, color);
  if (label) {
    label.position.copy(unit).multiplyScalar(EXTENT * 0.9);
    root.add(label);
  }
}

function orthonormalPlane(first: THREE.Vector3, second: THREE.Vector3) {
  const u = first.clone();
  if (u.lengthSq() <= 1e-12) return null;
  u.normalize();
  const v = second.clone().addScaledVector(u, -second.dot(u));
  if (v.lengthSq() <= 1e-12) return null;
  v.normalize();
  const normal = new THREE.Vector3().crossVectors(u, v).normalize();
  return { u, v, normal };
}

function addPlane(
  root: THREE.Group,
  first: THREE.Vector3,
  second: THREE.Vector3,
  color: string,
  labelText: string,
) {
  const basis = orthonormalPlane(first, second);
  if (!basis) return;
  const geometry = new THREE.CircleGeometry(2.65, 64);
  const matrix = new THREE.Matrix4().makeBasis(basis.u, basis.v, basis.normal);
  geometry.applyMatrix4(matrix);
  const surface = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.095,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  root.add(surface);
  const ring = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(
      Array.from({ length: 72 }, (_, index) => {
        const angle = (index / 72) * Math.PI * 2;
        return basis.u
          .clone()
          .multiplyScalar(Math.cos(angle) * 2.65)
          .addScaledVector(basis.v, Math.sin(angle) * 2.65);
      }),
    ),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55 }),
  );
  root.add(ring);
  const label = makeLabel(labelText, color);
  if (label) {
    label.position
      .copy(basis.u)
      .multiplyScalar(2.85)
      .addScaledVector(basis.v, 0.25);
    root.add(label);
  }
}

function sumVectors(vectors: readonly ComplexVector[]) {
  return vectors.reduce(addComplexVectors);
}

function visualGroups(derived: SuccessfulDerived) {
  const spaces = derived.eigenspaces;
  const used = new Set<number>();
  return spaces
    .map((space, index) => {
      if (used.has(index)) return null;
      if (Math.abs(space.eigenvalue.im) <= 1e-8) {
        used.add(index);
        return {
          indices: space.indices,
          projected: space.projectedVector,
          mapped: space.mappedProjection,
        };
      }
      const pairIndex = spaces.findIndex(
        (candidate, candidateIndex) =>
          candidateIndex !== index &&
          !used.has(candidateIndex) &&
          Math.abs(candidate.eigenvalue.re - space.eigenvalue.re) <= 1e-8 &&
          Math.abs(candidate.eigenvalue.im + space.eigenvalue.im) <= 1e-8,
      );
      used.add(index);
      if (pairIndex < 0) {
        return {
          indices: space.indices,
          projected: space.projectedVector,
          mapped: space.mappedProjection,
        };
      }
      used.add(pairIndex);
      const pair = spaces[pairIndex]!;
      return {
        indices: [...space.indices, ...pair.indices],
        projected: sumVectors([space.projectedVector, pair.projectedVector]),
        mapped: sumVectors([space.mappedProjection, pair.mappedProjection]),
      };
    })
    .filter((group): group is NonNullable<typeof group> => group !== null);
}

function buildStructure(
  root: THREE.Group,
  derived: SuccessfulDerived,
  palette: CanvasPalette,
) {
  const spectral = derived.spectral;
  if (!spectral.success) return;
  const colors = [palette.cyan, palette.yellow, palette.blue];
  const handled = new Set<number>();
  derived.eigenspaces.forEach((space, spaceIndex) => {
    if (handled.has(spaceIndex)) return;
    const color = colors[space.indices[0]!]!;
    if (space.indices.length >= 2) {
      const first = spectral.U.map((row) => row[space.indices[0]!]!);
      const second = spectral.U.map((row) => row[space.indices[1]!]!);
      addPlane(
        root,
        toVector3(first),
        toVector3(second),
        color,
        `Eλ · dim ${space.indices.length}`,
      );
      handled.add(spaceIndex);
      return;
    }
    if (Math.abs(space.eigenvalue.im) <= 1e-8) {
      const vector = spectral.U.map((row) => row[space.indices[0]!]!);
      addDirection(
        root,
        toVector3(vector),
        color,
        `λ=${formatComplex(space.eigenvalue)}`,
      );
      handled.add(spaceIndex);
      return;
    }
    const pairIndex = derived.eigenspaces.findIndex(
      (candidate, candidateIndex) =>
        candidateIndex !== spaceIndex &&
        !handled.has(candidateIndex) &&
        Math.abs(candidate.eigenvalue.re - space.eigenvalue.re) <= 1e-8 &&
        Math.abs(candidate.eigenvalue.im + space.eigenvalue.im) <= 1e-8,
    );
    const vector = spectral.U.map((row) => row[space.indices[0]!]!);
    const real = new THREE.Vector3(
      ...(vector.map((entry) => entry.re) as [number, number, number]),
    );
    const imaginary = new THREE.Vector3(
      ...(vector.map((entry) => entry.im) as [number, number, number]),
    );
    addPlane(root, real, imaginary, color, "实不变平面");
    handled.add(spaceIndex);
    if (pairIndex >= 0) handled.add(pairIndex);
  });
}

function buildContent(
  state: OperatorState,
  derived: SuccessfulDerived,
  palette: CanvasPalette,
): Content {
  const root = new THREE.Group();
  addAxes(root, palette);
  const structure = new THREE.Group();
  buildStructure(structure, derived, palette);
  root.add(structure);

  const input = makeArrow(palette.text, "x", new THREE.Vector3(-0.18, 0.22, 0));
  const output = makeArrow(
    palette.red,
    "Ax",
    new THREE.Vector3(0.22, -0.2, 0.16),
  );
  addArrow(root, input);
  addArrow(root, output);
  const colors = [palette.cyan, palette.yellow, palette.blue];
  const parts = visualGroups(derived).map((group, index) => {
    const visual = makeArrow(
      colors[group.indices[0] ?? index]!,
      "",
      new THREE.Vector3(0.12, index % 2 === 0 ? 0.3 : -0.3, index * 0.12),
    );
    addArrow(root, visual);
    return {
      indices: group.indices,
      projected: toVector3(group.projected),
      mapped: toVector3(group.mapped),
      visual,
    };
  });
  return {
    root,
    structure,
    input,
    output,
    parts,
    focus: state.focus,
    mode: state.lessonMode,
  };
}

function partOpacity(
  focus: OperatorComponentFocus,
  indices: readonly number[],
) {
  if (focus === "all") return 1;
  return indices.includes(Number(focus) - 1) ? 1 : 0.12;
}

function setObjectOpacity(root: THREE.Object3D, opacity: number) {
  root.traverse((object) => {
    const value = (
      object as THREE.Object3D & {
        material?: THREE.Material | THREE.Material[];
      }
    ).material;
    const materials = Array.isArray(value) ? value : value ? [value] : [];
    materials.forEach((material) => {
      const stored = material.userData.operatorBaseOpacity;
      const baseOpacity =
        typeof stored === "number" ? stored : material.opacity;
      material.userData.operatorBaseOpacity = baseOpacity;
      material.transparent = baseOpacity * opacity < 1;
      material.opacity = baseOpacity * opacity;
    });
  });
}

function updateContent(
  content: Content,
  progress: number,
  inputVector: ComplexVector,
  outputVector: ComplexVector,
) {
  if (content.mode === "structure") {
    const reveal = 0.12 + 0.88 * clamp01(progress * 3);
    content.structure.visible = true;
    setObjectOpacity(content.structure, reveal);
    content.input.arrow.visible = false;
    if (content.input.label) content.input.label.visible = false;
    content.output.arrow.visible = false;
    if (content.output.label) content.output.label.visible = false;
    content.parts.forEach((part) => {
      part.visual.arrow.visible = false;
      if (part.visual.label) part.visual.label.visible = false;
    });
    return;
  }

  content.structure.visible = false;
  const projectionPhase = clamp01(progress * 4);
  const mapPhase = clamp01(progress * 4 - 1);
  const sumPhase = clamp01(progress * 4 - 2);
  const outputPhase = clamp01(progress * 4 - 3);
  setArrow(content.input, toVector3(inputVector).multiplyScalar(APPLY_SCALE));
  setArrowOpacity(content.input, 1 - projectionPhase * 0.45);
  const cumulative = new THREE.Vector3();
  content.parts.forEach((part) => {
    const vector = part.projected
      .clone()
      .lerp(part.mapped, mapPhase)
      .multiplyScalar(APPLY_SCALE);
    const origin = cumulative.clone().multiplyScalar(sumPhase * APPLY_SCALE);
    setArrow(part.visual, vector, origin);
    setArrowOpacity(
      part.visual,
      partOpacity(content.focus, part.indices) *
        (0.08 + 0.92 * projectionPhase),
    );
    cumulative.add(part.mapped);
  });
  setArrow(
    content.output,
    toVector3(outputVector).multiplyScalar(outputPhase * APPLY_SCALE),
  );
  setArrowOpacity(content.output, outputPhase);
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

function phaseLabel(mode: OperatorLessonMode, progress: number) {
  if (mode === "structure") {
    const labels = ["谱点", "特征子空间", "谱投影", "谱恒等式"];
    return labels[Math.min(3, Math.ceil(progress * 3))]!;
  }
  const labels = ["输入 x", "谱坐标", "特征值作用", "贡献重构", "结果 Ax"];
  return labels[Math.min(4, Math.ceil(progress * 4))]!;
}

export const ThreeOperatorStage = forwardRef<ThreeOperatorStageHandle, Props>(
  function ThreeOperatorStage(
    { state, derived, theme, onProgressChange },
    forwardedRef,
  ) {
    const mountRef = useRef<HTMLDivElement>(null);
    const runtimeRef = useRef<Runtime | null>(null);
    const contentRef = useRef<Content | null>(null);
    const mountedRef = useRef(false);
    const propsRef = useRef({ state, derived });
    propsRef.current = { state, derived };
    const timelineRef = useRef<AnimationTimeline | null>(null);
    if (!timelineRef.current) {
      timelineRef.current = new AnimationTimeline({
        duration: DURATION,
        initialProgress: 1,
      });
    }
    const timeline = timelineRef.current;
    useEffect(
      () =>
        registerStage(mountRef.current, {
          capture: () => ({
            progress: timeline.getSnapshot().progress,
            speed: timeline.getSnapshot().speed,
            camera: runtimeRef.current?.camera.position.toArray(),
            target: runtimeRef.current?.controls.target.toArray(),
          }),
          restore: (view) => {
            timeline.pause();
            if (view.speed) timeline.setSpeed(view.speed);
            timeline.seek(view.progress);
            const runtime = runtimeRef.current;
            if (runtime && view.camera && view.target) {
              runtime.camera.position.fromArray(view.camera);
              runtime.controls.target.fromArray(view.target);
              runtime.controls.update();
              runtime.renderer.render(runtime.scene, runtime.camera);
            }
          },
        }),
      [timeline],
    );

    const [snapshot, setSnapshot] = useState<TimelineSnapshot>(() =>
      timeline.getSnapshot(),
    );
    const snapshotRef = useRef(snapshot);
    snapshotRef.current = snapshot;
    const [error, setError] = useState<string | null>(null);

    const render = useCallback(
      (progress = snapshotRef.current.easedProgress) => {
        const runtime = runtimeRef.current;
        const content = contentRef.current;
        if (!runtime || !content) return;
        const current = propsRef.current;
        updateContent(
          content,
          progress,
          current.state.vector,
          current.derived.application.output,
        );
        runtime.renderer.render(runtime.scene, runtime.camera);
        runtime.renderer.domElement.dataset.progress =
          snapshotRef.current.progress.toFixed(4);
        runtime.renderer.domElement.dataset.playbackState =
          snapshotRef.current.state;
      },
      [],
    );

    const resetCamera = useCallback(() => {
      const runtime = runtimeRef.current;
      if (!runtime) return;
      runtime.camera.position.set(6.7, 5.2, 7.4);
      runtime.controls.target.set(0, 0, 0);
      runtime.controls.update();
      render();
    }, [render]);

    useImperativeHandle(
      forwardedRef,
      () => ({
        replay: () => timeline.replay(),
        pause: () => timeline.pause(),
        seek: (progress) => timeline.seek(progress),
        getProgress: () => timeline.getSnapshot().progress,
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
          "visualization-stage__canvas three-operator-stage__canvas";
        renderer.domElement.dataset.testid = "visualization-stage-canvas";
        renderer.domElement.dataset.renderState = "static";
        renderer.domElement.tabIndex = 0;
        renderer.domElement.setAttribute("role", "img");
        renderer.domElement.setAttribute(
          "aria-label",
          "R3 实 normal 算子的谱结构与向量作用三维舞台",
        );
        renderer.domElement.style.width = "100%";
        renderer.domElement.style.height = "100%";
        renderer.domElement.style.display = "block";
        mount.replaceChildren(renderer.domElement);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 160);
        camera.position.set(6.7, 5.2, 7.4);
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = false;
        controls.enablePan = true;
        controls.minDistance = 2.2;
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
        const controlsChange = () => render();
        const keydown = (event: KeyboardEvent) => {
          if (event.key === " ") {
            if (timeline.getSnapshot().state === "playing") timeline.pause();
            else timeline.play();
          } else if (event.key === "Home") timeline.seek(0);
          else if (event.key === "End") timeline.seek(1);
          else if (event.key === "0") resetCamera();
          else return;
          event.preventDefault();
        };
        controls.addEventListener("change", controlsChange);
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
        setError("浏览器无法启动三维谱舞台，请启用 WebGL 图形加速。");
      }
    }, [render, resetCamera, timeline]);

    useEffect(() => {
      const runtime = runtimeRef.current;
      if (!runtime) return;
      if (contentRef.current) dispose(contentRef.current.root);
      const palette = getCanvasPalette(theme);
      runtime.renderer.setClearColor(palette.background, 1);
      const content = buildContent(state, derived, palette);
      contentRef.current = content;
      runtime.scene.add(content.root);
      render();
    }, [derived, render, state, theme]);

    useEffect(() => {
      const unsubscribe = timeline.subscribe((next) => {
        snapshotRef.current = next;
        if (mountedRef.current) setSnapshot(next);
        onProgressChange?.(next.progress);
        render(next.easedProgress);
      });
      return () => {
        unsubscribe();
        timeline.pause();
      };
    }, [onProgressChange, render, timeline]);

    const exportPng = useCallback(async () => {
      const runtime = runtimeRef.current;
      if (!runtime) return;
      runtime.renderer.render(runtime.scene, runtime.camera);
      const blob = await new Promise<Blob | null>((resolve) =>
        runtime.renderer.domElement.toBlob(resolve, "image/png"),
      );
      if (blob) download(blob, "basis-lab-operator-spectrum-3d.png");
    }, []);

    const primary = () => {
      const current = timeline.getSnapshot();
      if (current.state === "playing") timeline.pause();
      else if (current.progress >= 1) timeline.replay();
      else timeline.play();
    };

    return (
      <section className="three-operator-stage" style={stageStyle}>
        <div style={viewportStyle}>
          <div ref={mountRef} style={mountStyle} />
          <div className="three-operator-stage__legend" aria-live="off">
            <span>R3 SPECTRAL STAGE</span>
            <strong>{phaseLabel(state.lessonMode, snapshot.progress)}</strong>
            {state.lessonMode === "apply" && derived.spectral.success && (
              <div className="three-operator-stage__component-key">
                {visualGroups(derived).map((group) => (
                  <span
                    key={group.indices.join("-")}
                    data-component={group.indices[0]! + 1}
                  >
                    {group.indices.length > 1
                      ? `λ=${formatComplex(derived.spectral.eigenvalues[group.indices[0]!]!)} · Pλx`
                      : `d${group.indices[0]! + 1}u${group.indices[0]! + 1}`}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div
            className="three-transform-stage__view-controls"
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
          {error && (
            <div className="three-transform-stage__fallback" role="alert">
              <strong>三维谱舞台不可用</strong>
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
            disabled={Boolean(error)}
          >
            {snapshot.state === "playing" ? (
              <Pause size={17} aria-hidden="true" />
            ) : (
              <Play size={17} aria-hidden="true" />
            )}
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

ThreeOperatorStage.displayName = "ThreeOperatorStage";
