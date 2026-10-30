// Adds one suite's test coverage to the README badge.
// Usage: node scripts/coverage-badge.ts BADGES_DIR SUITE LCOV_FILE
//
// CI runs it after each suite (rust, web) in a checkout of the "badges"
// branch. It keeps the suite's covered and coverable lines in
// BADGES_DIR/suites/SUITE.json and writes BADGES_DIR/coverage.json, the
// shields.io endpoint the badge reads, from the sum of all suites there.
// A suite that did not run counts with its last numbers.

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** The lowest percentage for each colour, from the top; shields.io names */
const COLORS: [number, string][] = [
  [90, 'brightgreen'],
  [75, 'green'],
  [60, 'yellowgreen'],
  [40, 'yellow'],
  [20, 'orange'],
  [0, 'red'],
];

export interface Lines {
  hit: number;
  found: number;
}

export interface Badge {
  schemaVersion: 1;
  label: 'coverage';
  message: string;
  color: string;
}

/** The covered and coverable lines of every file in an lcov report. */
export function lcovLines(lcov: string): Lines {
  let hit = 0;
  let found = 0;
  for (const line of lcov.split('\n')) {
    if (line.startsWith('LH:')) hit += Number(line.slice(3));
    if (line.startsWith('LF:')) found += Number(line.slice(3));
  }
  return { hit, found };
}

export function badge({ hit, found }: Lines): Badge {
  if (found === 0) {
    return {
      schemaVersion: 1,
      label: 'coverage',
      message: 'unknown',
      color: 'lightgrey',
    };
  }
  // Rounded down, so the badge never shows 100% with lines left uncovered
  const percent = Math.floor((hit * 100) / found);
  const color = COLORS.find(([least]) => percent >= least)?.[1] ?? 'red';
  return { schemaVersion: 1, label: 'coverage', message: `${percent}%`, color };
}

export function update(dir: string, suite: string, lcov: string): Badge {
  const suites = join(dir, 'suites');
  mkdirSync(suites, { recursive: true });
  writeFileSync(
    join(suites, `${suite}.json`),
    `${JSON.stringify(lcovLines(lcov))}\n`,
  );

  const totals = readdirSync(suites)
    .filter((file) => file.endsWith('.json'))
    .map(
      (file) => JSON.parse(readFileSync(join(suites, file), 'utf8')) as Lines,
    );
  const result = badge({
    hit: totals.reduce((sum, t) => sum + t.hit, 0),
    found: totals.reduce((sum, t) => sum + t.found, 0),
  });
  writeFileSync(join(dir, 'coverage.json'), `${JSON.stringify(result)}\n`);
  return result;
}

if (import.meta.main) {
  const [dir, suite, file] = process.argv.slice(2);
  if (dir === undefined || suite === undefined || file === undefined) {
    console.error(
      'Usage: node scripts/coverage-badge.ts BADGES_DIR SUITE LCOV',
    );
    process.exit(2);
  }
  const result = update(dir, suite, readFileSync(file, 'utf8'));
  console.log(`Coverage with ${suite}: ${result.message}`);
}
