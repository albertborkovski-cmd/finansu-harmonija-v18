import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

function resolveInitialValue<T>(initialValue: T | (() => T)): T {
  return typeof initialValue === 'function' ? (initialValue as () => T)() : initialValue;
}

export function usePersistentState<T>(
  storageKey: string,
  initialValue: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    const fallback = resolveInitialValue(initialValue);
    if (typeof window === 'undefined') return fallback;

    try {
      const stored = window.localStorage.getItem(storageKey);
      return stored === null ? fallback : JSON.parse(stored) as T;
    } catch {
      return fallback;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(value));
      window.dispatchEvent(
        new CustomEvent('finansu-harmonija:persistent-state-changed', {
          detail: { storageKey },
        }),
      );
    } catch {
      // The UI remains usable if browser storage is unavailable or full.
    }
  }, [storageKey, value]);

  return [value, setValue];
}
