// Lists and search built from the engine's metadata.

import type { GroupId, Meta, OpMeta } from '../engine/types';

export function opsById(meta: Meta): Map<string, OpMeta> {
  return new Map(meta.ops.map((op) => [op.id, op]));
}

export function groupName(meta: Meta, id: GroupId): string {
  return meta.groups.find((group) => group.id === id)?.name ?? id;
}

export interface OpGroup {
  id: GroupId;
  name: string;
  ops: OpMeta[];
}

export function grouped(meta: Meta, ops: OpMeta[]): OpGroup[] {
  return meta.groups
    .map((group) => ({
      ...group,
      ops: ops.filter((op) => op.group === group.id),
    }))
    .filter((group) => group.ops.length > 0);
}

/** Operations whose name, id, group or example contain every word of the
 * query; names that start with the first word come first. */
export function searchOps(meta: Meta, query: string): OpMeta[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const [first] = words;
  if (first === undefined) {
    return meta.ops;
  }

  const matches = meta.ops.filter((op) => {
    const text = [op.name, op.id, groupName(meta, op.group), op.example]
      .join(' ')
      .toLowerCase();
    return words.every((word) => text.includes(word));
  });
  const leads = (op: OpMeta) => op.name.toLowerCase().startsWith(first);
  return [...matches.filter(leads), ...matches.filter((op) => !leads(op))];
}
