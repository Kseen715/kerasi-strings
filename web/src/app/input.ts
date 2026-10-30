// The input both modes share: typed text, or a file too large or too
// binary to edit as text.

import type { EngineClient } from '../engine/client';
import type { RunReply, Source } from '../engine/types';

export type Input =
  { kind: 'text'; text: string } | { kind: 'file'; blob: Blob; name: string };

/** Above this size the board waits for "Run" instead of running live */
export const LIVE_BYTES = 1024 * 1024;

/** Dropped files up to this size that are valid text become text */
export const TEXT_FILE_BYTES = 1024 * 1024;

export const EMPTY: Input = { kind: 'text', text: '' };

export function sourceOf(input: Input): Source {
  return input.kind === 'text' ? { text: input.text } : { blob: input.blob };
}

export function sizeOf(input: Input): number {
  return input.kind === 'text'
    ? new TextEncoder().encode(input.text).length
    : input.blob.size;
}

/** A small text file is opened as text; the engine tells whether its
 * bytes are valid UTF-8 by rendering them. */
export async function inputFromFile(
  engine: EngineClient,
  file: File,
): Promise<Input> {
  if (file.size <= TEXT_FILE_BYTES) {
    const reply = await engine.runOnce([], { blob: file });
    const shown = reply.report.output;
    if (shown?.text) {
      return { kind: 'text', text: shown.value };
    }
  }
  return { kind: 'file', blob: file, name: file.name };
}

export function inputFromOutput(reply: RunReply): Input | undefined {
  const shown = reply.report.output;
  if (!shown || !reply.output) {
    return undefined;
  }
  if (shown.text) {
    return { kind: 'text', text: shown.value };
  }
  const bytes = new Uint8Array(reply.output);
  return { kind: 'file', blob: new Blob([bytes]), name: 'output.bin' };
}
