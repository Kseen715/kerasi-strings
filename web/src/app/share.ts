// Share links carry the recipe, and the input only when the user asks, in
// the URL fragment (#r=…&i=…), which browsers never send to a server.
// The engine does the Base64url, like every other string operation.

import type { EngineClient } from '../engine/client';
import type { Step } from '../engine/types';
import { isStepList } from './recipe';

const ENCODE: Step[] = [
  {
    op: 'base64.encode',
    params: { alphabet: 'url', padding: false },
    enabled: true,
  },
];

const DECODE: Step[] = [
  { op: 'base64.decode', params: { alphabet: 'url' }, enabled: true },
];

export interface Shared {
  steps: Step[];
  input?: string;
}

async function encode(engine: EngineClient, text: string): Promise<string> {
  const reply = await engine.runOnce(ENCODE, { text });
  return reply.report.output?.value ?? '';
}

async function decode(engine: EngineClient, text: string) {
  const reply = await engine.runOnce(DECODE, { text });
  const output = reply.report.output;
  return output?.text ? output.value : undefined;
}

export async function shareUrl(
  engine: EngineClient,
  page: string,
  { steps, input }: Shared,
): Promise<string> {
  const fragment = new URLSearchParams({
    r: await encode(engine, JSON.stringify(steps)),
  });
  if (input !== undefined) {
    fragment.set('i', await encode(engine, input));
  }
  return `${page}#${fragment.toString()}`;
}

/** The recipe and input in a fragment; `null` when there is none or it
 * does not read as one. */
export async function readShare(
  engine: EngineClient,
  hash: string,
): Promise<Shared | null> {
  const fragment = new URLSearchParams(hash.replace(/^#/, ''));
  const recipe = fragment.get('r');
  if (recipe === null) {
    return null;
  }

  const json = await decode(engine, recipe);
  const steps = json === undefined ? undefined : parse(json);
  if (!isStepList(steps)) {
    return null;
  }
  const encodedInput = fragment.get('i');
  const input =
    encodedInput === null ? undefined : await decode(engine, encodedInput);
  return input === undefined ? { steps } : { steps, input };
}

function parse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}
