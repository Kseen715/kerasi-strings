import { describe, expect, it, vi } from 'vitest';
import { EngineClient } from './client';
import type { WorkerLike } from './client';
import type { Request, Response } from './protocol';

/** A worker that records requests and answers when the test says so. */
class FakeWorker implements WorkerLike {
  onmessage: ((event: MessageEvent<Response>) => void) | null = null;
  sent: { message: Request; transfer: Transferable[] }[] = [];
  terminated = false;

  postMessage(message: Request, transfer: Transferable[]): void {
    this.sent.push({ message, transfer });
  }

  terminate(): void {
    this.terminated = true;
  }

  answer(response: Response): void {
    this.onmessage?.({ data: response } as MessageEvent<Response>);
  }

  last(): Request {
    const last = this.sent.at(-1);
    if (!last) throw new Error('nothing sent');
    return last.message;
  }
}

function setup() {
  const workers: FakeWorker[] = [];
  const client = new EngineClient(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker;
  });
  const worker = () => {
    const current = workers.at(-1);
    if (!current) throw new Error('no worker');
    return current;
  };
  return { client, workers, worker };
}

const REPORT = { output: null, steps: [] };

describe('EngineClient', () => {
  it('transfers typed text as bytes', async () => {
    const { client, worker } = setup();
    const run = client.run([], { text: 'hé' });
    const { message, transfer } = worker().sent[0] ?? {};
    expect(message?.kind).toBe('run');
    if (message?.kind !== 'run' || !('bytes' in message.input)) {
      throw new Error('no bytes');
    }
    expect([...new Uint8Array(message.input.bytes)]).toEqual([104, 195, 169]);
    expect(transfer).toEqual([message.input.bytes]);

    worker().answer({ id: message.id, kind: 'run', report: REPORT });
    await expect(run).resolves.toEqual({ report: REPORT });
  });

  it('passes files as blobs without transferring them', () => {
    const { client, worker } = setup();
    const blob = new Blob(['x']);
    void client.board({ blob }, { format: 'HEX' });
    const { message, transfer } = worker().sent[0] ?? {};
    expect(message).toMatchObject({
      kind: 'board',
      options: '{"format":"HEX"}',
      input: { blob },
    });
    expect(transfer).toEqual([]);
  });

  it('resolves a superseded request to null', async () => {
    const { client, worker } = setup();
    const first = client.board({ text: 'a' }, {});
    const firstId = worker().last().id;
    const second = client.board({ text: 'ab' }, {});
    const secondId = worker().last().id;

    worker().answer({ id: secondId, kind: 'board', rows: [] });
    worker().answer({ id: firstId, kind: 'board', rows: [] });
    await expect(first).resolves.toBeNull();
    await expect(second).resolves.toEqual([]);
  });

  it('keeps channels apart', async () => {
    const { client, worker } = setup();
    const board = client.board({ text: 'a' }, {});
    const boardId = worker().last().id;
    const run = client.run([], { text: 'a' });
    const runId = worker().last().id;

    worker().answer({ id: runId, kind: 'run', report: REPORT });
    worker().answer({ id: boardId, kind: 'board', rows: [] });
    await expect(board).resolves.toEqual([]);
    await expect(run).resolves.toMatchObject({ report: REPORT });
  });

  it('wraps run output bytes', async () => {
    const { client, worker } = setup();
    const run = client.runOnce([], { text: 'a' });
    const output = new Uint8Array([1, 2]).buffer;
    worker().answer({
      id: worker().last().id,
      kind: 'run',
      report: REPORT,
      output,
    });
    const reply = await run;
    expect(reply.output).toEqual(new Uint8Array([1, 2]));
  });

  it('never marks a one-off run stale', async () => {
    const { client, worker } = setup();
    const once = client.runOnce([], { text: 'a' });
    const onceId = worker().last().id;
    void client.run([], { text: 'b' });
    worker().answer({ id: onceId, kind: 'run', report: REPORT });
    await expect(once).resolves.toEqual({ report: REPORT });
  });

  it('loads the metadata', async () => {
    const { client, worker } = setup();
    const meta = client.meta();
    const answer = { version: '0', groups: [], ops: [] };
    worker().answer({ id: worker().last().id, kind: 'meta', meta: answer });
    await expect(meta).resolves.toBe(answer);
  });

  it('rejects on errors and on answers of the wrong kind', async () => {
    const { client, worker } = setup();
    const meta = client.meta();
    worker().answer({
      id: worker().last().id,
      kind: 'error',
      message: 'bad',
      fatal: false,
    });
    await expect(meta).rejects.toThrow('bad');

    const again = client.meta();
    worker().answer({ id: worker().last().id, kind: 'board', rows: [] });
    await expect(again).rejects.toThrow('The engine answered board');
  });

  it('reports hash progress and cancels a replaced hash', async () => {
    const { client, worker } = setup();
    const progress = vi.fn();
    const first = client.hash(new Blob(['a']), ['hash.md5'], 'hex', progress);
    const firstId = worker().last().id;
    worker().answer({ id: firstId, kind: 'progress', done: 1, total: 2 });
    expect(progress).toHaveBeenCalledWith(1, 2);

    const second = client.hash(new Blob(['b']), ['hash.md5'], 'hex', progress);
    expect(worker().sent.map((s) => s.message.kind)).toEqual([
      'hash',
      'cancel',
      'hash',
    ]);
    worker().answer({ id: firstId, kind: 'cancelled' });
    worker().answer({ id: worker().last().id, kind: 'hash', hashes: ['h'] });
    await expect(first).resolves.toBeNull();
    await expect(second).resolves.toEqual(['h']);
  });

  it('ignores answers to requests it does not know', () => {
    const { worker } = setup();
    expect(() => {
      worker().answer({ id: 99, kind: 'board', rows: [] });
    }).not.toThrow();
  });

  it('restarts the worker after a fatal error', async () => {
    const { client, workers, worker } = setup();
    const pending = client.board({ text: 'a' }, {});
    const failing = client.run([], { text: 'a' });
    worker().answer({
      id: worker().last().id,
      kind: 'error',
      message: 'trap',
      fatal: true,
    });

    await expect(failing).rejects.toThrow('trap');
    await expect(pending).rejects.toThrow('restarted');
    expect(workers).toHaveLength(2);
    expect(workers[0]?.terminated).toBe(true);
  });

  it('fails pending requests when disposed', async () => {
    const { client, worker } = setup();
    const meta = client.meta();
    client.dispose();
    expect(worker().terminated).toBe(true);
    await expect(meta).rejects.toThrow('stopped');
  });
});
