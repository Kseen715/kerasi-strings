// The real engine for the tests: the WebAssembly loaded in Node and a
// worker stand-in that runs the handler in the same thread.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as wasm from '../wasm/strings_wasm.js';
import { EngineClient } from './client';
import type { WorkerLike } from './client';
import { Handler } from './handler';
import type { Response } from './protocol';

let loaded = false;

export function loadEngine(): typeof wasm {
  if (!loaded) {
    // Vitest runs in web/; import.meta.url is not a file: URL under jsdom
    const file = resolve(process.cwd(), 'src/wasm/strings_wasm_bg.wasm');
    wasm.initSync({ module: readFileSync(file) });
    loaded = true;
  }
  return wasm;
}

export function inProcessWorker(): WorkerLike {
  const worker: WorkerLike = {
    onmessage: null,
    postMessage(message) {
      void handler.handle(message);
    },
    terminate() {
      worker.onmessage = null;
    },
  };
  const handler = new Handler(loadEngine(), (response) => {
    // A real worker answers in a later task, never synchronously
    setTimeout(() => {
      worker.onmessage?.({ data: response } as MessageEvent<Response>);
    });
  });
  return worker;
}

export function testEngine(): EngineClient {
  return new EngineClient(inProcessWorker);
}
