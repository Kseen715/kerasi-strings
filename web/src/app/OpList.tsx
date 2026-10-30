// The list of operations in recipe mode, grouped, with a filter. Enter or
// a click adds an operation to the recipe.

import { useMemo, useState } from 'react';
import type { Meta } from '../engine/types';
import { Input } from '../ds/kerasi';
import { grouped, searchOps } from './meta';
import type { OpGroup } from './meta';

interface OpListProps {
  meta: Meta;
  used: Set<string>;
  onAdd: (op: string) => void;
}

export function OpList({ meta, used, onAdd }: OpListProps) {
  const [query, setQuery] = useState('');
  const groups = useMemo(
    () => grouped(meta, searchOps(meta, query)),
    [meta, query],
  );

  return (
    <nav aria-label="Operations" className="pane">
      <span className="overline">01 — Operations · {meta.ops.length}</span>
      <Input
        label="Filter operations"
        icon="search"
        type="search"
        placeholder="case, sha, base…"
        value={query}
        onChange={(event: { target: { value: string } }) => {
          setQuery(event.target.value);
        }}
      />
      <div className="ops-groups">
        {groups.length === 0 && <p className="notice">No operation matches.</p>}
        {groups.map((group) => (
          <Group key={group.id} group={group} used={used} onAdd={onAdd} />
        ))}
      </div>
    </nav>
  );
}

interface GroupProps {
  group: OpGroup;
  used: Set<string>;
  onAdd: (op: string) => void;
}

function Group({ group, used, onAdd }: GroupProps) {
  return (
    <section aria-labelledby={`ops-${group.id}`}>
      <div className="ops-group-head">
        <h2 id={`ops-${group.id}`} className="ops-group-name">
          {group.name}
        </h2>
        <span className="overline">{group.ops.length}</span>
      </div>
      {group.ops.map((op) => (
        <button
          key={op.id}
          type="button"
          className={used.has(op.id) ? 'op-item op-item-used' : 'op-item'}
          aria-label={`Add ${op.name}`}
          onClick={() => {
            onAdd(op.id);
          }}
        >
          <span className="op-dot" aria-hidden="true" />
          <span className="op-name">{op.name}</span>
          <span className="op-example" aria-hidden="true">
            {op.example}
          </span>
        </button>
      ))}
    </section>
  );
}
