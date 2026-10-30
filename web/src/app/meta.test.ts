import { beforeAll, describe, expect, it } from 'vitest';
import type { Meta } from '../engine/types';
import { loadEngine } from '../engine/testing';
import { groupName, grouped, opsById, searchOps } from './meta';

let meta: Meta;

beforeAll(() => {
  meta = JSON.parse(loadEngine().ops_meta()) as Meta;
});

const names = (ops: { name: string }[]) => ops.map((op) => op.name);

describe('metadata helpers', () => {
  it('indexes operations and names groups', () => {
    expect(opsById(meta).get('case.snake')?.name).toBe('snake_case');
    expect(groupName(meta, 'layout')).toBe('Keyboard layout');
  });

  it('groups in the engine order and drops empty groups', () => {
    const hashes = meta.ops.filter((op) => op.group === 'hash');
    expect(grouped(meta, hashes).map((g) => g.id)).toEqual(['hash']);
    expect(grouped(meta, meta.ops).map((g) => g.id)).toEqual([
      'case',
      'layout',
      'encode',
      'hash',
    ]);
  });

  it('finds every operation for an empty query', () => {
    expect(searchOps(meta, '  ')).toHaveLength(meta.ops.length);
  });

  it('matches every word against name, id, group and example', () => {
    expect(names(searchOps(meta, 'sha 256'))).toEqual(['SHA-256']);
    expect(names(searchOps(meta, 'keyboard'))).toEqual([
      'Fix layout',
      'Detect layout',
    ]);
    expect(names(searchOps(meta, 'grown_slowly'))).toEqual([
      'snake_case',
      'SCREAMING_SNAKE_CASE',
    ]);
    expect(searchOps(meta, 'nothing like this')).toEqual([]);
  });

  it('puts names that start with the query first', () => {
    const found = names(searchOps(meta, 'base64'));
    expect(found.slice(0, 2)).toEqual(['Base64 encode', 'Base64 decode']);
    expect(names(searchOps(meta, 'case'))[0]).toBe('lower case');
  });
});
