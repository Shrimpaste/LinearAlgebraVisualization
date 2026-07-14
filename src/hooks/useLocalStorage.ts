import { useCallback, useEffect, useState } from "react";

export type LocalStorageMigration<T> = (stored: unknown) => T;

export function useLocalStorage<T>(
  key: string,
  initialValue: T,
  migrate?: LocalStorageMigration<T>,
) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored === null) return initialValue;
      const parsed: unknown = JSON.parse(stored);
      return migrate ? migrate(parsed) : (parsed as T);
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    window.localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  const reset = useCallback(() => setValue(initialValue), [initialValue]);

  return [value, setValue, reset] as const;
}
