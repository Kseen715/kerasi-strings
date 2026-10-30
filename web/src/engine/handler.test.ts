import { describe, expect, it, vi } from 'vitest';
import { CHUNK_BYTES, Handler, MAX_RUN_BYTES } from './handler';
import type { Engine, LoadNames } from './handler';
import type { Request, Response } from './protocol';
import { loadEngine, loadNamesEngine } from './testing';

function bytes(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer;
}

const names = () => Promise.resolve(loadNamesEngine());

async function answers(
  request: Request,
  engine: Engine = loadEngine(),
  loadNames: LoadNames = names,
) {
  const posted: Response[] = [];
  const handler = new Handler(engine, (r) => posted.push(r), loadNames);
  await handler.handle(request);
  return posted;
}

describe('Handler', () => {
  it('answers with the parsed metadata', async () => {
    const [response] = await answers({ id: 1, kind: 'meta' });
    expect(response).toMatchObject({ id: 1, kind: 'meta' });
    if (response?.kind !== 'meta') throw new Error('no meta');
    expect(response.meta.ops.map((op) => op.id)).toContain('case.snake');
  });

  it('runs a recipe and transfers its output', async () => {
    const recipe = JSON.stringify([{ op: 'case.snake', enabled: true }]);
    const input = { bytes: bytes('Foo Bar') };
    const [response] = await answers({ id: 2, kind: 'run', recipe, input });
    if (response?.kind !== 'run') throw new Error('no run');
    expect(response.report.output?.value).toBe('foo_bar');
    expect(new TextDecoder().decode(response.output)).toBe('foo_bar');
  });

  it('runs a recipe on a file', async () => {
    const input = { blob: new Blob(['abc']) };
    const recipe = JSON.stringify([{ op: 'hash.md5', enabled: true }]);
    const [response] = await answers({ id: 3, kind: 'run', recipe, input });
    if (response?.kind !== 'run') throw new Error('no run');
    expect(response.report.output?.value).toBe(
      '900150983cd24fb0d6963f7d28e17f72',
    );
  });

  it('refuses files too large for a recipe', async () => {
    const blob = { size: MAX_RUN_BYTES + 1 } as Blob;
    const [response] = await answers({
      id: 4,
      kind: 'run',
      recipe: '[]',
      input: { blob },
    });
    expect(response).toMatchObject({ kind: 'error', fatal: false });
    if (response?.kind !== 'error') throw new Error('no error');
    expect(response.message).toMatch(/too large for a recipe/);
  });

  it('answers the board as rows', async () => {
    const [response] = await answers({
      id: 5,
      kind: 'board',
      options: '{"format":"HEX"}',
      input: { bytes: bytes('abc') },
    });
    if (response?.kind !== 'board') throw new Error('no board');
    const md5 = response.rows.find((row) => row.id === 'hash.md5');
    expect(md5?.output?.value).toBe('900150983CD24FB0D6963F7D28E17F72');
  });

  it('hashes a file in chunks with progress', async () => {
    const blob = new Blob([new Uint8Array(CHUNK_BYTES + 10)]);
    const posted = await answers({
      id: 6,
      kind: 'hash',
      ops: ['hash.sha256'],
      format: 'hex',
      blob,
    });
    expect(posted.map((r) => r.kind)).toEqual(['progress', 'progress', 'hash']);
    expect(posted[1]).toMatchObject({ done: blob.size, total: blob.size });
  });

  it('stops a cancelled hash after the current chunk', async () => {
    const posted: Response[] = [];
    const handler = new Handler(loadEngine(), (r) => posted.push(r), names);
    const blob = new Blob([new Uint8Array(CHUNK_BYTES * 3)]);
    const hashing = handler.handle({
      id: 7,
      kind: 'hash',
      ops: ['hash.md5'],
      format: 'hex',
      blob,
    });
    await handler.handle({ id: 7, kind: 'cancel' });
    await hashing;
    expect(posted.at(-1)).toEqual({ id: 7, kind: 'cancelled' });
  });

  it('loads the name table once, when a decode first meets \\N{', async () => {
    const posted: Response[] = [];
    const loadNames = vi.fn(names);
    const handler = new Handler(loadEngine(), (r) => posted.push(r), loadNames);
    const recipe = JSON.stringify([{ op: 'unicode.decode', enabled: true }]);
    const run = (id: number, text: string) =>
      handler.handle({
        id,
        kind: 'run',
        recipe,
        input: { bytes: bytes(text) },
      });

    await run(11, 'plain');
    expect(loadNames).not.toHaveBeenCalled();
    await run(12, String.raw`\N{BULLET} \N{bullet}`);
    await run(13, String.raw`\N{EM DASH}`);
    expect(loadNames).toHaveBeenCalledOnce();
    const outputs = posted.map((r) => r.kind === 'run' && r.report.output);
    expect(outputs.map((o) => o && o.value)).toEqual(['plain', '• •', '—']);
  });

  it('reads names on the board too', async () => {
    const [response] = await answers({
      id: 14,
      kind: 'board',
      options: '{}',
      input: { bytes: bytes(String.raw`\N{BULLET}`) },
    });
    if (response?.kind !== 'board') throw new Error('no board');
    const row = response.rows.find((r) => r.id === 'unicode.decode');
    expect(row?.output?.value).toBe('•');
  });

  it('keeps the error when the name table does not load', async () => {
    const [response] = await answers(
      {
        id: 15,
        kind: 'board',
        options: '{}',
        input: { bytes: bytes(String.raw`\N{BULLET}`) },
      },
      loadEngine(),
      () => Promise.reject(new Error('offline')),
    );
    if (response?.kind !== 'board') throw new Error('no board');
    const row = response.rows.find((r) => r.id === 'unicode.decode');
    expect(row?.error?.message).toMatch(/needs the Unicode name table/);
  });

  it('reports a bad recipe as an error that is not fatal', async () => {
    const [response] = await answers({
      id: 8,
      kind: 'run',
      recipe: '{',
      input: { bytes: bytes('') },
    });
    expect(response).toMatchObject({ id: 8, kind: 'error', fatal: false });
  });

  it('reports a trap as fatal', async () => {
    const engine = {
      ...loadEngine(),
      ops_meta: vi.fn(() => {
        throw new WebAssembly.RuntimeError('unreachable');
      }),
    } as Engine;
    const [response] = await answers({ id: 9, kind: 'meta' }, engine);
    expect(response).toEqual({
      id: 9,
      kind: 'error',
      message: 'unreachable',
      fatal: true,
    });
  });

  it('reports a thrown value that is not an Error', async () => {
    const engine = {
      ...loadEngine(),
      ops_meta: () => {
        // A non-Error on purpose: the handler must report those too
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'broken';
      },
    } as unknown as Engine;
    const [response] = await answers({ id: 10, kind: 'meta' }, engine);
    expect(response).toMatchObject({ message: 'broken', fatal: false });
  });
});
