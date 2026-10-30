// The UI's only way to the engine. Requests on one channel (the board,
// the recipe, a file hash) replace each other: when a newer one is sent,
// the older one resolves to `null` instead of its now stale result.

import type { Payload, Request, Response } from './protocol';
import type {
  BoardRow,
  Meta,
  ParamValue,
  RunReply,
  Source,
  Step,
} from './types';

export interface WorkerLike {
  postMessage(message: Request, transfer: Transferable[]): void;
  onmessage: ((event: MessageEvent<Response>) => void) | null;
  terminate(): void;
}

type Channel = 'board' | 'run' | 'hash';

type Progress = (done: number, total: number) => void;

interface Pending {
  resolve: (response: Response | null) => void;
  reject: (error: Error) => void;
  channel: Channel | undefined;
  onProgress: Progress | undefined;
}

type Message = Request extends infer R
  ? R extends Request
    ? Omit<R, 'id'>
    : never
  : never;

interface Options {
  channel?: Channel;
  onProgress?: Progress;
}

export class EngineClient {
  private worker: WorkerLike;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private readonly latest = new Map<Channel, number>();

  constructor(private readonly spawn: () => WorkerLike) {
    this.worker = this.start();
  }

  async meta(): Promise<Meta> {
    const response = await this.request({ kind: 'meta' });
    return expect(response, 'meta').meta;
  }

  /** Runs a recipe; `null` when a newer run replaced this one. */
  async run(steps: Step[], source: Source): Promise<RunReply | null> {
    return this.runOn(steps, source, 'run');
  }

  /** Runs a recipe on no channel, so it never goes stale. */
  async runOnce(steps: Step[], source: Source): Promise<RunReply> {
    const reply = await this.runOn(steps, source, undefined);
    if (!reply) {
      throw new Error('A run on no channel is never replaced');
    }
    return reply;
  }

  async board(
    source: Source,
    options: Record<string, ParamValue>,
  ): Promise<BoardRow[] | null> {
    const response = await this.request(
      {
        kind: 'board',
        options: JSON.stringify(options),
        input: payload(source),
      },
      { channel: 'board' },
    );
    return response && expect(response, 'board').rows;
  }

  async hash(
    blob: Blob,
    ops: string[],
    format: string,
    onProgress: Progress,
  ): Promise<string[] | null> {
    const previous = this.latest.get('hash');
    if (previous !== undefined && this.pending.has(previous)) {
      this.worker.postMessage({ id: previous, kind: 'cancel' }, []);
    }
    const response = await this.request(
      { kind: 'hash', ops, format, blob },
      { channel: 'hash', onProgress },
    );
    return response && expect(response, 'hash').hashes;
  }

  dispose(): void {
    this.worker.terminate();
    this.failAll('The engine was stopped');
  }

  private async runOn(
    steps: Step[],
    source: Source,
    channel: Channel | undefined,
  ): Promise<RunReply | null> {
    const recipe = JSON.stringify(steps);
    const message = { kind: 'run', recipe, input: payload(source) } as const;
    const response = await this.request(message, channel && { channel });
    if (!response) {
      return null;
    }
    const { report, output } = expect(response, 'run');
    return { report, ...(output && { output: new Uint8Array(output) }) };
  }

  private request(
    message: Message,
    { channel, onProgress }: Options = {},
  ): Promise<Response | null> {
    const id = this.nextId++;
    if (channel) {
      this.latest.set(channel, id);
    }
    const transfer =
      'input' in message && 'bytes' in message.input
        ? [message.input.bytes]
        : [];
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, channel, onProgress });
      this.worker.postMessage({ ...message, id }, transfer);
    });
  }

  private start(): WorkerLike {
    const worker = this.spawn();
    worker.onmessage = (event) => {
      this.receive(event.data);
    };
    return worker;
  }

  private receive(response: Response): void {
    const pending = this.pending.get(response.id);
    if (!pending) {
      return;
    }
    if (response.kind === 'progress') {
      pending.onProgress?.(response.done, response.total);
      return;
    }

    this.pending.delete(response.id);
    const stale =
      pending.channel !== undefined &&
      this.latest.get(pending.channel) !== response.id;
    if (stale || response.kind === 'cancelled') {
      pending.resolve(null);
    } else if (response.kind === 'error') {
      pending.reject(new Error(response.message));
    } else {
      pending.resolve(response);
    }

    if (response.kind === 'error' && response.fatal) {
      this.restart();
    }
  }

  private restart(): void {
    this.worker.terminate();
    this.failAll('The engine stopped and was restarted');
    this.worker = this.start();
  }

  private failAll(message: string): void {
    for (const pending of this.pending.values()) {
      pending.reject(new Error(message));
    }
    this.pending.clear();
  }
}

function payload(source: Source): Payload {
  if ('blob' in source) {
    return { blob: source.blob };
  }
  return { bytes: new TextEncoder().encode(source.text).buffer };
}

function expect<K extends Response['kind']>(
  response: Response | null,
  kind: K,
): Extract<Response, { kind: K }> {
  if (response?.kind !== kind) {
    throw new Error(`The engine answered ${response?.kind ?? 'nothing'}`);
  }
  return response as Extract<Response, { kind: K }>;
}
