// What the engine worker does with each request. Kept apart from the
// worker glue so the tests can run it on the real WebAssembly in Node.

import type * as Wasm from '../wasm/strings_wasm.js';
import type { Payload, Post, Request } from './protocol';
import type { BoardRow, Meta, Report } from './types';

export type Engine = Pick<
  typeof Wasm,
  'ops_meta' | 'run' | 'run_board' | 'Hasher'
>;

/** Files are hashed in chunks of this size, with progress after each */
export const CHUNK_BYTES = 4 * 1024 * 1024;

/** A recipe holds its whole input in memory, so files are capped */
export const MAX_RUN_BYTES = 64 * 1024 * 1024;

export class Handler {
  private readonly cancelled = new Set<number>();

  constructor(
    private readonly engine: Engine,
    private readonly post: Post,
  ) {}

  async handle(request: Request): Promise<void> {
    try {
      await this.dispatch(request);
    } catch (error) {
      this.post({
        id: request.id,
        kind: 'error',
        message: error instanceof Error ? error.message : String(error),
        // A trap leaves the WebAssembly instance unusable
        fatal: error instanceof WebAssembly.RuntimeError,
      });
    }
  }

  private async dispatch(request: Request): Promise<void> {
    switch (request.kind) {
      case 'meta': {
        const meta = JSON.parse(this.engine.ops_meta()) as Meta;
        this.post({ id: request.id, kind: 'meta', meta });
        return;
      }
      case 'run':
        return this.run(request.id, request.recipe, request.input);
      case 'board': {
        const bytes = await bytesOf(request.input);
        const json = this.engine.run_board(bytes, request.options);
        const rows = JSON.parse(json) as BoardRow[];
        this.post({ id: request.id, kind: 'board', rows });
        return;
      }
      case 'hash':
        return this.hash(request.id, request.ops, request.format, request.blob);
      case 'cancel':
        this.cancelled.add(request.id);
        return;
    }
  }

  private async run(id: number, recipe: string, input: Payload) {
    const result = this.engine.run(recipe, await bytesOf(input));
    const report = JSON.parse(result.report) as Report;
    const output = result.output?.buffer as ArrayBuffer | undefined;
    result.free();
    this.post(
      { id, kind: 'run', report, ...(output && { output }) },
      output ? [output] : [],
    );
  }

  private async hash(id: number, ops: string[], format: string, blob: Blob) {
    const hasher = new this.engine.Hasher(ops, format);
    for (let done = 0; done < blob.size; done += CHUNK_BYTES) {
      const chunk = blob.slice(done, done + CHUNK_BYTES);
      hasher.update(new Uint8Array(await chunk.arrayBuffer()));
      if (this.cancelled.delete(id)) {
        hasher.free();
        this.post({ id, kind: 'cancelled' });
        return;
      }
      const total = blob.size;
      this.post({ id, kind: 'progress', done: done + chunk.size, total });
    }
    this.post({ id, kind: 'hash', hashes: hasher.finish() });
  }
}

async function bytesOf(input: Payload): Promise<Uint8Array> {
  if ('bytes' in input) {
    return new Uint8Array(input.bytes);
  }
  if (input.blob.size > MAX_RUN_BYTES) {
    throw new Error(
      `The file is over ${MAX_RUN_BYTES / 1024 / 1024} MB, too large ` +
        'for a recipe. The board hashes files of any size.',
    );
  }
  return new Uint8Array(await input.blob.arrayBuffer());
}
