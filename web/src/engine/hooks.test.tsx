import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDebounced, useLatest } from './hooks';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe('useLatest', () => {
  it('is idle without a task', () => {
    const { result } = renderHook(() => useLatest(undefined));
    expect(result.current).toEqual({
      value: undefined,
      error: undefined,
      pending: false,
    });
  });

  it('is pending until the task answers, then keeps the value', async () => {
    const answer = deferred<number | null>();
    const task = () => answer.promise;
    const { result } = renderHook(() => useLatest(task));
    expect(result.current.pending).toBe(true);

    await act(async () => {
      answer.resolve(42);
      await answer.promise;
    });
    expect(result.current).toMatchObject({ value: 42, pending: false });
  });

  it('keeps the last value while a superseded task answers null', async () => {
    const first: () => Promise<number | null> = () => Promise.resolve(1);
    const { result, rerender } = renderHook(({ task }) => useLatest(task), {
      initialProps: { task: first },
    });
    await act(() => Promise.resolve());
    expect(result.current.value).toBe(1);

    const stale = () => Promise.resolve(null);
    rerender({ task: stale });
    await act(() => Promise.resolve());
    expect(result.current).toMatchObject({ value: 1, pending: true });
  });

  it('reports errors of the current task only', async () => {
    const failing: () => Promise<number | null> = () =>
      Promise.reject(new Error('boom'));
    const { result, rerender } = renderHook(({ task }) => useLatest(task), {
      initialProps: { task: failing },
    });
    await act(() => Promise.resolve());
    expect(result.current).toMatchObject({ error: 'boom', pending: false });

    const next = deferred<number | null>();
    rerender({ task: () => next.promise });
    expect(result.current.error).toBeUndefined();
  });

  it('names failures that are not errors', async () => {
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    const failing = () => Promise.reject('not an Error');
    const { result } = renderHook(() => useLatest(failing));
    await act(() => Promise.resolve());
    expect(result.current.error).toBe('Failed');
  });

  it('drops answers after unmounting', async () => {
    const answer = deferred<number | null>();
    const task = () => answer.promise;
    const { result, unmount } = renderHook(() => useLatest(task));
    unmount();
    await act(async () => {
      answer.resolve(1);
      await answer.promise;
    });
    expect(result.current.value).toBeUndefined();
  });

  it('drops a failure after unmounting', async () => {
    const answer = deferred<number | null>();
    const task = () => answer.promise;
    const { result, unmount } = renderHook(() => useLatest(task));
    unmount();
    await act(async () => {
      answer.reject(new Error('late'));
      await answer.promise.catch(() => undefined);
    });
    expect(result.current.error).toBeUndefined();
  });
});

describe('useDebounced', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes a value on after the delay', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ value }) => useDebounced(value, 60),
      { initialProps: { value: 'a' } },
    );
    rerender({ value: 'ab' });
    expect(result.current).toBe('a');
    act(() => {
      vi.advanceTimersByTime(60);
    });
    expect(result.current).toBe('ab');
  });
});
