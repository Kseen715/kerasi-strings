import { describe, expect, it } from 'vitest';
import { byteLength, describeText, formatBytes, formatMs } from './format';

describe('format', () => {
  it('formats sizes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1023)).toBe('1023 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(200 * 1024)).toBe('200 KB');
    expect(formatBytes(12.34 * 1024 * 1024)).toBe('12.3 MB');
    expect(formatBytes(5 * 1024 ** 4)).toBe('5120 GB');
  });

  it('counts characters as code points and bytes as UTF-8', () => {
    expect(byteLength('ß')).toBe(2);
    expect(describeText('a')).toBe('1 char · 1 byte · UTF-8');
    expect(describeText('привет 👋')).toBe('8 chars · 17 bytes · UTF-8');
  });

  it('formats step times', () => {
    expect(formatMs(0.04)).toBe('<0.1 ms');
    expect(formatMs(2.345)).toBe('2.3 ms');
  });
});
