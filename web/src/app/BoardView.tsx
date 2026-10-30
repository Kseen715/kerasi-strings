// Board mode (layout C): one big input on the accent band, and below it
// every operation run live on it, one row per operation.

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useEngine } from '../engine/context';
import { useDebounced, useLatest } from '../engine/hooks';
import type { BoardRow, GroupId, Meta, ParamValue } from '../engine/types';
import { Tabs } from '../ds/kerasi';
import { OptionTools, Section } from './BoardSection';
import { FileChip, OpenFile, useDrop, useOpenFile } from './files';
import { FileHashes } from './FileHashes';
import { byteLength, describeText } from './format';
import { EMPTY, LIVE_BYTES } from './input';
import type { Input } from './input';
import { groupName } from './meta';
import { useMedia } from './theme';

export const DEBOUNCE_MS = 60;

const PHONE = '(width < 640px)';

/** Sections are numbered in their desktop order; the phone tabs follow
 * the design and put layout before encode */
const DESKTOP_ORDER: GroupId[] = [
  'case',
  'encode',
  'layout',
  'translit',
  'hash',
];
const TAB_ORDER: GroupId[] = ['case', 'layout', 'translit', 'encode', 'hash'];

const SUBTITLES: Record<GroupId, (rows: number) => string> = {
  case: (rows) => `${rows} styles`,
  encode: () => 'RFC 4648 · 3492 · 3986',
  layout: () => 'keyboard',
  translit: () => 'Russian',
  hash: (rows) => `${rows} hashes`,
};

type Options = Record<string, ParamValue>;

interface BoardViewProps {
  meta: Meta;
  input: Input;
  onInput: (input: Input) => void;
  options: Options;
  onOptions: (options: Options) => void;
}

export function BoardView(props: BoardViewProps) {
  const { meta, input, onInput, options, onOptions } = props;
  const board = useBoardRows(input, options);

  const body =
    input.kind === 'file' ? (
      <FileHashes meta={meta} blob={input.blob} options={options}>
        <OptionTools
          meta={meta}
          group="hash"
          options={options}
          onOptions={onOptions}
        />
      </FileHashes>
    ) : (
      <Sections
        meta={meta}
        rows={board.rows}
        options={options}
        onOptions={onOptions}
        onSend={(text) => {
          onInput({ kind: 'text', text });
        }}
      />
    );

  return (
    <main>
      <Band input={input} onInput={onInput} board={board} />
      {body}
    </main>
  );
}

interface BoardState {
  rows: BoardRow[];
  /** Set when the input is too large to run on every key press */
  run: (() => void) | undefined;
}

function useBoardRows(input: Input, options: Options): BoardState {
  const engine = useEngine();
  const text = input.kind === 'text' ? input.text : undefined;
  const debounced = useDebounced(text, DEBOUNCE_MS);
  const [ranOn, setRanOn] = useState<string>();
  const large = text !== undefined && byteLength(text) > LIVE_BYTES;
  const target = large ? ranOn : debounced;

  const task = useMemo(
    () =>
      target === undefined
        ? undefined
        : () => engine.board({ text: target }, options),
    [engine, target, options],
  );
  const rows = useLatest(task).value ?? [];
  const run =
    large && ranOn !== text
      ? () => {
          setRanOn(text);
        }
      : undefined;
  return { rows, run };
}

interface BandProps {
  input: Input;
  onInput: (input: Input) => void;
  board: BoardState;
}

function Band({ input, onInput, board }: BandProps) {
  const openFile = useOpenFile(onInput);
  const { dropping, handlers } = useDrop(openFile);
  const live = board.run ? 'large input · press Run' : 'runs live';

  return (
    <section className="band" aria-label="Input" {...handlers}>
      <div className={`band-inner gutter${dropping ? ' dropping' : ''}`}>
        <div className="band-head">
          <label htmlFor="board-input" className="band-label">
            01 — Input · every transform {live}
          </label>
          <span className="band-meta">
            {input.kind === 'text' ? describeText(input.text) : 'file'}
          </span>
        </div>
        <BandInput input={input} onInput={onInput} />
        <div className="section-tools">
          <OpenFile onFile={openFile} className="band-button" />
          {board.run && (
            <button type="button" className="band-button" onClick={board.run}>
              Run
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function BandInput({ input, onInput }: Omit<BandProps, 'board'>) {
  if (input.kind === 'file') {
    return (
      <FileChip
        name={input.name}
        size={input.blob.size}
        onClear={() => {
          onInput(EMPTY);
        }}
      />
    );
  }
  return (
    <textarea
      id="board-input"
      className="band-input"
      rows={2}
      placeholder="Type or paste text, or drop a file"
      spellCheck={false}
      value={input.text}
      onChange={(event) => {
        onInput({ kind: 'text', text: event.target.value });
      }}
    />
  );
}

interface SectionsProps {
  meta: Meta;
  rows: BoardRow[];
  options: Options;
  onOptions: (options: Options) => void;
  onSend: (text: string) => void;
}

function Sections(props: SectionsProps) {
  const phone = useMedia(PHONE);
  const section = (group: GroupId) => (
    <Section
      key={group}
      index={DESKTOP_ORDER.indexOf(group) + 2}
      title={groupName(props.meta, group)}
      rows={props.rows.filter((row) => row.group === group)}
      subtitle={SUBTITLES[group]}
      onSend={props.onSend}
    >
      <OptionTools group={group} {...props} />
    </Section>
  );

  if (phone) {
    return <PhoneSections meta={props.meta} section={section} />;
  }
  return (
    <div className="board gutter">
      <div className="board-col">{section('case')}</div>
      <div className="board-col">
        {section('encode')}
        {section('layout')}
        {section('translit')}
      </div>
      <div className="board-col board-wide">{section('hash')}</div>
    </div>
  );
}

interface PhoneSectionsProps {
  meta: Meta;
  section: (group: GroupId) => ReactNode;
}

/** On a phone the groups become tabs, one section on screen at a time. */
function PhoneSections({ meta, section }: PhoneSectionsProps) {
  const [tab, setTab] = useState<GroupId>('case');
  const items = TAB_ORDER.map((id) => ({ id, label: groupName(meta, id) }));
  return (
    <div className="board-tabs">
      <Tabs
        items={items}
        value={tab}
        onChange={(id) => {
          setTab(id as GroupId);
        }}
      />
      <div className="gutter">{section(tab)}</div>
    </div>
  );
}
