// Fails when the gzipped WebAssembly or JavaScript of the build outgrows
// its budget (PLAN.md §5). Usage: node scripts/budget.ts [dist]

import { readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { gzipSync } from 'node:zlib';

const KB = 1024;

export const BUDGETS: Record<string, number> = {
  '.wasm': 150 * KB,
  '.js': 120 * KB,
};

/** Gzipped bytes per budgeted extension of the files in `dir`. */
export function measure(dir: string): Record<string, number> {
  const sizes: Record<string, number> = {};
  for (const file of readdirSync(dir)) {
    const ext = extname(file);
    if (ext in BUDGETS) {
      const gzipped = gzipSync(readFileSync(join(dir, file))).length;
      sizes[ext] = (sizes[ext] ?? 0) + gzipped;
    }
  }
  return sizes;
}

export function report(sizes: Record<string, number>): {
  lines: string[];
  over: boolean;
} {
  const lines = Object.entries(BUDGETS).map(([ext, budget]) => {
    const size = sizes[ext] ?? 0;
    const verdict = size > budget ? 'OVER' : 'ok';
    const shown = (size / KB).toFixed(1);
    return `${ext} ${shown} KB of ${budget / KB} KB ${verdict}`;
  });
  const over = Object.entries(BUDGETS).some(
    ([ext, budget]) => (sizes[ext] ?? 0) > budget,
  );
  return { lines, over };
}

if (import.meta.main) {
  const { lines, over } = report(
    measure(join(process.argv[2] ?? 'dist', 'assets')),
  );
  console.log(lines.join('\n'));
  process.exitCode = over ? 1 : 0;
}
