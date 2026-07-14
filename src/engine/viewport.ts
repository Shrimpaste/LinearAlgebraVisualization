import type { Vec2 } from "../math/types";

export interface ViewportOptions {
  center?: Vec2;
  scale?: number;
  minScale?: number;
  maxScale?: number;
}

export interface ViewportSnapshot {
  readonly width: number;
  readonly height: number;
  readonly center: Readonly<Vec2>;
  readonly scale: number;
  readonly minScale: number;
  readonly maxScale: number;
}

const DEFAULT_CENTER: Vec2 = [0, 0];
const DEFAULT_SCALE = 64;
const DEFAULT_MIN_SCALE = 12;
const DEFAULT_MAX_SCALE = 512;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function copyPoint(point: Readonly<Vec2>): Vec2 {
  return [point[0], point[1]];
}

/**
 * A mutable 2D camera whose dimensions and scale are expressed in CSS pixels.
 * World space uses the mathematical convention: +x right and +y up.
 */
export class Viewport2D {
  private widthValue = 1;
  private heightValue = 1;
  private centerValue: Vec2;
  private scaleValue: number;
  private readonly defaultCenter: Vec2;
  private readonly defaultScale: number;

  readonly minScale: number;
  readonly maxScale: number;

  constructor(options: ViewportOptions = {}) {
    const minScale = options.minScale ?? DEFAULT_MIN_SCALE;
    const maxScale = options.maxScale ?? DEFAULT_MAX_SCALE;

    if (!(minScale > 0) || !(maxScale >= minScale)) {
      throw new RangeError(
        "Viewport scale bounds must satisfy 0 < minScale <= maxScale.",
      );
    }

    this.minScale = minScale;
    this.maxScale = maxScale;
    this.defaultCenter = copyPoint(options.center ?? DEFAULT_CENTER);
    this.defaultScale = clamp(
      options.scale ?? DEFAULT_SCALE,
      minScale,
      maxScale,
    );
    this.centerValue = copyPoint(this.defaultCenter);
    this.scaleValue = this.defaultScale;
  }

  get width() {
    return this.widthValue;
  }

  get height() {
    return this.heightValue;
  }

  get center(): Readonly<Vec2> {
    return this.centerValue;
  }

  get scale() {
    return this.scaleValue;
  }

  resize(width: number, height: number) {
    this.widthValue = Math.max(1, width);
    this.heightValue = Math.max(1, height);
    return this;
  }

  setCenter(center: Readonly<Vec2>) {
    this.centerValue = copyPoint(center);
    return this;
  }

  setScale(scale: number) {
    this.scaleValue = clamp(scale, this.minScale, this.maxScale);
    return this;
  }

  worldToCanvas(point: Readonly<Vec2>): Vec2 {
    return [
      this.widthValue / 2 + (point[0] - this.centerValue[0]) * this.scaleValue,
      this.heightValue / 2 - (point[1] - this.centerValue[1]) * this.scaleValue,
    ];
  }

  canvasToWorld(point: Readonly<Vec2>): Vec2 {
    return [
      this.centerValue[0] + (point[0] - this.widthValue / 2) / this.scaleValue,
      this.centerValue[1] - (point[1] - this.heightValue / 2) / this.scaleValue,
    ];
  }

  /** Moves the rendered world by the supplied screen-space delta. */
  panByPixels(deltaX: number, deltaY: number) {
    this.centerValue = [
      this.centerValue[0] - deltaX / this.scaleValue,
      this.centerValue[1] + deltaY / this.scaleValue,
    ];
    return this;
  }

  /** Zooms around a canvas-space anchor so the world point under it stays fixed. */
  zoomAt(factor: number, anchor: Readonly<Vec2>) {
    if (!(factor > 0)) return this;

    const before = this.canvasToWorld(anchor);
    this.scaleValue = clamp(
      this.scaleValue * factor,
      this.minScale,
      this.maxScale,
    );
    const after = this.canvasToWorld(anchor);
    this.centerValue = [
      this.centerValue[0] + before[0] - after[0],
      this.centerValue[1] + before[1] - after[1],
    ];
    return this;
  }

  reset() {
    this.centerValue = copyPoint(this.defaultCenter);
    this.scaleValue = this.defaultScale;
    return this;
  }

  snapshot(): ViewportSnapshot {
    return {
      width: this.widthValue,
      height: this.heightValue,
      center: copyPoint(this.centerValue),
      scale: this.scaleValue,
      minScale: this.minScale,
      maxScale: this.maxScale,
    };
  }
}
