// Sizes and counts shown next to the input and output.

const UNITS = ['B', 'KB', 'MB', 'GB'] as const;

export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  return `${value.toFixed(digits)} ${UNITS[unit] ?? 'B'}`;
}

export function formatMs(ms: number): string {
  return ms < 0.1 ? '<0.1 ms' : `${ms.toFixed(1)} ms`;
}

export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** "23 chars · 23 bytes" with characters counted as code points. */
export function describeText(text: string): string {
  const chars = Array.from(text).length;
  const bytes = byteLength(text);
  return `${chars} ${chars === 1 ? 'char' : 'chars'} · ${bytes} ${
    bytes === 1 ? 'byte' : 'bytes'
  } · UTF-8`;
}
