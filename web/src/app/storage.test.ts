import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  forget,
  isBoolean,
  isOneOf,
  load,
  save,
  usePersistent,
} from './storage';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('storage', () => {
  it('keeps JSON values under the app prefix', () => {
    save('mode', 'recipe');
    expect(localStorage.getItem('kerasi-strings:mode')).toBe('"recipe"');
    expect(load('mode')).toBe('recipe');
    forget('mode');
    expect(load('mode')).toBeUndefined();
  });

  it('works on when storage throws', () => {
    const broken = () => {
      throw new Error('blocked');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(broken);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(broken);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(broken);
    expect(() => {
      save('x', 1);
      forget('x');
    }).not.toThrow();
    expect(load('x')).toBeUndefined();
  });

  it('reads unparsable values as missing', () => {
    localStorage.setItem('kerasi-strings:x', '{');
    expect(load('x')).toBeUndefined();
  });

  it('restores valid values and replaces invalid ones', () => {
    save('flag', true);
    const kept = renderHook(() => usePersistent('flag', false, isBoolean));
    expect(kept.result.current[0]).toBe(true);

    save('flag', 'yes');
    const reset = renderHook(() => usePersistent('flag', false, isBoolean));
    expect(reset.result.current[0]).toBe(false);
  });

  it('saves every change', () => {
    const isMode = isOneOf(['a', 'b'] as const);
    const { result } = renderHook(() => usePersistent('mode', 'a', isMode));
    act(() => {
      result.current[1]('b');
    });
    expect(load('mode')).toBe('b');
    expect(isMode('c')).toBe(false);
    expect(isMode(1)).toBe(false);
  });
});
