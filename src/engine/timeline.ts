import { easeInOutCubic, type EasingFunction } from "./easing";

export type PlaybackState = "idle" | "playing" | "paused" | "complete";

export interface TimelineSnapshot {
  readonly progress: number;
  readonly easedProgress: number;
  readonly state: PlaybackState;
  readonly speed: number;
  readonly duration: number;
  readonly reducedMotion: boolean;
}

export interface FrameScheduler {
  now(): number;
  request(callback: FrameRequestCallback): number;
  cancel(handle: number): void;
}

export interface AnimationTimelineOptions {
  duration?: number;
  initialProgress?: number;
  speed?: number;
  reducedMotion?: boolean;
  easing?: EasingFunction;
  scheduler?: FrameScheduler;
}

export type TimelineListener = (snapshot: TimelineSnapshot) => void;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const defaultScheduler: FrameScheduler = {
  now: () => globalThis.performance?.now() ?? Date.now(),
  request: (callback) => {
    if (typeof globalThis.requestAnimationFrame === "function") {
      return globalThis.requestAnimationFrame(callback);
    }

    return globalThis.setTimeout(
      () => callback(defaultScheduler.now()),
      16,
    ) as unknown as number;
  },
  cancel: (handle) => {
    if (typeof globalThis.cancelAnimationFrame === "function") {
      globalThis.cancelAnimationFrame(handle);
    } else {
      globalThis.clearTimeout(handle);
    }
  },
};

/** A deterministic, progress-based timeline that schedules frames only while playing. */
export class AnimationTimeline {
  private progressValue: number;
  private stateValue: PlaybackState;
  private durationValue: number;
  private speedValue: number;
  private reducedMotionValue: boolean;
  private easingValue: EasingFunction;
  private readonly scheduler: FrameScheduler;
  private readonly listeners = new Set<TimelineListener>();
  private frameHandle: number | null = null;
  private anchorTime = 0;
  private anchorProgress = 0;
  private disposed = false;

  constructor(options: AnimationTimelineOptions = {}) {
    this.durationValue = Math.max(1, options.duration ?? 900);
    this.progressValue = clamp01(options.initialProgress ?? 1);
    this.speedValue = Math.max(0.01, options.speed ?? 1);
    this.reducedMotionValue = options.reducedMotion ?? false;
    this.easingValue = options.easing ?? easeInOutCubic;
    this.scheduler = options.scheduler ?? defaultScheduler;
    this.stateValue = this.stateForProgress(this.progressValue);
  }

  getSnapshot(): TimelineSnapshot {
    return {
      progress: this.progressValue,
      easedProgress: this.easingValue(this.progressValue),
      state: this.stateValue,
      speed: this.speedValue,
      duration: this.durationValue,
      reducedMotion: this.reducedMotionValue,
    };
  }

  subscribe(listener: TimelineListener, emitImmediately = false) {
    this.listeners.add(listener);
    if (emitImmediately) listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  play() {
    if (
      this.disposed ||
      this.stateValue === "playing" ||
      this.progressValue >= 1
    )
      return;

    if (this.reducedMotionValue) {
      this.finish();
      return;
    }

    this.anchorProgress = this.progressValue;
    this.anchorTime = this.scheduler.now();
    this.stateValue = "playing";
    this.emit();
    this.scheduleFrame();
  }

  pause() {
    if (this.disposed || this.stateValue !== "playing") return;

    this.updateProgress(this.scheduler.now());
    this.cancelFrame();
    this.stateValue = this.progressValue >= 1 ? "complete" : "paused";
    this.emit();
  }

  replay() {
    if (this.disposed) return;
    this.cancelFrame();

    if (this.reducedMotionValue) {
      this.progressValue = 1;
      this.stateValue = "complete";
      this.emit();
      return;
    }

    this.progressValue = 0;
    this.anchorProgress = 0;
    this.anchorTime = this.scheduler.now();
    this.stateValue = "playing";
    this.emit();
    this.scheduleFrame();
  }

  seek(progress: number, preservePlayback = false) {
    if (this.disposed) return;
    const wasPlaying = this.stateValue === "playing";
    this.cancelFrame();
    this.progressValue = clamp01(progress);
    this.stateValue = this.stateForProgress(this.progressValue);

    if (
      preservePlayback &&
      wasPlaying &&
      this.progressValue < 1 &&
      !this.reducedMotionValue
    ) {
      this.anchorProgress = this.progressValue;
      this.anchorTime = this.scheduler.now();
      this.stateValue = "playing";
    }

    this.emit();
    if (this.stateValue === "playing") this.scheduleFrame();
  }

  setSpeed(speed: number) {
    if (this.disposed || !(speed > 0) || speed === this.speedValue) return;
    const wasPlaying = this.stateValue === "playing";

    if (wasPlaying) this.updateProgress(this.scheduler.now());
    this.cancelFrame();
    this.speedValue = speed;

    if (wasPlaying && this.progressValue < 1) {
      this.anchorProgress = this.progressValue;
      this.anchorTime = this.scheduler.now();
      this.stateValue = "playing";
      this.scheduleFrame();
    } else if (this.progressValue >= 1) {
      this.stateValue = "complete";
    }

    this.emit();
  }

  setDuration(duration: number) {
    if (this.disposed || !(duration > 0) || duration === this.durationValue)
      return;
    const wasPlaying = this.stateValue === "playing";

    if (wasPlaying) this.updateProgress(this.scheduler.now());
    this.cancelFrame();
    this.durationValue = duration;

    if (wasPlaying && this.progressValue < 1) {
      this.anchorProgress = this.progressValue;
      this.anchorTime = this.scheduler.now();
      this.stateValue = "playing";
      this.scheduleFrame();
    } else if (this.progressValue >= 1) {
      this.stateValue = "complete";
    }

    this.emit();
  }

  setEasing(easing: EasingFunction) {
    if (this.disposed || easing === this.easingValue) return;
    this.easingValue = easing;
    this.emit();
  }

  setReducedMotion(reducedMotion: boolean) {
    if (this.disposed || reducedMotion === this.reducedMotionValue) return;
    this.reducedMotionValue = reducedMotion;
    if (reducedMotion && this.stateValue === "playing") {
      this.finish();
    } else {
      this.emit();
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelFrame();
    this.listeners.clear();
  }

  private readonly tick: FrameRequestCallback = (timestamp) => {
    this.frameHandle = null;
    if (this.disposed || this.stateValue !== "playing") return;

    this.updateProgress(timestamp);
    if (this.progressValue >= 1) {
      this.stateValue = "complete";
    }

    this.emit();
    if (this.stateValue === "playing") this.scheduleFrame();
  };

  private updateProgress(timestamp: number) {
    const elapsed = Math.max(0, timestamp - this.anchorTime);
    this.progressValue = clamp01(
      this.anchorProgress + (elapsed * this.speedValue) / this.durationValue,
    );
  }

  private finish() {
    this.cancelFrame();
    this.progressValue = 1;
    this.stateValue = "complete";
    this.emit();
  }

  private stateForProgress(progress: number): PlaybackState {
    if (progress <= 0) return "idle";
    if (progress >= 1) return "complete";
    return "paused";
  }

  private scheduleFrame() {
    if (this.frameHandle === null && !this.disposed) {
      this.frameHandle = this.scheduler.request(this.tick);
    }
  }

  private cancelFrame() {
    if (this.frameHandle === null) return;
    this.scheduler.cancel(this.frameHandle);
    this.frameHandle = null;
  }

  private emit() {
    const snapshot = this.getSnapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}
