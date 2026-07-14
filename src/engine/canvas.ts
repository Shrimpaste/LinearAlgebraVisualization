export interface CanvasSize {
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
}

export interface ResizeCanvasOptions {
  maxDevicePixelRatio?: number;
  devicePixelRatio?: number;
}

/** Keeps canvas backing pixels aligned with its CSS box without changing layout. */
export function resizeCanvas(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  options: ResizeCanvasOptions = {},
): CanvasSize {
  const maxDpr = Math.max(1, options.maxDevicePixelRatio ?? 2);
  const sourceDpr =
    options.devicePixelRatio ?? globalThis.devicePixelRatio ?? 1;
  const dpr = Math.min(maxDpr, Math.max(1, sourceDpr));
  const cssWidth = Math.max(1, width);
  const cssHeight = Math.max(1, height);
  const pixelWidth = Math.max(1, Math.round(cssWidth * dpr));
  const pixelHeight = Math.max(1, Math.round(cssHeight * dpr));

  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;

  return { width: cssWidth, height: cssHeight, dpr, pixelWidth, pixelHeight };
}

/** Resets any previous scene transform and establishes CSS-pixel drawing units. */
export function prepareCanvasContext(
  context: CanvasRenderingContext2D,
  size: CanvasSize,
  background?: string,
) {
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, size.pixelWidth, size.pixelHeight);
  context.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);

  if (background) {
    context.fillStyle = background;
    context.fillRect(0, 0, size.width, size.height);
  }
}
