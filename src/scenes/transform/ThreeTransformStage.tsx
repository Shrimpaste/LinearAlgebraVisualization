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
import { AnimationTimeline, type TimelineSnapshot } from "../../engine";
import type { Dimension, RealMatrix, RealVector } from "../../math/nd";
import { getCanvasPalette, type CanvasPalette } from "../../rendering";
import { IconButton } from "../../components/ui/IconButton";

export interface ThreeTransformStageHandle {
  replay(): void;
  seek(progress: number): void;
}

export interface ThreeTransformStageProps {
  matrix: RealMatrix;
  intermediateMatrix?: RealMatrix | null;
  vector: RealVector;
  inputDimension: Dimension;
  outputDimension: Dimension;
  theme: ThemeMode;
  showGrid: boolean;
  showSphere: boolean;
  showTrail: boolean;
  exportFilename: string;
}

interface MorphGeometry {
  readonly geometry: THREE.BufferGeometry;
  readonly from: Float32Array;
  readonly via: Float32Array | null;
  readonly to: Float32Array;
}

interface MorphArrow {
  readonly arrow: THREE.ArrowHelper;
  readonly label: THREE.Sprite | null;
  readonly from: THREE.Vector3;
  readonly via: THREE.Vector3 | null;
  readonly to: THREE.Vector3;
}

interface StageContent {
  readonly root: THREE.Group;
  readonly morphGeometries: readonly MorphGeometry[];
  readonly arrows: readonly MorphArrow[];
  readonly sampleArrow: MorphArrow;
  readonly trail: THREE.BufferGeometry | null;
}

interface StageRuntime {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  homePosition: THREE.Vector3;
}

type Segment = readonly [from: THREE.Vector3, to: THREE.Vector3];

const DURATION = 1_050;
const GRID_EXTENT = 3;
const TRAIL_STEPS = 64;
const UNIT_X = new THREE.Vector3(1, 0, 0);

const stageLayout = {
  display: "flex",
  flexDirection: "column",
  width: "100%",
  height: "100%",
  minWidth: 0,
  minHeight: 0,
} as const;

const viewportLayout = {
  position: "relative",
  flex: "1 1 auto",
  minWidth: 0,
  minHeight: 240,
  overflow: "hidden",
} as const;

const mountLayout = {
  position: "absolute",
  inset: 0,
} as const;

function validateInputs(
  matrix: RealMatrix,
  vector: RealVector,
  inputDimension: Dimension,
  outputDimension: Dimension,
) {
  if (vector.length !== inputDimension || !vector.every(Number.isFinite)) {
    throw new Error("测试向量维数与输入空间不一致。");
  }
  if (
    matrix.length !== outputDimension ||
    matrix.some(
      (row) =>
        row.length !== inputDimension ||
        row.some((value) => !Number.isFinite(value)),
    )
  ) {
    throw new Error("变换矩阵形状与输入、输出维数不一致。");
  }
}

function embedVector(values: readonly number[]): THREE.Vector3 {
  return new THREE.Vector3(values[0] ?? 0, values[1] ?? 0, values[2] ?? 0);
}

function projectInput(point: THREE.Vector3, dimension: Dimension) {
  const coordinates = [point.x, point.y, point.z];
  return coordinates.slice(0, dimension);
}

function applyMatrix(
  matrix: RealMatrix,
  point: THREE.Vector3,
  inputDimension: Dimension,
  outputDimension: Dimension,
) {
  const input = projectInput(point, inputDimension);
  const output = Array.from({ length: outputDimension }, (_, row) =>
    matrix[row]!.reduce(
      (sum, value, column) => sum + value * (input[column] ?? 0),
      0,
    ),
  );
  return embedVector(output);
}

function writeVector(
  target: Float32Array,
  offset: number,
  vector: THREE.Vector3,
) {
  target[offset] = vector.x;
  target[offset + 1] = vector.y;
  target[offset + 2] = vector.z;
}

function makeMorphGeometry(
  segments: readonly Segment[],
  matrix: RealMatrix,
  inputDimension: Dimension,
  outputDimension: Dimension,
  intermediateMatrix: RealMatrix | null,
) {
  const from = new Float32Array(segments.length * 6);
  const via = intermediateMatrix ? new Float32Array(segments.length * 6) : null;
  const to = new Float32Array(segments.length * 6);

  segments.forEach(([start, end], index) => {
    const offset = index * 6;
    writeVector(from, offset, start);
    writeVector(from, offset + 3, end);
    if (via && intermediateMatrix) {
      writeVector(
        via,
        offset,
        applyMatrix(intermediateMatrix, start, inputDimension, outputDimension),
      );
      writeVector(
        via,
        offset + 3,
        applyMatrix(intermediateMatrix, end, inputDimension, outputDimension),
      );
    }
    writeVector(
      to,
      offset,
      applyMatrix(matrix, start, inputDimension, outputDimension),
    );
    writeVector(
      to,
      offset + 3,
      applyMatrix(matrix, end, inputDimension, outputDimension),
    );
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(from.slice(), 3));
  return { geometry, from, via, to } satisfies MorphGeometry;
}

function gridSegments(dimension: Dimension): Segment[] {
  if (dimension === 1) {
    return [
      [
        new THREE.Vector3(-GRID_EXTENT, 0, 0),
        new THREE.Vector3(GRID_EXTENT, 0, 0),
      ],
    ];
  }

  const segments: Segment[] = [];
  const addPlane = (firstAxis: number, secondAxis: number) => {
    for (let value = -GRID_EXTENT; value <= GRID_EXTENT; value += 1) {
      const firstStart = new THREE.Vector3();
      const firstEnd = new THREE.Vector3();
      firstStart.setComponent(firstAxis, -GRID_EXTENT);
      firstEnd.setComponent(firstAxis, GRID_EXTENT);
      firstStart.setComponent(secondAxis, value);
      firstEnd.setComponent(secondAxis, value);
      segments.push([firstStart, firstEnd]);

      const secondStart = new THREE.Vector3();
      const secondEnd = new THREE.Vector3();
      secondStart.setComponent(secondAxis, -GRID_EXTENT);
      secondEnd.setComponent(secondAxis, GRID_EXTENT);
      secondStart.setComponent(firstAxis, value);
      secondEnd.setComponent(firstAxis, value);
      segments.push([secondStart, secondEnd]);
    }
  };

  addPlane(0, 1);
  if (dimension === 3) {
    addPlane(0, 2);
    addPlane(1, 2);
  }
  return segments;
}

function circleSegments(segments = 96): Segment[] {
  const result: Segment[] = [];
  for (let index = 0; index < segments; index += 1) {
    const startAngle = (index / segments) * Math.PI * 2;
    const endAngle = ((index + 1) / segments) * Math.PI * 2;
    result.push([
      new THREE.Vector3(Math.cos(startAngle), Math.sin(startAngle), 0),
      new THREE.Vector3(Math.cos(endAngle), Math.sin(endAngle), 0),
    ]);
  }
  return result;
}

function sphereSegments(): Segment[] {
  const result: Segment[] = [];
  const longitudeCount = 12;
  const latitudeCount = 7;
  const samples = 48;

  for (let longitude = 0; longitude < longitudeCount; longitude += 1) {
    const angle = (longitude / longitudeCount) * Math.PI * 2;
    for (let sample = 0; sample < samples; sample += 1) {
      const fromPhi = (sample / samples) * Math.PI * 2;
      const toPhi = ((sample + 1) / samples) * Math.PI * 2;
      result.push([
        new THREE.Vector3(
          Math.cos(fromPhi) * Math.cos(angle),
          Math.cos(fromPhi) * Math.sin(angle),
          Math.sin(fromPhi),
        ),
        new THREE.Vector3(
          Math.cos(toPhi) * Math.cos(angle),
          Math.cos(toPhi) * Math.sin(angle),
          Math.sin(toPhi),
        ),
      ]);
    }
  }

  for (let latitude = 1; latitude <= latitudeCount; latitude += 1) {
    const phi = (latitude / (latitudeCount + 1) - 0.5) * Math.PI;
    const radius = Math.cos(phi);
    const height = Math.sin(phi);
    for (let sample = 0; sample < samples; sample += 1) {
      const fromAngle = (sample / samples) * Math.PI * 2;
      const toAngle = ((sample + 1) / samples) * Math.PI * 2;
      result.push([
        new THREE.Vector3(
          radius * Math.cos(fromAngle),
          radius * Math.sin(fromAngle),
          height,
        ),
        new THREE.Vector3(
          radius * Math.cos(toAngle),
          radius * Math.sin(toAngle),
          height,
        ),
      ]);
    }
  }
  return result;
}

function createAxisLabel(text: string, color: string, position: THREE.Vector3) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = color;
  context.font = '500 30px "IBM Plex Mono", monospace';
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.position.copy(position);
  sprite.scale.set(0.56, 0.28, 1);
  sprite.renderOrder = 20;
  return sprite;
}

function addAxes(
  root: THREE.Group,
  dimension: Dimension,
  palette: CanvasPalette,
) {
  const colors = [palette.cyan, palette.yellow, palette.blue] as const;
  const labels = ["x1", "x2", "x3"] as const;
  const directions = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1),
  ];

  for (let index = 0; index < dimension; index += 1) {
    const direction = directions[index]!;
    const geometry = new THREE.BufferGeometry().setFromPoints([
      direction.clone().multiplyScalar(-GRID_EXTENT - 0.35),
      direction.clone().multiplyScalar(GRID_EXTENT + 0.35),
    ]);
    const material = new THREE.LineBasicMaterial({
      color: colors[index],
      transparent: true,
      opacity: 0.72,
    });
    root.add(new THREE.Line(geometry, material));
    const label = createAxisLabel(
      labels[index]!,
      colors[index]!,
      direction.clone().multiplyScalar(GRID_EXTENT + 0.62),
    );
    if (label) root.add(label);
  }

  const origin = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 12, 8),
    new THREE.MeshBasicMaterial({ color: palette.text }),
  );
  root.add(origin);
}

function setArrowVector(arrow: THREE.ArrowHelper, vector: THREE.Vector3) {
  const length = vector.length();
  if (length < 1e-8 || !Number.isFinite(length)) {
    arrow.visible = false;
    return;
  }
  arrow.visible = true;
  arrow.setDirection(vector.clone().normalize());
  arrow.setLength(
    length,
    Math.min(0.22, length * 0.22),
    Math.min(0.12, length * 0.12),
  );
}

function createArrow(
  from: THREE.Vector3,
  to: THREE.Vector3,
  color: string,
  labelText: string,
  via: THREE.Vector3 | null = null,
) {
  const arrow = new THREE.ArrowHelper(UNIT_X, new THREE.Vector3(), 1, color);
  setArrowVector(arrow, from);
  const label = createAxisLabel(labelText, color, from);
  return { arrow, label, from, via, to } satisfies MorphArrow;
}

function disposeObject(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();

  root.traverse((object) => {
    const renderable = object as THREE.Object3D & {
      geometry?: THREE.BufferGeometry;
      material?: THREE.Material | THREE.Material[];
    };
    if (
      renderable.geometry &&
      !(renderable.parent instanceof THREE.ArrowHelper)
    ) {
      geometries.add(renderable.geometry);
    }
    const objectMaterials = Array.isArray(renderable.material)
      ? renderable.material
      : renderable.material
        ? [renderable.material]
        : [];
    objectMaterials.forEach((material) => {
      materials.add(material);
      Object.values(material).forEach((value) => {
        if (value instanceof THREE.Texture) textures.add(value);
      });
    });
  });

  root.removeFromParent();
  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
  geometries.forEach((geometry) => geometry.dispose());
}

function buildContent(
  matrix: RealMatrix,
  intermediateMatrix: RealMatrix | null,
  vector: RealVector,
  inputDimension: Dimension,
  outputDimension: Dimension,
  palette: CanvasPalette,
  showGrid: boolean,
  showSphere: boolean,
  showTrail: boolean,
): StageContent {
  validateInputs(matrix, vector, inputDimension, outputDimension);
  if (intermediateMatrix) {
    validateInputs(intermediateMatrix, vector, inputDimension, outputDimension);
  }

  const root = new THREE.Group();
  const morphGeometries: MorphGeometry[] = [];
  const arrows: MorphArrow[] = [];
  const visibleDimension = Math.max(
    inputDimension,
    outputDimension,
  ) as Dimension;
  addAxes(root, visibleDimension, palette);

  if (showGrid) {
    const morph = makeMorphGeometry(
      gridSegments(inputDimension),
      matrix,
      inputDimension,
      outputDimension,
      intermediateMatrix,
    );
    const grid = new THREE.LineSegments(
      morph.geometry,
      new THREE.LineBasicMaterial({
        color: palette.gridMajor,
        transparent: true,
        opacity: 0.58,
      }),
    );
    grid.renderOrder = 1;
    root.add(grid);
    morphGeometries.push(morph);
  }

  if (showSphere && inputDimension > 1) {
    const segments = inputDimension === 2 ? circleSegments() : sphereSegments();
    const morph = makeMorphGeometry(
      segments,
      matrix,
      inputDimension,
      outputDimension,
      intermediateMatrix,
    );
    const sphere = new THREE.LineSegments(
      morph.geometry,
      new THREE.LineBasicMaterial({
        color: palette.red,
        transparent: true,
        opacity: 0.78,
      }),
    );
    sphere.renderOrder = 3;
    root.add(sphere);
    morphGeometries.push(morph);
  } else if (showSphere) {
    const points = [
      [new THREE.Vector3(-1, 0, 0), new THREE.Vector3(-1, 0, 0)],
      [new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, 0, 0)],
    ] as const;
    const morph = makeMorphGeometry(
      points,
      matrix,
      inputDimension,
      outputDimension,
      intermediateMatrix,
    );
    const sphere = new THREE.Points(
      morph.geometry,
      new THREE.PointsMaterial({
        color: palette.red,
        size: 0.12,
        sizeAttenuation: true,
      }),
    );
    root.add(sphere);
    morphGeometries.push(morph);
  }

  const basisColors = [palette.cyan, palette.yellow, palette.blue] as const;
  for (let index = 0; index < inputDimension; index += 1) {
    const basis = new THREE.Vector3().setComponent(index, 1);
    const arrow = createArrow(
      basis,
      applyMatrix(matrix, basis, inputDimension, outputDimension),
      basisColors[index]!,
      `b${index + 1}`,
      intermediateMatrix
        ? applyMatrix(
            intermediateMatrix,
            basis,
            inputDimension,
            outputDimension,
          )
        : null,
    );
    root.add(arrow.arrow);
    if (arrow.label) root.add(arrow.label);
    arrows.push(arrow);
  }

  const sourceVector = embedVector(vector);
  const outputVector = applyMatrix(
    matrix,
    sourceVector,
    inputDimension,
    outputDimension,
  );
  const intermediateVector = intermediateMatrix
    ? applyMatrix(
        intermediateMatrix,
        sourceVector,
        inputDimension,
        outputDimension,
      )
    : null;
  const sampleArrow = createArrow(
    sourceVector,
    outputVector,
    palette.red,
    "v",
    intermediateVector,
  );
  root.add(sampleArrow.arrow);
  if (sampleArrow.label) root.add(sampleArrow.label);
  arrows.push(sampleArrow);

  let trail: THREE.BufferGeometry | null = null;
  if (showTrail) {
    const positions = new Float32Array((TRAIL_STEPS + 1) * 3);
    for (let index = 0; index <= TRAIL_STEPS; index += 1) {
      const progress = index / TRAIL_STEPS;
      writeVector(
        positions,
        index * 3,
        interpolateStageVector(
          sourceVector,
          intermediateVector,
          outputVector,
          progress,
        ),
      );
    }
    trail = new THREE.BufferGeometry();
    trail.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    trail.setDrawRange(0, 1);
    const line = new THREE.Line(
      trail,
      new THREE.LineDashedMaterial({
        color: palette.red,
        transparent: true,
        opacity: 0.62,
        dashSize: 0.09,
        gapSize: 0.07,
      }),
    );
    line.computeLineDistances();
    root.add(line);
  }

  return { root, morphGeometries, arrows, sampleArrow, trail };
}

function interpolateStageValue(
  from: number,
  via: number | null,
  to: number,
  progress: number,
) {
  if (via === null) return from + (to - from) * progress;
  return progress <= 0.5
    ? from + (via - from) * progress * 2
    : via + (to - via) * (progress - 0.5) * 2;
}

function interpolateStageVector(
  from: THREE.Vector3,
  via: THREE.Vector3 | null,
  to: THREE.Vector3,
  progress: number,
) {
  if (!via) return from.clone().lerp(to, progress);
  return progress <= 0.5
    ? from.clone().lerp(via, progress * 2)
    : via.clone().lerp(to, (progress - 0.5) * 2);
}

function observedTransformOutput(vector: THREE.Vector3) {
  return [vector.x, vector.y, vector.z]
    .map((value) => Number(value.toFixed(6)))
    .join(",");
}

function updateContent(content: StageContent, progress: number) {
  content.morphGeometries.forEach(({ geometry, from, via, to }) => {
    const position = geometry.getAttribute("position") as THREE.BufferAttribute;
    const target = position.array as Float32Array;
    for (let index = 0; index < target.length; index += 1) {
      target[index] = interpolateStageValue(
        from[index]!,
        via?.[index] ?? null,
        to[index]!,
        progress,
      );
    }
    position.needsUpdate = true;
    geometry.computeBoundingSphere();
  });

  content.arrows.forEach(({ arrow, label, from, via, to }) => {
    const current = interpolateStageVector(from, via, to, progress);
    setArrowVector(arrow, current);
    if (label) {
      const length = current.length();
      label.visible = arrow.visible;
      label.position.copy(current);
      if (length > 1e-8) label.position.addScaledVector(current, 0.12 / length);
      label.position.y += 0.11;
    }
  });

  content.trail?.setDrawRange(
    0,
    Math.max(1, Math.floor(progress * TRAIL_STEPS) + 1),
  );
  return interpolateStageVector(
    content.sampleArrow.from,
    content.sampleArrow.via,
    content.sampleArrow.to,
    progress,
  );
}

function cameraHome(dimension: Dimension) {
  if (dimension === 1) return new THREE.Vector3(5.8, 3.1, 4.1);
  if (dimension === 2) return new THREE.Vector3(5.2, 4.6, 6.8);
  return new THREE.Vector3(6.7, 5.5, 7.8);
}

function orbitCamera(
  runtime: StageRuntime,
  thetaDelta: number,
  phiDelta: number,
) {
  const offset = runtime.camera.position.clone().sub(runtime.controls.target);
  const spherical = new THREE.Spherical().setFromVector3(offset);
  spherical.theta += thetaDelta;
  spherical.phi = THREE.MathUtils.clamp(
    spherical.phi + phiDelta,
    0.12,
    Math.PI - 0.12,
  );
  runtime.camera.position
    .setFromSpherical(spherical)
    .add(runtime.controls.target);
  runtime.camera.lookAt(runtime.controls.target);
  runtime.controls.update();
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export const ThreeTransformStage = forwardRef<
  ThreeTransformStageHandle,
  ThreeTransformStageProps
>(function ThreeTransformStage(
  {
    matrix,
    intermediateMatrix = null,
    vector,
    inputDimension,
    outputDimension,
    theme,
    showGrid,
    showSphere,
    showTrail,
    exportFilename,
  },
  forwardedRef,
) {
  const mountRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<StageRuntime | null>(null);
  const contentRef = useRef<StageContent | null>(null);
  const renderNowRef = useRef<(progress?: number) => void>(() => undefined);
  const resetCameraRef = useRef<() => void>(() => undefined);
  const previousDimensionRef = useRef<Dimension | null>(null);
  const initialDimensionRef = useRef(
    Math.max(inputDimension, outputDimension) as Dimension,
  );
  const mountedRef = useRef(false);

  const timelineRef = useRef<AnimationTimeline | null>(null);
  if (!timelineRef.current) {
    timelineRef.current = new AnimationTimeline({
      duration: DURATION,
      initialProgress: 1,
    });
  }
  const timeline = timelineRef.current;
  const [timelineSnapshot, setTimelineSnapshot] = useState<TimelineSnapshot>(
    () => timeline.getSnapshot(),
  );
  const timelineSnapshotRef = useRef(timelineSnapshot);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [systemReducedMotion, setSystemReducedMotion] = useState(false);

  const renderNow = useCallback((progress?: number) => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    try {
      const currentProgress =
        progress ?? timelineSnapshotRef.current.easedProgress;
      const currentOutput = contentRef.current
        ? updateContent(contentRef.current, currentProgress)
        : null;
      if (currentOutput) {
        runtime.renderer.domElement.dataset.transformOutput =
          observedTransformOutput(currentOutput);
      } else {
        delete runtime.renderer.domElement.dataset.transformOutput;
      }
      runtime.renderer.render(runtime.scene, runtime.camera);
      runtime.renderer.domElement.dataset.progress =
        timelineSnapshotRef.current.progress.toFixed(4);
    } catch {
      if (mountedRef.current) {
        setRenderError("三维场景渲染失败，请刷新页面或检查图形加速设置。");
      }
    }
  }, []);
  renderNowRef.current = renderNow;

  const resetCamera = useCallback(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.camera.position.copy(runtime.homePosition);
    runtime.controls.target.set(0, 0, 0);
    runtime.controls.update();
    renderNowRef.current();
  }, []);
  resetCameraRef.current = resetCamera;

  useImperativeHandle(
    forwardedRef,
    () => ({
      replay: () => timeline.replay(),
      seek: (progress) => timeline.seek(progress),
    }),
    [timeline],
  );

  useEffect(() => {
    mountedRef.current = true;
    const mount = mountRef.current;
    if (!mount) return;

    let runtime: StageRuntime | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let removeWindowResize: (() => void) | null = null;

    try {
      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
        preserveDrawingBuffer: true,
      });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
      renderer.domElement.className =
        "visualization-stage__canvas three-transform-stage__canvas";
      renderer.domElement.dataset.testid = "visualization-stage-canvas";
      renderer.domElement.dataset.renderState = "static";
      renderer.domElement.dataset.playbackState = "complete";
      renderer.domElement.setAttribute("role", "img");
      renderer.domElement.setAttribute("tabindex", "0");
      renderer.domElement.setAttribute(
        "aria-label",
        "实线性变换的三维嵌入视图",
      );
      renderer.domElement.style.display = "block";
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      mount.replaceChildren(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 160);
      const homePosition = cameraHome(initialDimensionRef.current);
      camera.position.copy(homePosition);
      camera.lookAt(0, 0, 0);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = false;
      controls.enablePan = true;
      controls.minDistance = 2;
      controls.maxDistance = 36;
      controls.target.set(0, 0, 0);
      controls.update();

      runtime = { renderer, scene, camera, controls, homePosition };
      runtimeRef.current = runtime;

      const resize = () => {
        const bounds = mount.getBoundingClientRect();
        const width = Math.max(1, Math.round(bounds.width));
        const height = Math.max(1, Math.round(bounds.height));
        renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderNowRef.current();
      };

      const onControlsChange = () => renderNowRef.current();
      const onContextLost = (event: Event) => {
        event.preventDefault();
        timeline.pause();
        if (mountedRef.current) {
          setRenderError("图形上下文已丢失，正在等待浏览器恢复。");
        }
      };
      const onContextRestored = () => {
        renderer.resetState();
        if (mountedRef.current) setRenderError(null);
        resize();
      };
      const onKeyDown = (event: KeyboardEvent) => {
        let handled = true;
        switch (event.key) {
          case " ":
            if (timeline.getSnapshot().state === "playing") timeline.pause();
            else if (timeline.getSnapshot().progress >= 1) timeline.replay();
            else timeline.play();
            break;
          case "Home":
            timeline.seek(0);
            break;
          case "End":
            timeline.seek(1);
            break;
          case "0":
            resetCameraRef.current();
            break;
          case "ArrowLeft":
            orbitCamera(runtime!, -0.11, 0);
            break;
          case "ArrowRight":
            orbitCamera(runtime!, 0.11, 0);
            break;
          case "ArrowUp":
            orbitCamera(runtime!, 0, -0.09);
            break;
          case "ArrowDown":
            orbitCamera(runtime!, 0, 0.09);
            break;
          case "+":
          case "=":
            camera.position.lerp(controls.target, 0.16);
            controls.update();
            renderNowRef.current();
            break;
          case "-":
          case "_":
            camera.position
              .sub(controls.target)
              .multiplyScalar(1.18)
              .add(controls.target);
            controls.update();
            renderNowRef.current();
            break;
          default:
            handled = false;
        }
        if (handled) event.preventDefault();
      };

      controls.addEventListener("change", onControlsChange);
      renderer.domElement.addEventListener("webglcontextlost", onContextLost);
      renderer.domElement.addEventListener(
        "webglcontextrestored",
        onContextRestored,
      );
      renderer.domElement.addEventListener("keydown", onKeyDown);

      if (typeof ResizeObserver === "function") {
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(mount);
      } else {
        globalThis.addEventListener("resize", resize);
        removeWindowResize = () =>
          globalThis.removeEventListener("resize", resize);
      }
      resize();

      return () => {
        mountedRef.current = false;
        resizeObserver?.disconnect();
        removeWindowResize?.();
        controls.removeEventListener("change", onControlsChange);
        renderer.domElement.removeEventListener(
          "webglcontextlost",
          onContextLost,
        );
        renderer.domElement.removeEventListener(
          "webglcontextrestored",
          onContextRestored,
        );
        renderer.domElement.removeEventListener("keydown", onKeyDown);
        if (contentRef.current) disposeObject(contentRef.current.root);
        contentRef.current = null;
        controls.dispose();
        renderer.setAnimationLoop(null);
        renderer.renderLists.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        runtimeRef.current = null;
        mount.replaceChildren();
      };
    } catch {
      if (mountedRef.current) {
        setRenderError(
          "浏览器无法启动 WebGL。请启用图形加速或使用支持 WebGL 2 的浏览器。",
        );
      }
      runtime?.controls.dispose();
      runtime?.renderer.dispose();
      runtimeRef.current = null;
    }

    return () => {
      mountedRef.current = false;
    };
  }, [timeline]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    try {
      if (contentRef.current) disposeObject(contentRef.current.root);
      const palette = getCanvasPalette(theme);
      runtime.renderer.setClearColor(palette.background, 1);
      const content = buildContent(
        matrix,
        intermediateMatrix,
        vector,
        inputDimension,
        outputDimension,
        palette,
        showGrid,
        showSphere,
        showTrail,
      );
      runtime.scene.add(content.root);
      contentRef.current = content;

      const visibleDimension = Math.max(
        inputDimension,
        outputDimension,
      ) as Dimension;
      runtime.homePosition = cameraHome(visibleDimension);
      if (previousDimensionRef.current !== visibleDimension) {
        previousDimensionRef.current = visibleDimension;
        resetCameraRef.current();
      }
      setRenderError(null);
      renderNowRef.current();
    } catch (error) {
      contentRef.current = null;
      setRenderError(
        error instanceof Error
          ? error.message
          : "三维场景参数无效，无法完成渲染。",
      );
    }
  }, [
    inputDimension,
    intermediateMatrix,
    matrix,
    outputDimension,
    showGrid,
    showSphere,
    showTrail,
    theme,
    vector,
  ]);

  useEffect(() => {
    const unsubscribe = timeline.subscribe((snapshot) => {
      timelineSnapshotRef.current = snapshot;
      if (mountedRef.current) setTimelineSnapshot(snapshot);
      const canvas = runtimeRef.current?.renderer.domElement;
      if (canvas) {
        canvas.dataset.playbackState = snapshot.state;
        canvas.dataset.renderState =
          snapshot.state === "playing" ? "animating" : "static";
        canvas.dataset.progress = snapshot.progress.toFixed(4);
      }
      renderNowRef.current(snapshot.easedProgress);
    });
    return () => {
      unsubscribe();
      timeline.pause();
    };
  }, [timeline]);

  useEffect(() => {
    const query = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    const update = () => setSystemReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    timeline.setReducedMotion(systemReducedMotion);
  }, [systemReducedMotion, timeline]);

  useEffect(() => {
    const canvas = runtimeRef.current?.renderer.domElement;
    if (!canvas) return;
    canvas.setAttribute(
      "aria-label",
      `${inputDimension}维到${outputDimension}维实线性变换的三维嵌入视图`,
    );
    canvas.dataset.renderState = renderError
      ? "error"
      : timelineSnapshot.state === "playing"
        ? "animating"
        : "static";
  }, [inputDimension, outputDimension, renderError, timelineSnapshot.state]);

  const exportPng = useCallback(async () => {
    const renderer = runtimeRef.current?.renderer;
    if (!renderer || renderError) return;
    renderNowRef.current();
    const blob = await new Promise<Blob | null>((resolve) =>
      renderer.domElement.toBlob(resolve, "image/png"),
    );
    if (blob) triggerDownload(blob, exportFilename);
  }, [exportFilename, renderError]);

  const handlePrimaryPlayback = () => {
    if (timelineSnapshot.state === "playing") timeline.pause();
    else if (timelineSnapshot.progress >= 1) timeline.replay();
    else timeline.play();
  };

  const primaryPlaybackLabel =
    timelineSnapshot.state === "playing"
      ? "暂停"
      : timelineSnapshot.progress >= 1
        ? "重新播放"
        : "播放";
  const PrimaryPlaybackIcon =
    timelineSnapshot.state === "playing"
      ? Pause
      : timelineSnapshot.progress >= 1
        ? RotateCcw
        : Play;

  return (
    <section
      className="three-transform-stage"
      style={stageLayout}
      data-testid="visualization-stage"
      data-render-state={
        renderError
          ? "error"
          : timelineSnapshot.state === "playing"
            ? "animating"
            : "static"
      }
      data-playback-state={timelineSnapshot.state}
    >
      <div className="three-transform-stage__viewport" style={viewportLayout}>
        <div
          ref={mountRef}
          className="three-transform-stage__mount"
          style={mountLayout}
        />

        <div
          className="visualization-stage__view-controls three-transform-stage__view-controls"
          role="toolbar"
          aria-label="三维视图"
          data-testid="visualization-stage-view-controls"
        >
          <IconButton
            label="重置相机"
            onClick={resetCamera}
            disabled={Boolean(renderError)}
            data-testid="visualization-stage-reset-view"
          >
            <LocateFixed size={17} aria-hidden="true" />
          </IconButton>
          <IconButton
            label="导出 PNG"
            onClick={() => void exportPng()}
            disabled={Boolean(renderError)}
            data-testid="visualization-stage-export"
          >
            <Download size={17} aria-hidden="true" />
          </IconButton>
        </div>

        {renderError && (
          <div className="three-transform-stage__fallback" role="alert">
            <strong>三维视图不可用</strong>
            <span>{renderError}</span>
          </div>
        )}
      </div>

      <div
        className="visualization-stage__transport three-transform-stage__transport"
        role="group"
        aria-label="动画时间轴"
        data-testid="visualization-stage-controls"
      >
        <div className="three-transform-stage__transport-buttons">
          <IconButton
            label="回到起点"
            onClick={() => timeline.seek(0)}
            disabled={timelineSnapshot.progress <= 0 || Boolean(renderError)}
            data-testid="visualization-stage-rewind"
          >
            <SkipBack size={17} aria-hidden="true" />
          </IconButton>
          <IconButton
            label={primaryPlaybackLabel}
            onClick={handlePrimaryPlayback}
            disabled={Boolean(renderError)}
            data-testid="visualization-stage-playback"
          >
            <PrimaryPlaybackIcon size={17} aria-hidden="true" />
          </IconButton>
        </div>

        <input
          className="visualization-stage__scrubber three-transform-stage__scrubber"
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={timelineSnapshot.progress}
          aria-label="动画进度"
          aria-valuetext={`${Math.round(timelineSnapshot.progress * 100)}%`}
          data-testid="visualization-stage-scrubber"
          disabled={Boolean(renderError)}
          onChange={(event) => timeline.seek(Number(event.currentTarget.value))}
        />

        <output className="three-transform-stage__progress" aria-live="off">
          {Math.round(timelineSnapshot.progress * 100)}%
        </output>
      </div>
    </section>
  );
});

ThreeTransformStage.displayName = "ThreeTransformStage";
