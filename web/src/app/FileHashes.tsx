// The board for a file input: every hash, read from the file in chunks
// with progress, so files of any size work.

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useEngine } from '../engine/context';
import { useLatest } from '../engine/hooks';
import type { BoardRow, Meta, OpMeta, ParamValue } from '../engine/types';
import { Section } from './BoardSection';
import { formatBytes } from './format';
import { groupName } from './meta';

interface FileHashesProps {
  meta: Meta;
  blob: Blob;
  options: Record<string, ParamValue>;
  children: ReactNode;
}

export function FileHashes({ meta, blob, options, children }: FileHashesProps) {
  const ops = useMemo(
    () => meta.ops.filter((op) => op.group === 'hash'),
    [meta],
  );
  const format = String(options.format ?? 'hex');
  const hashing = useHashes(blob, ops, format);

  return (
    <div className="board gutter">
      <div className="board-col board-wide">
        <p className="notice">
          Text transforms need text input. Hashes read the file in chunks, so it
          never has to fit in memory.
        </p>
        {hashing.pending && <Progress done={hashing.done} total={blob.size} />}
        <Section
          index={2}
          title={groupName(meta, 'hash')}
          subtitle={(count) => `${count} hashes · chunked`}
          rows={rowsOf(ops, hashing)}
          onSend={() => undefined}
        >
          {children}
        </Section>
      </div>
    </div>
  );
}

interface Hashing {
  hashes: string[] | undefined;
  error: string | undefined;
  pending: boolean;
  /** Bytes of the file read so far */
  done: number;
}

function useHashes(blob: Blob, ops: OpMeta[], format: string): Hashing {
  const engine = useEngine();
  const [progress, setProgress] = useState({ blob, done: 0 });

  const task = useMemo(() => {
    const ids = ops.map((op) => op.id);
    return () =>
      engine.hash(blob, ids, format, (done) => {
        setProgress({ blob, done });
      });
  }, [engine, blob, ops, format]);
  const { value, pending, error } = useLatest(task);

  return {
    hashes: pending ? undefined : value,
    error,
    pending,
    done: progress.blob === blob ? progress.done : 0,
  };
}

function rowsOf(ops: OpMeta[], { hashes, error }: Hashing): BoardRow[] {
  return ops.map((op, i) => {
    const hash = hashes?.[i];
    const row = { id: op.id, group: op.group, label: op.name, op: op.id };
    return hash === undefined
      ? { ...row, error: { message: error ?? 'Reading the file…' } }
      : { ...row, output: { text: true, value: hash, truncated: false } };
  });
}

function Progress({ done, total }: { done: number; total: number }) {
  return (
    <div
      className="progress"
      role="progressbar"
      aria-label="Hashing the file"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      aria-valuetext={`${formatBytes(done)} of ${formatBytes(total)}`}
    >
      <div
        className="progress-bar"
        style={{ width: `${(100 * done) / Math.max(total, 1)}%` }}
      />
    </div>
  );
}
