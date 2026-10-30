import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { badge, lcovLines, update } from './coverage-badge';

const LCOV = 'SF:a.ts\nLF:10\nLH:9\nend_of_record\nSF:b.ts\nLF:10\nLH:6\n';

describe('coverage badge', () => {
  it('sums the lines of every file in an lcov report', () => {
    expect(lcovLines(LCOV)).toEqual({ hit: 15, found: 20 });
    expect(lcovLines('')).toEqual({ hit: 0, found: 0 });
  });

  it('rounds down and colours by percentage', () => {
    expect(badge({ hit: 999, found: 1000 })).toMatchObject({
      message: '99%',
      color: 'brightgreen',
    });
    expect(badge({ hit: 15, found: 20 }).color).toBe('green');
    expect(badge({ hit: 1, found: 10 }).color).toBe('red');
    expect(badge({ hit: 0, found: 0 })).toMatchObject({
      message: 'unknown',
      color: 'lightgrey',
    });
  });

  it('keeps each suite and badges their sum', () => {
    const dir = mkdtempSync(join(tmpdir(), 'badges-'));
    update(dir, 'web', LCOV);
    const result = update(dir, 'rust', 'LF:20\nLH:20\n');
    expect(result.message).toBe('87%');
    const written = JSON.parse(
      readFileSync(join(dir, 'coverage.json'), 'utf8'),
    ) as unknown;
    expect(written).toEqual(result);
    expect(readFileSync(join(dir, 'suites/web.json'), 'utf8')).toBe(
      '{"hit":15,"found":20}\n',
    );
  });
});
