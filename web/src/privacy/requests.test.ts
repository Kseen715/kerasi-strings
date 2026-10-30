import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isRemote, useRequestCounts } from './requests';

type Callback = (list: { getEntries: () => { name: string }[] }) => void;

let observed: Callback | undefined;

class RecordingObserver {
  constructor(callback: Callback) {
    observed = callback;
  }
  observe = vi.fn();
  disconnect = vi.fn();
}

afterEach(() => {
  observed = undefined;
});

describe('request counter', () => {
  it('tells remote requests from local ones', () => {
    const origin = 'https://me.test';
    expect(isRemote('https://me.test/a.wasm', origin)).toBe(false);
    expect(isRemote('/relative.js', origin)).toBe(false);
    expect(isRemote('https://cdn.test/x.js', origin)).toBe(true);
    expect(isRemote('wss://other.test/socket', origin)).toBe(true);
    expect(isRemote('data:image/png;base64,AA', origin)).toBe(false);
    expect(isRemote('blob:https://me.test/1', origin)).toBe(false);
  });

  it('counts loaded resources by origin and blocked requests', () => {
    vi.stubGlobal('PerformanceObserver', RecordingObserver);
    const { result, unmount } = renderHook(() => useRequestCounts());
    act(() => {
      observed?.({
        getEntries: () => [
          { name: `${location.origin}/app.js` },
          { name: 'https://elsewhere.test/font.woff2' },
        ],
      });
      document.dispatchEvent(new Event('securitypolicyviolation'));
    });
    expect(result.current).toEqual({ local: 1, remote: 1, blocked: 1 });
    unmount();
  });
});
