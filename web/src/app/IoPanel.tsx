// Input, output and the step trace of recipe mode.

import type { Latest } from '../engine/hooks';
import type { OpMeta, RunReply, Step, StepTrace } from '../engine/types';
import { Button, TOUCH } from '../ds/kerasi';
import { Icon } from '../ds/Icon';
import { FileChip, OpenFile, useDrop, useOpenFile } from './files';
import { describeText, formatBytes, formatMs } from './format';
import { EMPTY, inputFromOutput } from './input';
import type { Input } from './input';
import { opOf } from './recipe';
import { useCopy } from './toasts';

interface IoPanelProps {
  ops: Map<string, OpMeta>;
  steps: Step[];
  input: Input;
  onInput: (input: Input) => void;
  run: Latest<RunReply>;
}

export function IoPanel(props: IoPanelProps) {
  return (
    <section aria-label="Input and output" className="pane pane-io">
      <InputBox input={props.input} onInput={props.onInput} />
      <OutputBox {...props} />
      <Trace {...props} />
    </section>
  );
}

function InputBox({ input, onInput }: Pick<IoPanelProps, 'input' | 'onInput'>) {
  const openFile = useOpenFile(onInput);
  const { dropping, handlers } = useDrop(openFile);

  return (
    <div className={dropping ? 'io-box dropping' : 'io-box'} {...handlers}>
      <div className="pane-head">
        <label htmlFor="recipe-input" className="overline">
          03 — Input
        </label>
        <OpenFile onFile={openFile} />
      </div>
      {input.kind === 'text' ? (
        <>
          <textarea
            id="recipe-input"
            className="io-text"
            spellCheck={false}
            placeholder="Type or paste text, or drop a file"
            value={input.text}
            onChange={(event) => {
              onInput({ kind: 'text', text: event.target.value });
            }}
          />
          <span className="io-meta">{describeText(input.text)}</span>
        </>
      ) : (
        <FileChip
          name={input.name}
          size={input.blob.size}
          onClear={() => {
            onInput(EMPTY);
          }}
        />
      )}
    </div>
  );
}

function OutputBox({ ops, steps, run, onInput }: IoPanelProps) {
  return (
    <div className="io-box">
      <div className="pane-head">
        <span className="overline" id="output-label">
          04 — Output
        </span>
        <OutputTools reply={run.value} onInput={onInput} />
      </div>
      <output className="io-output" aria-labelledby="output-label">
        {run.value?.report.output?.value}
      </output>
      <OutputMeta ops={ops} steps={steps} run={run} />
    </div>
  );
}

interface OutputToolsProps {
  reply: RunReply | undefined;
  onInput: (input: Input) => void;
}

/** Text output is copied; binary output, shown as hex, is downloaded. */
function OutputTools({ reply, onInput }: OutputToolsProps) {
  const copy = useCopy();
  const shown = reply?.report.output;
  const next = reply && inputFromOutput(reply);
  const tool = { variant: 'ghost', size: 'sm', style: TOUCH } as const;

  return (
    <div className="pane-tools">
      <Button
        {...tool}
        icon="arrow-right"
        disabled={!next}
        onClick={() => {
          if (next) {
            onInput(next);
          }
        }}
      >
        Use as input
      </Button>
      {shown?.text === false && reply?.output ? (
        <Download bytes={reply.output} />
      ) : (
        <Button
          {...tool}
          icon="copy"
          disabled={!shown}
          onClick={() => {
            if (shown) {
              copy(shown.value, 'the output');
            }
          }}
        >
          Copy
        </Button>
      )}
    </div>
  );
}

function OutputMeta({
  ops,
  steps,
  run,
}: Pick<IoPanelProps, 'ops' | 'steps' | 'run'>) {
  const reply = run.value;
  const shown = reply?.report.output;
  const traces = reply?.report.steps ?? [];
  const failedAt = traces.findIndex((trace) => trace.status === 'failed');
  const failure = traces[failedAt]?.error;
  const step = steps[failedAt];
  const problem =
    failure && step
      ? `Step ${failedAt + 1} (${opOf(ops, step).name}) failed: ` +
        failure.message
      : run.error;

  return (
    <div aria-live="polite">
      {problem ? (
        <p className="problem">
          <Icon name="octagon-x" size={16} color="var(--status-danger)" />
          <span>{problem}</span>
        </p>
      ) : shown && reply.output ? (
        <span className="io-meta">
          {shown.text
            ? describeText(shown.value)
            : `Binary, ${formatBytes(reply.output.length)}, shown as hex` +
              (shown.truncated ? ' (start only)' : '')}
        </span>
      ) : null}
    </div>
  );
}

function Download({ bytes }: { bytes: Uint8Array }) {
  const save = () => {
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)]));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'output.bin';
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Button
      variant="ghost"
      size="sm"
      icon="download"
      style={TOUCH}
      onClick={save}
    >
      Download
    </Button>
  );
}

const STATUS: Record<StepTrace['status'], string> = {
  ok: 'ok',
  failed: 'failed',
  disabled: 'off',
  blocked: 'not run',
};

function Trace({ ops, steps, run }: IoPanelProps) {
  const trace = run.value?.report.steps ?? [];
  return (
    <div className="io-box">
      <h2 className="overline" style={{ margin: 0 }}>
        05 — Step trace
      </h2>
      {steps.length === 0 ? (
        <p className="notice">The trace shows what every step produced.</p>
      ) : (
        <ol className="trace">
          {steps.map((step, i) => (
            <TraceRow
              key={i}
              n={i + 1}
              name={opOf(ops, step).name}
              trace={trace[i]}
            />
          ))}
        </ol>
      )}
    </div>
  );
}

interface TraceRowProps {
  n: number;
  name: string;
  trace: StepTrace | undefined;
}

function TraceRow({ n, name, trace }: TraceRowProps) {
  const value = trace?.error?.message ?? trace?.preview?.value ?? '';
  const cut = trace?.preview?.truncated ? '…' : '';
  const time =
    trace?.status === 'ok'
      ? `${formatMs(trace.ms)} · ${formatBytes(trace.bytes ?? 0)}`
      : STATUS[trace?.status ?? 'blocked'];
  return (
    <li className="trace-row">
      <span className="step-num">{String(n).padStart(2, '0')}</span>
      <span>{name}</span>
      <span className="trace-value">
        {value}
        {cut}
      </span>
      <span className="trace-time">{time}</span>
    </li>
  );
}
