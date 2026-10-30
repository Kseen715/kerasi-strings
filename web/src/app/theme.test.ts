import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { isDark, resolveTheme, useMedia, useTheme } from './theme';

function mediaThatMatches(matches: boolean) {
  const listeners: (() => void)[] = [];
  const list = {
    matches,
    addEventListener: (_: string, listener: () => void) => {
      listeners.push(listener);
    },
    removeEventListener: vi.fn(),
  };
  vi.mocked(matchMedia).mockReturnValue(list as unknown as MediaQueryList);
  return {
    change(next: boolean) {
      list.matches = next;
      listeners.forEach((listener) => {
        listener();
      });
    },
    list,
  };
}

describe('themes', () => {
  it('follow the system until one is chosen', () => {
    expect(resolveTheme('system', false)).toBe('sakura');
    expect(resolveTheme('system', true)).toBe('sakura-dark');
    expect(resolveTheme('wine', true)).toBe('wine');
    expect(isDark('rust-dark')).toBe(true);
    expect(isDark('rust')).toBe(false);
  });

  it('put the theme in use on <html>', () => {
    mediaThatMatches(true);
    const { result } = renderHook(() => useTheme('system'));
    expect(result.current).toBe('sakura-dark');
    expect(document.documentElement.dataset.theme).toBe('sakura-dark');
  });

  it('follow media query changes and stop listening on unmount', () => {
    const media = mediaThatMatches(false);
    const { result, unmount } = renderHook(() => useMedia('(x)'));
    expect(result.current).toBe(false);
    act(() => {
      media.change(true);
    });
    expect(result.current).toBe(true);
    unmount();
    expect(media.list.removeEventListener).toHaveBeenCalled();
  });
});
