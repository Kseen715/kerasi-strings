// A section of the board: a group of rows under a ruled heading, and the
// board-wide option of that group.

import type { ReactNode } from 'react';
import type { BoardRow, GroupId, Meta, ParamValue } from '../engine/types';
import { IconButton } from '../ds/kerasi';
import { ParamControl } from './ParamControl';
import { useCopy } from './toasts';

type Options = Record<string, ParamValue>;

/** The board-wide options and the operation that declares each */
const OPTION_OPS: Partial<Record<GroupId, [op: string, param: string]>> = {
  layout: ['layout.fix', 'to'],
  hash: ['hash.md5', 'format'],
};

interface OptionToolsProps {
  meta: Meta;
  group: GroupId;
  options: Options;
  onOptions: (options: Options) => void;
}

/** The board-wide option of a group, built from its operation's spec. */
export function OptionTools({
  meta,
  group,
  options,
  onOptions,
}: OptionToolsProps) {
  const [opId, paramId] = OPTION_OPS[group] ?? [];
  const spec = meta.ops
    .find((op) => op.id === opId)
    ?.params.find((param) => param.id === paramId);
  if (spec?.type !== 'choice') {
    return null;
  }

  const value = String(options[spec.id] ?? spec.default);
  const set = (next: ParamValue) => {
    onOptions({ ...options, [spec.id]: next });
  };
  return <ParamControl spec={spec} value={value} onChange={set} />;
}

interface SectionProps {
  index: number;
  title: string;
  subtitle: (rows: number) => string;
  rows: BoardRow[];
  onSend: (text: string) => void;
  children?: ReactNode;
}

export function Section(props: SectionProps) {
  const id = `section-${props.index}`;
  return (
    <section aria-labelledby={id}>
      <div className="section-head">
        <h2 id={id} className="section-title">
          {props.title}
        </h2>
        <div className="section-tools">
          {props.children}
          <span className="overline">
            {String(props.index).padStart(2, '0')} —{' '}
            {props.subtitle(props.rows.length)}
          </span>
        </div>
      </div>
      <ul className="rows">
        {props.rows.map((row) => (
          <Row key={row.id} row={row} onSend={props.onSend} />
        ))}
      </ul>
    </section>
  );
}

function Row({ row, onSend }: { row: BoardRow; onSend: (t: string) => void }) {
  const copy = useCopy();
  const output = row.output;

  return (
    <li className="row">
      <span className="row-label">{row.label}</span>
      {output?.text ? (
        <button
          type="button"
          className="row-value"
          title="Use as input"
          aria-label={`Use as input: ${output.value}`}
          onClick={() => {
            onSend(output.value);
          }}
        >
          {output.value}
        </button>
      ) : (
        <span className="row-note">
          {output ? `${output.value} (binary, as hex)` : row.error?.message}
        </span>
      )}
      {output && (
        <IconButton
          icon="copy"
          label={`Copy ${row.label}`}
          size={44}
          onClick={() => {
            copy(output.value, row.label);
          }}
        />
      )}
    </li>
  );
}
