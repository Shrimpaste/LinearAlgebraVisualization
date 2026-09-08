export interface StateController {
  read(): unknown;
  restore(value: unknown): void;
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
}
export const stateControllers = new Map<string, StateController>();
const listeners = new Set<() => void>();
let revision = 0;
export function notifyState() {
  revision++;
  listeners.forEach((listener) => listener());
}
export const subscribeState = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const stateRevision = () => revision;
