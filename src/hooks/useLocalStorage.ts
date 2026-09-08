import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type SetStateAction,
} from "react";
import { stateControllers, notifyState } from "../app/stateBridge";

export type LocalStorageMigration<T> = (stored: unknown) => T;

export function useLocalStorage<T>(
  key: string,
  initialValue: T,
  migrate?: LocalStorageMigration<T>,
) {
  const [value, setValueInternal] = useState<T>(() => {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored === null) return initialValue;
      const parsed: unknown = JSON.parse(stored);
      return migrate ? migrate(parsed) : (parsed as T);
    } catch {
      return initialValue;
    }
  });
  const current = useRef(value);
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const lastEdit = useRef(0);
  const setValue = useCallback((action: SetStateAction<T>) => {
    const next =
      typeof action === "function"
        ? (action as (previous: T) => T)(current.current)
        : action;
    if (JSON.stringify(next) === JSON.stringify(current.current)) return;
    const now = Date.now();
    if (now - lastEdit.current > 400 || past.current.length === 0)
      past.current = [...past.current.slice(-49), current.current];
    lastEdit.current = now;
    future.current = [];
    current.current = next;
    setValueInternal(next);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* Keep the experiment usable when storage is unavailable. */
    }
    notifyState();
  }, [key, value]);

  useEffect(() => {
    const controller = {
      read: () => current.current,
      restore: (next: unknown) => {
        lastEdit.current = 0;
        setValue(migrate ? migrate(next) : (next as T));
      },
      canUndo: () => past.current.length > 0,
      canRedo: () => future.current.length > 0,
      undo: () => {
        if (!past.current.length) return;
        future.current.push(current.current);
        const previous = past.current.pop()!;
        current.current = previous;
        lastEdit.current = 0;
        setValueInternal(previous);
      },
      redo: () => {
        if (!future.current.length) return;
        past.current.push(current.current);
        const next = future.current.pop()!;
        current.current = next;
        lastEdit.current = 0;
        setValueInternal(next);
      },
    };
    stateControllers.set(key, controller);
    notifyState();
    return () => {
      if (stateControllers.get(key) === controller)
        stateControllers.delete(key);
      notifyState();
    };
  }, [key, migrate, setValue]);

  const reset = useCallback(
    () => setValue(initialValue),
    [initialValue, setValue],
  );

  return [value, setValue, reset] as const;
}
