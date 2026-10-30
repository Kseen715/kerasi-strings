// React hooks over the engine client: the latest result of a task, and
// typing debounced into it.

import { useEffect, useState } from 'react';

export interface Latest<T> {
  value: T | undefined;
  error: string | undefined;
  /** A task was started and has not answered yet */
  pending: boolean;
}

interface Settled<T> {
  task: unknown;
  value: T | undefined;
  error: string | undefined;
}

/** Runs `task` whenever it changes (memoize it) and keeps the last result
 * that was not superseded; tasks resolve to `null` when they are. */
export function useLatest<T>(
  task: (() => Promise<T | null>) | undefined,
): Latest<T> {
  const [settled, setSettled] = useState<Settled<T>>({
    task: undefined,
    value: undefined,
    error: undefined,
  });

  useEffect(() => {
    if (!task) {
      return;
    }
    let live = true;
    task().then(
      (value) => {
        if (live && value !== null) {
          setSettled({ task, value, error: undefined });
        }
      },
      (error: unknown) => {
        if (live) {
          const message = error instanceof Error ? error.message : 'Failed';
          setSettled((last) => ({ ...last, task, error: message }));
        }
      },
    );
    return () => {
      live = false;
    };
  }, [task]);

  return {
    value: settled.value,
    error: settled.task === task ? settled.error : undefined,
    pending: task !== undefined && settled.task !== task,
  };
}

export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, ms);
    return () => {
      clearTimeout(timer);
    };
  }, [value, ms]);
  return debounced;
}
