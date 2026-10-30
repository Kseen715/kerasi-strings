import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUDGETS, measure, report } from './budget';

describe('budget', () => {
  it('sums gzipped sizes per budgeted extension', () => {
    const dir = mkdtempSync(join(tmpdir(), 'budget-'));
    writeFileSync(join(dir, 'a.js'), 'x'.repeat(1000));
    writeFileSync(join(dir, 'b.js'), 'y'.repeat(1000));
    writeFileSync(join(dir, 'c.css'), 'z');
    const sizes = measure(dir);
    expect(Object.keys(sizes)).toEqual(['.js']);
    expect(sizes['.js']).toBeGreaterThan(20);
    expect(sizes['.js']).toBeLessThan(200);
  });

  it('flags any extension over its budget', () => {
    const ok = report({ '.js': 1024 });
    expect(ok.over).toBe(false);
    expect(ok.lines).toEqual([
      '.wasm 0.0 KB of 150 KB ok',
      '.js 1.0 KB of 120 KB ok',
    ]);
    const over = report({ '.wasm': (BUDGETS['.wasm'] ?? 0) + 1 });
    expect(over.over).toBe(true);
    expect(over.lines[0]).toMatch(/OVER$/);
  });
});
