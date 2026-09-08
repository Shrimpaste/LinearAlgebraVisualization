import {
  Download,
  LocateFixed,
  Minus,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  Plus,
} from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from "react";
import type { Vec2 } from "../math/types";
import {
  AnimationTimeline,
  type EasingFunction,
  type PlaybackState,
  type TimelineSnapshot,
  type ViewportOptions,
  type ViewportSnapshot,
  type CanvasSize,
  Viewport2D,
  prepareCanvasContext,
  resizeCanvas,
} from "../engine";
import { IconButton } from "./ui/IconButton";
import { registerStage } from "../app/stageSession";

export interface VisualizationRenderFrame {
  readonly ctx: CanvasRenderingContext2D;
  readonly viewport: Viewport2D;
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
  /** Linear timeline position, appropriate for scrubber and exact calculations. */
  readonly progress: number;
  /** Eased timeline position, appropriate for interpolating rendered geometry. */
  readonly easedProgress: number;
  readonly playbackState: PlaybackState;
}

export type VisualizationRenderer = (frame: VisualizationRenderFrame) => void;

export interface VisualizationPointerEvent {
  readonly canvas: Vec2;
  readonly world: Vec2;
  readonly deltaCanvas: Vec2;
  readonly viewport: ViewportSnapshot;
  readonly pointerId: number;
  readonly pointerType: string;
  readonly buttons: number;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
  readonly originalEvent: PointerEvent;
}

/** Return true from pointer-down to claim the gesture instead of panning. */
export type VisualizationPointerDownHandler = (
  event: VisualizationPointerEvent,
) => boolean | void;
export type VisualizationPointerHandler = (
  event: VisualizationPointerEvent,
) => void;

export interface PngExportOptions {
  filename?: string;
  download?: boolean;
}

export interface PngExportResult {
  readonly blob: Blob;
  readonly filename: string;
  readonly width: number;
  readonly height: number;
}

export interface VisualizationStageHandle {
  play(): void;
  pause(): void;
  replay(): void;
  seek(progress: number): void;
  setSpeed(speed: number): void;
  resetView(): void;
  zoomIn(): void;
  zoomOut(): void;
  requestRender(): void;
  getViewport(): ViewportSnapshot;
  getTimeline(): TimelineSnapshot;
  exportPng(options?: PngExportOptions): Promise<PngExportResult | null>;
}

export interface VisualizationStageProps {
  render: VisualizationRenderer;
  duration?: number;
  initialProgress?: number;
  initialSpeed?: number;
  easing?: EasingFunction;
  autoPlay?: boolean;
  reducedMotion?: boolean;
  viewport?: ViewportOptions;
  maxDevicePixelRatio?: number;
  background?: string;
  ariaLabel?: string;
  fallbackDescription?: string;
  className?: string;
  style?: CSSProperties;
  overlay?: ReactNode;
  renderKey?: unknown;
  showControls?: boolean;
  showViewControls?: boolean;
  showExportButton?: boolean;
  exportFilename?: string;
  downloadOnExport?: boolean;
  testId?: string;
  onProgressChange?: (progress: number, state: PlaybackState) => void;
  onPlaybackStateChange?: (state: PlaybackState) => void;
  onViewportChange?: (viewport: ViewportSnapshot) => void;
  onExport?: (result: PngExportResult) => void;
  onRenderError?: (error: unknown) => void;
  onPointerDown?: VisualizationPointerDownHandler;
  onPointerMove?: VisualizationPointerHandler;
  onPointerUp?: VisualizationPointerHandler;
  onPointerCancel?: VisualizationPointerHandler;
}

type RenderStatus = "initializing" | "ready" | "error";
type InteractionState = "idle" | "panning" | "scene";

interface ActiveGesture {
  readonly pointerId: number;
  readonly mode: Exclude<InteractionState, "idle">;
  lastCanvas: Vec2;
}

const SPEEDS = [0.5, 1, 1.5, 2] as const;
const EMPTY_SIZE: CanvasSize = {
  width: 1,
  height: 1,
  dpr: 1,
  pixelWidth: 1,
  pixelHeight: 1,
};

const stageLayout: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  width: "100%",
  height: "100%",
  minWidth: 0,
  minHeight: 0,
};

const viewportLayout: CSSProperties = {
  position: "relative",
  flex: "1 1 auto",
  minWidth: 0,
  minHeight: 240,
  overflow: "hidden",
};

const toolbarLayout: CSSProperties = {
  position: "absolute",
  top: 10,
  right: 10,
  display: "flex",
  gap: 3,
  padding: 3,
  border: "1px solid var(--line)",
  borderRadius: 5,
  background: "color-mix(in srgb, var(--paper-raised) 92%, transparent)",
  boxShadow: "0 4px 16px var(--shadow)",
};

const transportLayout: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "auto minmax(100px, 1fr) auto auto",
  alignItems: "center",
  gap: 10,
  minHeight: 54,
  padding: "7px 12px",
  borderTop: "1px solid var(--line)",
  background: "var(--paper-raised)",
};

function mergeClassName(...names: Array<string | undefined>) {
  return names.filter(Boolean).join(" ");
}

function getCanvasPoint(
  event:
    ReactPointerEvent<HTMLCanvasElement> | ReactWheelEvent<HTMLCanvasElement>,
): Vec2 {
  const bounds = event.currentTarget.getBoundingClientRect();
  return [event.clientX - bounds.left, event.clientY - bounds.top];
}

function requestSingleFrame(callback: FrameRequestCallback) {
  if (typeof globalThis.requestAnimationFrame === "function") {
    return globalThis.requestAnimationFrame(callback);
  }
  return globalThis.setTimeout(
    () => callback(globalThis.performance?.now() ?? Date.now()),
    16,
  ) as unknown as number;
}

function cancelSingleFrame(handle: number) {
  if (typeof globalThis.cancelAnimationFrame === "function") {
    globalThis.cancelAnimationFrame(handle);
  } else {
    globalThis.clearTimeout(handle);
  }
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export const VisualizationStage = forwardRef<
  VisualizationStageHandle,
  VisualizationStageProps
>(function VisualizationStage(
  {
    render,
    duration = 900,
    initialProgress = 1,
    initialSpeed = 1,
    easing,
    autoPlay = false,
    reducedMotion,
    viewport: viewportOptions,
    maxDevicePixelRatio = 2,
    background,
    ariaLabel = "线性代数可视化画布",
    fallbackDescription = "当前数学场景的交互式几何可视化。",
    className,
    style,
    overlay,
    renderKey,
    showControls = true,
    showViewControls = true,
    showExportButton = false,
    exportFilename = "linear-algebra-visualization.png",
    downloadOnExport = true,
    testId = "visualization-stage",
    onProgressChange,
    onPlaybackStateChange,
    onViewportChange,
    onExport,
    onRenderError,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  },
  forwardedRef,
) {
  const stageRef = useRef<HTMLElement>(null);
  const viewportContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef<CanvasSize>(EMPTY_SIZE);
  const pendingDrawRef = useRef<number | null>(null);
  const mountedRef = useRef(false);
  const drawNowRef = useRef<() => void>(() => undefined);
  const gestureRef = useRef<ActiveGesture | null>(null);
  const resumeAfterScrubRef = useRef(false);
  const renderStatusRef = useRef<RenderStatus>("initializing");

  const renderRef = useRef(render);
  const backgroundRef = useRef(background);
  const onProgressChangeRef = useRef(onProgressChange);
  const onPlaybackStateChangeRef = useRef(onPlaybackStateChange);
  const onViewportChangeRef = useRef(onViewportChange);
  const onExportRef = useRef(onExport);
  const onRenderErrorRef = useRef(onRenderError);
  const pointerDownRef = useRef(onPointerDown);
  const pointerMoveRef = useRef(onPointerMove);
  const pointerUpRef = useRef(onPointerUp);
  const pointerCancelRef = useRef(onPointerCancel);

  renderRef.current = render;
  backgroundRef.current = background;
  onProgressChangeRef.current = onProgressChange;
  onPlaybackStateChangeRef.current = onPlaybackStateChange;
  onViewportChangeRef.current = onViewportChange;
  onExportRef.current = onExport;
  onRenderErrorRef.current = onRenderError;
  pointerDownRef.current = onPointerDown;
  pointerMoveRef.current = onPointerMove;
  pointerUpRef.current = onPointerUp;
  pointerCancelRef.current = onPointerCancel;

  const viewportRef = useRef<Viewport2D | null>(null);
  if (!viewportRef.current)
    viewportRef.current = new Viewport2D(viewportOptions);
  const viewport = viewportRef.current;

  const timelineRef = useRef<AnimationTimeline | null>(null);
  if (!timelineRef.current) {
    timelineRef.current = new AnimationTimeline({
      duration,
      initialProgress,
      speed: initialSpeed,
      easing,
    });
  }
  const timeline = timelineRef.current;

  const [timelineSnapshot, setTimelineSnapshot] = useState<TimelineSnapshot>(
    () => timeline.getSnapshot(),
  );
  const timelineSnapshotRef = useRef(timelineSnapshot);
  const [renderStatus, setRenderStatus] =
    useState<RenderStatus>("initializing");
  const [interactionState, setInteractionState] =
    useState<InteractionState>("idle");
  const [systemReducedMotion, setSystemReducedMotion] = useState(false);

  timelineSnapshotRef.current = timelineSnapshot;

  const setRenderStatusIfChanged = useCallback((status: RenderStatus) => {
    if (renderStatusRef.current === status || !mountedRef.current) return;
    renderStatusRef.current = status;
    setRenderStatus(status);
  }, []);

  const drawNow = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const previousSize = sizeRef.current;
    const size = resizeCanvas(canvas, previousSize.width, previousSize.height, {
      maxDevicePixelRatio,
    });
    sizeRef.current = size;
    viewport.resize(size.width, size.height);

    const context = canvas.getContext("2d");
    if (!context) return;

    const snapshot = timelineSnapshotRef.current;
    try {
      prepareCanvasContext(context, size, backgroundRef.current);
      context.save();
      try {
        renderRef.current({
          ctx: context,
          viewport,
          width: size.width,
          height: size.height,
          dpr: size.dpr,
          progress: snapshot.progress,
          easedProgress: snapshot.easedProgress,
          playbackState: snapshot.state,
        });
      } finally {
        context.restore();
      }
      canvas.dataset.renderState =
        snapshot.state === "playing" ? "animating" : "static";
      canvas.dataset.progress = snapshot.progress.toFixed(4);
      setRenderStatusIfChanged("ready");
    } catch (error) {
      setRenderStatusIfChanged("error");
      canvas.dataset.renderState = "error";
      onRenderErrorRef.current?.(error);
    }
  }, [maxDevicePixelRatio, setRenderStatusIfChanged, viewport]);

  drawNowRef.current = drawNow;

  const requestRender = useCallback(() => {
    if (pendingDrawRef.current !== null) return;
    pendingDrawRef.current = requestSingleFrame(() => {
      pendingDrawRef.current = null;
      drawNowRef.current();
    });
  }, []);

  const notifyViewportChange = useCallback(() => {
    onViewportChangeRef.current?.(viewport.snapshot());
  }, [viewport]);

  const zoomBy = useCallback(
    (
      factor: number,
      anchor: Vec2 = [viewport.width / 2, viewport.height / 2],
    ) => {
      viewport.zoomAt(factor, anchor);
      notifyViewportChange();
      requestRender();
    },
    [notifyViewportChange, requestRender, viewport],
  );

  const resetView = useCallback(() => {
    viewport.reset();
    notifyViewportChange();
    requestRender();
  }, [notifyViewportChange, requestRender, viewport]);

  const makePointerEvent = useCallback(
    (
      event: ReactPointerEvent<HTMLCanvasElement>,
      canvas: Vec2,
      deltaCanvas: Vec2 = [0, 0],
    ): VisualizationPointerEvent => ({
      canvas,
      world: viewport.canvasToWorld(canvas),
      deltaCanvas,
      viewport: viewport.snapshot(),
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      buttons: event.buttons,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
      originalEvent: event.nativeEvent,
    }),
    [viewport],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const canvas = getCanvasPoint(event);
      const sceneHandled =
        pointerDownRef.current?.(makePointerEvent(event, canvas)) === true;
      const mode = sceneHandled ? "scene" : "panning";
      gestureRef.current = {
        pointerId: event.pointerId,
        mode,
        lastCanvas: canvas,
      };
      setInteractionState(mode);
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    },
    [makePointerEvent],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      const canvas = getCanvasPoint(event);
      const delta: Vec2 = [
        canvas[0] - gesture.lastCanvas[0],
        canvas[1] - gesture.lastCanvas[1],
      ];
      gesture.lastCanvas = canvas;

      if (gesture.mode === "scene") {
        pointerMoveRef.current?.(makePointerEvent(event, canvas, delta));
      } else {
        viewport.panByPixels(delta[0], delta[1]);
        notifyViewportChange();
      }
      requestRender();
    },
    [makePointerEvent, notifyViewportChange, requestRender, viewport],
  );

  const endPointerGesture = useCallback(
    (
      event: ReactPointerEvent<HTMLCanvasElement>,
      handler: typeof pointerUpRef | typeof pointerCancelRef,
    ) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      const canvas = getCanvasPoint(event);
      const delta: Vec2 = [
        canvas[0] - gesture.lastCanvas[0],
        canvas[1] - gesture.lastCanvas[1],
      ];
      if (gesture.mode === "scene")
        handler.current?.(makePointerEvent(event, canvas, delta));
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      gestureRef.current = null;
      setInteractionState("idle");
      requestRender();
    },
    [makePointerEvent, requestRender],
  );

  const handleWheel = useCallback(
    (event: ReactWheelEvent<HTMLCanvasElement>) => {
      event.preventDefault();
      const unitScale =
        event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? viewport.height
            : 1;
      const factor = Math.exp(-event.deltaY * unitScale * 0.0015);
      zoomBy(factor, getCanvasPoint(event));
    },
    [viewport.height, zoomBy],
  );

  const handleCanvasKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLCanvasElement>) => {
      const panStep = event.shiftKey ? 8 : 32;
      let handled = true;

      switch (event.key) {
        case "ArrowLeft":
          viewport.panByPixels(panStep, 0);
          break;
        case "ArrowRight":
          viewport.panByPixels(-panStep, 0);
          break;
        case "ArrowUp":
          viewport.panByPixels(0, panStep);
          break;
        case "ArrowDown":
          viewport.panByPixels(0, -panStep);
          break;
        case "+":
        case "=":
          zoomBy(1.25);
          break;
        case "-":
        case "_":
          zoomBy(0.8);
          break;
        case "0":
          resetView();
          break;
        case " ":
          if (timeline.getSnapshot().state === "playing") timeline.pause();
          else if (timeline.getSnapshot().state === "complete")
            timeline.replay();
          else timeline.play();
          break;
        case "Home":
          timeline.seek(0);
          break;
        case "End":
          timeline.seek(1);
          break;
        default:
          handled = false;
      }

      if (!handled) return;
      event.preventDefault();
      if (event.key.startsWith("Arrow")) {
        notifyViewportChange();
        requestRender();
      }
    },
    [
      notifyViewportChange,
      requestRender,
      resetView,
      timeline,
      viewport,
      zoomBy,
    ],
  );

  const exportPng = useCallback(
    async (options: PngExportOptions = {}): Promise<PngExportResult | null> => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      drawNowRef.current();

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (!blob) return null;

      const filename = options.filename ?? exportFilename;
      const result: PngExportResult = {
        blob,
        filename,
        width: canvas.width,
        height: canvas.height,
      };

      if (options.download) triggerDownload(blob, filename);
      onExportRef.current?.(result);
      return result;
    },
    [exportFilename],
  );

  useImperativeHandle(
    forwardedRef,
    () => ({
      play: () => timeline.play(),
      pause: () => timeline.pause(),
      replay: () => timeline.replay(),
      seek: (progress) => timeline.seek(progress),
      setSpeed: (speed) => timeline.setSpeed(speed),
      resetView,
      zoomIn: () => zoomBy(1.25),
      zoomOut: () => zoomBy(0.8),
      requestRender,
      getViewport: () => viewport.snapshot(),
      getTimeline: () => timeline.getSnapshot(),
      exportPng,
    }),
    [exportPng, requestRender, resetView, timeline, viewport, zoomBy],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(
    () =>
      registerStage(canvasRef.current, {
        capture: () => ({
          progress: timeline.getSnapshot().progress,
          speed: timeline.getSnapshot().speed,
          center: [...viewport.center] as [number, number],
          scale: viewport.scale,
        }),
        restore: (view) => {
          timeline.pause();
          if (view.speed) timeline.setSpeed(view.speed);
          if (view.center) viewport.setCenter(view.center);
          if (view.scale) viewport.setScale(view.scale);
          timeline.seek(view.progress);
          requestRender();
        },
      }),
    [timeline, viewport, requestRender],
  );

  useEffect(() => {
    const unsubscribe = timeline.subscribe((snapshot) => {
      const previousState = timelineSnapshotRef.current.state;
      timelineSnapshotRef.current = snapshot;
      if (mountedRef.current) setTimelineSnapshot(snapshot);
      onProgressChangeRef.current?.(snapshot.progress, snapshot.state);
      if (previousState !== snapshot.state)
        onPlaybackStateChangeRef.current?.(snapshot.state);
      drawNowRef.current();
    });

    return () => {
      unsubscribe();
      timeline.pause();
    };
  }, [timeline]);

  useEffect(() => {
    timeline.setDuration(duration);
  }, [duration, timeline]);

  useEffect(() => {
    timeline.setSpeed(initialSpeed);
  }, [initialSpeed, timeline]);

  useEffect(() => {
    if (easing) timeline.setEasing(easing);
  }, [easing, timeline]);

  useEffect(() => {
    const query = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    const update = () => setSystemReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    timeline.setReducedMotion(reducedMotion ?? systemReducedMotion);
  }, [reducedMotion, systemReducedMotion, timeline]);

  useEffect(() => {
    if (autoPlay) {
      if (timeline.getSnapshot().progress >= 1) timeline.replay();
      else timeline.play();
    }
  }, [autoPlay, timeline]);

  useEffect(() => {
    const element = viewportContainerRef.current;
    const canvas = canvasRef.current;
    if (!element || !canvas) return;

    const measure = (width?: number, height?: number) => {
      const bounds = element.getBoundingClientRect();
      const nextWidth = width && width > 0 ? width : bounds.width;
      const nextHeight = height && height > 0 ? height : bounds.height;
      sizeRef.current = resizeCanvas(canvas, nextWidth || 1, nextHeight || 1, {
        maxDevicePixelRatio,
      });
      viewport.resize(sizeRef.current.width, sizeRef.current.height);
      notifyViewportChange();
      requestRender();
    };

    measure();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(([entry]) => {
        if (entry) measure(entry.contentRect.width, entry.contentRect.height);
      });
      observer.observe(element);
      return () => observer.disconnect();
    }

    const handleResize = () => measure();
    globalThis.addEventListener("resize", handleResize);
    return () => globalThis.removeEventListener("resize", handleResize);
  }, [maxDevicePixelRatio, notifyViewportChange, requestRender, viewport]);

  useEffect(() => {
    requestRender();
  }, [background, render, renderKey, requestRender]);

  useEffect(
    () => () => {
      if (pendingDrawRef.current !== null) {
        cancelSingleFrame(pendingDrawRef.current);
        pendingDrawRef.current = null;
      }
      gestureRef.current = null;
    },
    [],
  );

  const playbackState = timelineSnapshot.state;
  const isPlaying = playbackState === "playing";
  const isComplete = playbackState === "complete";
  const publicRenderState =
    renderStatus === "error"
      ? "error"
      : renderStatus === "initializing"
        ? "initializing"
        : isPlaying
          ? "animating"
          : "static";

  const handlePrimaryPlayback = () => {
    if (isPlaying) timeline.pause();
    else if (isComplete) timeline.replay();
    else timeline.play();
  };

  const primaryPlaybackLabel = isPlaying
    ? "暂停"
    : isComplete
      ? "重新播放"
      : "播放";
  const PrimaryPlaybackIcon = isPlaying ? Pause : isComplete ? RotateCcw : Play;

  return (
    <section
      ref={stageRef}
      className={mergeClassName("visualization-stage", className)}
      style={{ ...stageLayout, ...style }}
      data-testid={testId}
      data-render-state={publicRenderState}
      data-playback-state={playbackState}
      data-interaction-state={interactionState}
    >
      <div
        ref={viewportContainerRef}
        className="visualization-stage__viewport"
        style={viewportLayout}
      >
        <canvas
          ref={canvasRef}
          className="visualization-stage__canvas"
          role="img"
          tabIndex={0}
          aria-label={ariaLabel}
          data-testid={`${testId}-canvas`}
          data-render-state={publicRenderState}
          data-playback-state={playbackState}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={(event) => endPointerGesture(event, pointerUpRef)}
          onPointerCancel={(event) =>
            endPointerGesture(event, pointerCancelRef)
          }
          onWheel={handleWheel}
          onKeyDown={handleCanvasKeyDown}
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            touchAction: "none",
            cursor:
              interactionState === "panning"
                ? "grabbing"
                : onPointerDown
                  ? "crosshair"
                  : "grab",
          }}
        >
          {fallbackDescription}
        </canvas>

        {overlay}

        {(showViewControls || showExportButton) && (
          <div
            className="visualization-stage__view-controls"
            role="toolbar"
            aria-label="画布视图"
            style={toolbarLayout}
            data-testid={`${testId}-view-controls`}
          >
            {showViewControls && (
              <>
                <IconButton
                  label="缩小"
                  onClick={() => zoomBy(0.8)}
                  data-testid={`${testId}-zoom-out`}
                >
                  <Minus size={17} aria-hidden="true" />
                </IconButton>
                <IconButton
                  label="放大"
                  onClick={() => zoomBy(1.25)}
                  data-testid={`${testId}-zoom-in`}
                >
                  <Plus size={17} aria-hidden="true" />
                </IconButton>
                <IconButton
                  label="重置视图"
                  onClick={resetView}
                  data-testid={`${testId}-reset-view`}
                >
                  <LocateFixed size={17} aria-hidden="true" />
                </IconButton>
              </>
            )}
            {showExportButton && (
              <IconButton
                label="导出 PNG"
                onClick={() =>
                  void exportPng({
                    filename: exportFilename,
                    download: downloadOnExport,
                  })
                }
                data-testid={`${testId}-export`}
              >
                <Download size={17} aria-hidden="true" />
              </IconButton>
            )}
          </div>
        )}
      </div>

      {showControls && (
        <div
          className="visualization-stage__transport"
          role="group"
          aria-label="动画时间轴"
          style={transportLayout}
          data-testid={`${testId}-controls`}
        >
          <div
            className="visualization-stage__transport-buttons"
            style={{ display: "flex" }}
          >
            <IconButton
              label="回到起点"
              onClick={() => timeline.seek(0)}
              disabled={timelineSnapshot.progress <= 0}
              data-testid={`${testId}-rewind`}
            >
              <SkipBack size={17} aria-hidden="true" />
            </IconButton>
            <IconButton
              label={primaryPlaybackLabel}
              onClick={handlePrimaryPlayback}
              data-testid={`${testId}-playback`}
            >
              <PrimaryPlaybackIcon size={17} aria-hidden="true" />
            </IconButton>
          </div>

          <input
            className="visualization-stage__scrubber"
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={timelineSnapshot.progress}
            aria-label="动画进度"
            aria-valuetext={`${Math.round(timelineSnapshot.progress * 100)}%`}
            data-testid={`${testId}-scrubber`}
            style={{ width: "100%", accentColor: "var(--red)" }}
            onPointerDown={() => {
              resumeAfterScrubRef.current =
                timeline.getSnapshot().state === "playing";
              timeline.pause();
            }}
            onChange={(event) =>
              timeline.seek(Number(event.currentTarget.value))
            }
            onPointerUp={() => {
              if (
                resumeAfterScrubRef.current &&
                timeline.getSnapshot().progress < 1
              ) {
                timeline.play();
              }
              resumeAfterScrubRef.current = false;
            }}
          />

          <output
            className="visualization-stage__progress"
            aria-live="off"
            style={{
              minWidth: "4ch",
              color: "var(--ink-soft)",
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 11,
              textAlign: "right",
            }}
          >
            {Math.round(timelineSnapshot.progress * 100)}%
          </output>

          <label
            className="visualization-stage__speed"
            style={{ display: "flex", gap: 5 }}
          >
            <span className="sr-only">播放速度</span>
            <select
              value={timelineSnapshot.speed}
              aria-label="播放速度"
              data-testid={`${testId}-speed`}
              onChange={(event) =>
                timeline.setSpeed(Number(event.currentTarget.value))
              }
              style={{
                height: 32,
                border: "1px solid var(--line)",
                borderRadius: 3,
                color: "var(--ink)",
                background: "var(--paper)",
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 11,
              }}
            >
              {SPEEDS.map((speed) => (
                <option key={speed} value={speed}>
                  {speed}×
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </section>
  );
});

VisualizationStage.displayName = "VisualizationStage";
