// The real engine for the tests: the WebAssembly loaded in Node and a
// worker stand-in that runs the handler in the same thread.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as wasm from '../wasm/strings_wasm.js';
import * as namesWasm from '../wasm/strings_wasm_names.js';
import { EngineClient } from './client';
import type { WorkerLike } from './client';
import { Handler } from './handler';
import type { Response } from './protocol';

const loaded = new Set<string>();

function load<T extends typeof wasm>(module: T, name: string): T {
  if (!loaded.has(name)) {
    // Vitest runs in web/; import.meta.url is not a file: URL under jsdom
    const file = resolve(process.cwd(), `src/wasm/${name}_bg.wasm`);
    module.initSync({ module: readFileSync(file) });
    loaded.add(name);
  }
  return module;
}

export function loadEngine(): typeof wasm {
  return load(wasm, 'strings_wasm');
}

/** The engine with the Unicode name table */
export function loadNamesEngine(): typeof namesWasm {
  return load(namesWasm, 'strings_wasm_names');
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
  const handler = new Handler(
    loadEngine(),
    (response) => {
      // A real worker answers in a later task, never synchronously
      setTimeout(() => {
        worker.onmessage?.({ data: response } as MessageEvent<Response>);
      });
    },
    () => Promise.resolve(loadNamesEngine()),
  );
  return worker;
}

export function testEngine(): EngineClient {
  return new EngineClient(inProcessWorker);
}
