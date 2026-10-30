// The engine worker: loads the WebAssembly once and answers requests off
// the main thread, so typing never waits for a transform.

import init, * as wasm from '../wasm/strings_wasm.js';
import { Handler } from './handler';
import type { Request } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

const ready = init();
const handler = new Handler(
  wasm,
  (response, transfer = []) => {
    self.postMessage(response, transfer);
  },
  async () => {
    const names = await import('../wasm/strings_wasm_names.js');
    await names.default();
    return names;
  },
);

self.onmessage = (event: MessageEvent<Request>) => {
  const request = event.data;
  ready.then(
    () => handler.handle(request),
    (error: unknown) => {
      self.postMessage({
        id: request.id,
        kind: 'error',
        message: `The engine did not load: ${String(error)}`,
        fatal: true,
      });
    },
  );
};
