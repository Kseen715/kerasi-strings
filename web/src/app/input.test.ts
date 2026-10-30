import { describe, expect, it } from 'vitest';
import { testEngine } from '../engine/testing';
import {
  EMPTY,
  TEXT_FILE_BYTES,
  inputFromFile,
  inputFromOutput,
  sizeOf,
  sourceOf,
} from './input';

const engine = testEngine();

describe('input', () => {
  it('becomes a source for the engine', () => {
    const blob = new Blob(['x']);
    expect(sourceOf({ kind: 'text', text: 'a' })).toEqual({ text: 'a' });
    expect(sourceOf({ kind: 'file', blob, name: 'x' })).toEqual({ blob });
    expect(sizeOf({ kind: 'text', text: 'ß' })).toBe(2);
    expect(sizeOf({ kind: 'file', blob, name: 'x' })).toBe(1);
    expect(sizeOf(EMPTY)).toBe(0);
  });

  it('opens small text files as text', async () => {
    const file = new File(['привет'], 'hi.txt');
    await expect(inputFromFile(engine, file)).resolves.toEqual({
      kind: 'text',
      text: 'привет',
    });
  });

  it('keeps binary and large files as files', async () => {
    const binary = new File([new Uint8Array([0xff, 0xfe])], 'x.bin');
    await expect(inputFromFile(engine, binary)).resolves.toMatchObject({
      kind: 'file',
      name: 'x.bin',
    });

    const large = new File([new Uint8Array(TEXT_FILE_BYTES + 1)], 'big');
    await expect(inputFromFile(engine, large)).resolves.toMatchObject({
      kind: 'file',
      blob: large,
    });
  });

  it('turns output back into input', async () => {
    const text = await engine.runOnce([], { text: 'out' });
    expect(inputFromOutput(text)).toEqual({ kind: 'text', text: 'out' });

    const decode = [{ op: 'base64.decode', params: {}, enabled: true }];
    const binary = await engine.runOnce(decode, { text: '/w==' });
    const next = inputFromOutput(binary);
    expect(next).toMatchObject({ kind: 'file', name: 'output.bin' });
    if (next?.kind !== 'file') throw new Error('no file');
    expect(new Uint8Array(await next.blob.arrayBuffer())).toEqual(
      new Uint8Array([0xff]),
    );

    const failed = await engine.runOnce(decode, { text: '!' });
    expect(inputFromOutput(failed)).toBeUndefined();
  });
});
