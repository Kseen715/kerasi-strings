// "Find operation · Ctrl K": search every operation and add one to the
// recipe. Arrow keys move through the results, Enter adds, Escape closes.

import { useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { Meta, OpMeta } from '../engine/types';
import { Dialog, Input } from '../ds/kerasi';
import { groupName, searchOps } from './meta';

const LIST_ID = 'palette-results';

const MOVES: Partial<Record<string, number>> = { ArrowDown: 1, ArrowUp: -1 };

interface CommandPaletteProps {
  meta: Meta;
  onAdd: (op: string) => void;
  onClose: () => void;
}

export function CommandPalette({ meta, onAdd, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const results = useMemo(() => searchOps(meta, query), [meta, query]);
  const current = Math.min(active, results.length - 1);

  const add = (index: number) => {
    const op = results[index];
    if (op) {
      onAdd(op.id);
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const move = MOVES[event.key];
    if (move !== undefined && results.length > 0) {
      setActive((current + move + results.length) % results.length);
    } else if (event.key === 'Enter') {
      add(current);
    } else if (event.key === 'Escape') {
      onClose();
    } else {
      return;
    }
    event.preventDefault();
  };

  return (
    <Dialog open title="Find operation" eyebrow="Ctrl K" onClose={onClose}>
      <Search
        query={query}
        current={current}
        onKeyDown={onKeyDown}
        onQuery={(next) => {
          setQuery(next);
          setActive(0);
        }}
      />
      <Results meta={meta} results={results} current={current} onAdd={add} />
    </Dialog>
  );
}

interface SearchProps {
  query: string;
  current: number;
  onQuery: (query: string) => void;
  onKeyDown: (event: KeyboardEvent) => void;
}

function Search({ query, current, onQuery, onKeyDown }: SearchProps) {
  return (
    <Input
      label="Operation"
      icon="search"
      // The palette opens on a key press; the search field is its point
      // eslint-disable-next-line jsx-a11y/no-autofocus
      autoFocus
      role="combobox"
      aria-expanded="true"
      aria-controls={LIST_ID}
      aria-activedescendant={current >= 0 ? `${LIST_ID}-${current}` : undefined}
      aria-autocomplete="list"
      placeholder="snake, sha256, base64…"
      value={query}
      onKeyDown={onKeyDown}
      onChange={(event: { target: { value: string } }) => {
        onQuery(event.target.value);
      }}
    />
  );
}

interface ResultsProps {
  meta: Meta;
  results: OpMeta[];
  current: number;
  onAdd: (index: number) => void;
}

function Results({ meta, results, current, onAdd }: ResultsProps) {
  return (
    <ul
      id={LIST_ID}
      role="listbox"
      aria-label="Operations"
      className="palette-list"
    >
      {results.length === 0 && (
        <li className="palette-item" role="presentation">
          No operation matches.
        </li>
      )}
      {results.map((op, i) => (
        <li
          key={op.id}
          id={`${LIST_ID}-${i}`}
          role="option"
          aria-selected={i === current}
          className="palette-item"
          // A click must not take focus from the search field
          onMouseDown={(event) => {
            event.preventDefault();
            onAdd(i);
          }}
        >
          <span>{op.name}</span>
          <span className="op-example">{groupName(meta, op.group)}</span>
        </li>
      ))}
    </ul>
  );
}
