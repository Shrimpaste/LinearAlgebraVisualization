export type EasingFunction = (progress: number) => number;

export const linear: EasingFunction = (progress) => progress;

export const easeInOutCubic: EasingFunction = (progress) =>
  progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 3) / 2;

export const easeOutCubic: EasingFunction = (progress) =>
  1 - Math.pow(1 - progress, 3);
