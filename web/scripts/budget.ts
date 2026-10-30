// Fails when the gzipped WebAssembly or JavaScript of the build outgrows
// its budget (PLAN.md §5). The engine with the Unicode name table loads
// only when a decode meets `\N{...}`, so it has a budget of its own
// instead of counting towards the first load. Usage:
// node scripts/budget.ts [dist]

import { readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { gzipSync } from 'node:zlib';

const KB = 1024;

const ON_DEMAND = 'strings_wasm_names';

export const BUDGETS: Record<string, number> = {
  '.wasm': 150 * KB,
  '.js': 120 * KB,
  names: 600 * KB,
};

function budgetOf(file: string): string {
  return file.startsWith(ON_DEMAND) ? 'names' : extname(file);
}

/** Gzipped bytes per budget of the files in `dir`. */
export function measure(dir: string): Record<string, number> {
  const sizes: Record<string, number> = {};
  for (const file of readdirSync(dir)) {
    const budget = budgetOf(file);
    if (budget in BUDGETS) {
      const gzipped = gzipSync(readFileSync(join(dir, file))).length;
      sizes[budget] = (sizes[budget] ?? 0) + gzipped;
    }
  }
  return sizes;
}

export function report(sizes: Record<string, number>): {
  lines: string[];
  over: boolean;
} {
  const lines = Object.entries(BUDGETS).map(([name, budget]) => {
    const size = sizes[name] ?? 0;
    const verdict = size > budget ? 'OVER' : 'ok';
    const shown = (size / KB).toFixed(1);
    return `${name} ${shown} KB of ${budget / KB} KB ${verdict}`;
  });
  const over = Object.entries(BUDGETS).some(
    ([name, budget]) => (sizes[name] ?? 0) > budget,
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
