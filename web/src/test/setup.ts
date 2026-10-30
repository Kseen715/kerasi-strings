// Browser APIs jsdom leaves out, as the tests need them.

import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

// No media query matches unless a test says so
vi.stubGlobal(
  'matchMedia',
  vi.fn((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
);

class NoPerformanceObserver {
  observe(): void {
    // jsdom loads no resources to observe
  }
  disconnect(): void {
    // Nothing to stop
  }
}
vi.stubGlobal('PerformanceObserver', NoPerformanceObserver);

Object.defineProperty(navigator, 'clipboard', {
  configurable: true,
  value: { writeText: vi.fn(() => Promise.resolve()) },
});
