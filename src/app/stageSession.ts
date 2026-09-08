export interface StageView {
  progress: number;
  speed?: number;
  center?: readonly [number, number];
  scale?: number;
  camera?: readonly number[];
  target?: readonly number[];
}
interface StageAdapter {
  capture(): StageView;
  restore(view: StageView): void;
}
export const stageSessions = new Map<string, StageAdapter>();
const pending = new Map<string, StageView>();
export function queueStageView(scene: string, view?: StageView) {
  if (view) pending.set(scene, view);
  else pending.delete(scene);
}
export function registerStage(
  element: HTMLElement | null,
  adapter: StageAdapter,
) {
  const scene = element?.closest<HTMLElement>("[data-module]")?.dataset.module;
  if (!scene) return () => undefined;
  stageSessions.set(scene, adapter);
  queueMicrotask(() => {
    if (stageSessions.get(scene) !== adapter) return;
    const view = pending.get(scene);
    if (view) {
      pending.delete(scene);
      adapter.restore(view);
    }
  });
  return () => {
    if (stageSessions.get(scene) === adapter) stageSessions.delete(scene);
  };
}
