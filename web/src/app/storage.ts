// Settings kept in localStorage. Storage can be missing, blocked or full
// (private windows, cleared site data), so every access is guarded and
// the app works without it.

import { useEffect, useState } from 'react';

const PREFIX = 'kerasi-strings:';

export function load(key: string): unknown {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? undefined : (JSON.parse(raw) as unknown);
  } catch {
    return undefined;
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Not kept; the setting lasts until the tab closes
  }
}

export function forget(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // Nothing was stored
  }
}

/** State that survives a reload; a stored value that fails `isValid`
 * (older versions, hand edits) is replaced by `fallback`. */
export function usePersistent<T>(
  key: string,
  fallback: T,
  isValid: (value: unknown) => value is T,
): [T, (value: T | ((previous: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    const stored = load(key);
    return isValid(stored) ? stored : fallback;
  });
  useEffect(() => {
    save(key, value);
  }, [key, value]);
  return [value, setValue];
}

export function isOneOf<T extends string>(values: readonly T[]) {
  return (value: unknown): value is T =>
    typeof value === 'string' && (values as readonly string[]).includes(value);
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}
