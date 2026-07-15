import { Download, LocateFixed } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ThemeMode } from "../../app/types";
import { IconButton } from "../../components/ui/IconButton";
import type { CertifiedRealEigenpair, RealMatrix } from "../../math/nd";
import { getCanvasPalette } from "../../rendering";

interface ThreeEigenStageProps {
  readonly matrix: RealMatrix;
  readonly eigenpairs: readonly CertifiedRealEigenpair[];
  readonly hasRealGeometry: boolean;
  readonly theme: ThemeMode;
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
    materials.forEach((material) => material.dispose());
  });
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Dedicated demand-rendered 3D eigen stage; it never invents complex geometry. */
export function ThreeEigenStage({
  matrix,
  eigenpairs,
  hasRealGeometry,
  theme,
}: ThreeEigenStageProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<THREE.Group | null>(null);
  const runtimeRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resetCamera = useCallback(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.camera.position.set(5.5, 4.5, 6.5);
    runtime.controls.target.set(0, 0, 0);
    runtime.controls.update();
    runtime.renderer.render(runtime.scene, runtime.camera);
  }, []);

  const exportPng = useCallback(async () => {
    const renderer = runtimeRef.current?.renderer;
    if (!renderer) return;
    renderer.render(runtimeRef.current!.scene, runtimeRef.current!.camera);
    const blob = await new Promise<Blob | null>((resolve) =>
      renderer.domElement.toBlob(resolve, "image/png"),
    );
    if (blob) download(blob, "basis-lab-eigen-3d.png");
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    try {
      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        preserveDrawingBuffer: true,
        powerPreference: "high-performance",
      });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
      renderer.domElement.className =
        "visualization-stage__canvas three-eigen-stage__canvas";
      renderer.domElement.dataset.testid = "visualization-stage-canvas";
      renderer.domElement.dataset.renderState = "static";
      renderer.domElement.setAttribute("role", "img");
      renderer.domElement.setAttribute("aria-label", "三维实特征方向视图");
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      renderer.domElement.style.display = "block";
      mount.replaceChildren(renderer.domElement);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 100);
      camera.position.set(5.5, 4.5, 6.5);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = false;
      controls.target.set(0, 0, 0);
      controls.update();
      const render = () => renderer.render(scene, camera);
      controls.addEventListener("change", render);
      runtimeRef.current = { renderer, scene, camera, controls };
      const resize = () => {
        const bounds = mount.getBoundingClientRect();
        renderer.setSize(
          Math.max(1, bounds.width),
          Math.max(1, bounds.height),
          false,
        );
        camera.aspect = Math.max(1, bounds.width) / Math.max(1, bounds.height);
        camera.updateProjectionMatrix();
        render();
      };
      const observer = new ResizeObserver(resize);
      observer.observe(mount);
      resize();
      return () => {
        observer.disconnect();
        controls.removeEventListener("change", render);
        controls.dispose();
        if (contentRef.current) dispose(contentRef.current);
        renderer.renderLists.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        mount.replaceChildren();
        runtimeRef.current = null;
      };
    } catch {
      setError("浏览器无法启动三维图形视图。");
    }
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    if (contentRef.current) {
      runtime.scene.remove(contentRef.current);
      dispose(contentRef.current);
    }
    const palette = getCanvasPalette(theme);
    runtime.renderer.setClearColor(palette.background, 1);
    const root = new THREE.Group();
    const colors = [palette.cyan, palette.yellow, palette.blue];
    for (let axis = 0; axis < 3; axis += 1) {
      const direction = new THREE.Vector3().setComponent(axis, 1);
      const geometry = new THREE.BufferGeometry().setFromPoints([
        direction.clone().multiplyScalar(-3.2),
        direction.clone().multiplyScalar(3.2),
      ]);
      root.add(
        new THREE.Line(
          geometry,
          new THREE.LineBasicMaterial({
            color: colors[axis],
            transparent: true,
            opacity: 0.45,
          }),
        ),
      );
    }
    if (hasRealGeometry) {
      eigenpairs.forEach((pair, index) => {
        const vector = new THREE.Vector3(
          pair.vector[0],
          pair.vector[1],
          pair.vector[2],
        );
        const color = colors[index % colors.length]!;
        const line = new THREE.BufferGeometry().setFromPoints([
          vector.clone().multiplyScalar(-3),
          vector.clone().multiplyScalar(3),
        ]);
        root.add(
          new THREE.Line(
            line,
            new THREE.LineDashedMaterial({
              color,
              dashSize: 0.18,
              gapSize: 0.1,
            }),
          ),
        );
        root.add(
          new THREE.ArrowHelper(
            vector.clone().normalize(),
            new THREE.Vector3(),
            1.35,
            color,
          ),
        );
      });
    }
    runtime.scene.add(root);
    contentRef.current = root;
    runtime.renderer.domElement.dataset.eigenGeometry = hasRealGeometry
      ? "real"
      : "unavailable";
    runtime.renderer.domElement.dataset.matrix = JSON.stringify(matrix);
    runtime.renderer.render(runtime.scene, runtime.camera);
  }, [eigenpairs, hasRealGeometry, matrix, theme]);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        minHeight: 300,
        position: "relative",
      }}
    >
      <div ref={mountRef} style={{ position: "absolute", inset: 0 }} />
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
      {error && <div className="visualization-stage__fallback">{error}</div>}
    </div>
  );
}
