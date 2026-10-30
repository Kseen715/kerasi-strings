// The shapes of what the engine returns: `ops_meta()`, the run report and
// the board rows (crates/strings-core).

export type GroupId = 'case' | 'layout' | 'encode' | 'hash';

export interface Choice {
  id: string;
  name: string;
}

export type ParamSpec =
  | {
      type: 'choice';
      id: string;
      name: string;
      options: Choice[];
      default: string;
    }
  | { type: 'flag'; id: string; name: string; default: boolean };

export interface OpMeta {
  id: string;
  name: string;
  group: GroupId;
  params: ParamSpec[];
  example: string;
}

export interface Meta {
  version: string;
  groups: { id: GroupId; name: string }[];
  ops: OpMeta[];
}

export type ParamValue = string | boolean;

export interface Step {
  op: string;
  params: Record<string, ParamValue>;
  enabled: boolean;
}

export interface Rendered {
  text: boolean;
  value: string;
  truncated: boolean;
}

export interface OpError {
  message: string;
  offset?: number;
}

export interface StepTrace {
  status: 'ok' | 'failed' | 'disabled' | 'blocked';
  preview?: Rendered;
  bytes?: number;
  error?: OpError;
  ms: number;
}

export interface Report {
  output: Rendered | null;
  steps: StepTrace[];
}

export interface RunReply {
  report: Report;
  /** The output bytes; missing when a step failed */
  output?: Uint8Array;
}

export interface BoardRow {
  id: string;
  group: GroupId;
  label: string;
  op: string;
  output?: Rendered;
  error?: OpError;
}

/** What the engine runs on: typed text or the bytes of a file */
export type Source = { text: string } | { blob: Blob };
