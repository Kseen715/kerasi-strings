// The messages between the UI and the engine worker.

import type { BoardRow, Meta, Report } from './types';

/** Typed text arrives as bytes (transferred, not copied), files as blobs */
export type Payload = { bytes: ArrayBuffer } | { blob: Blob };

export type Request =
  | { id: number; kind: 'meta' }
  | { id: number; kind: 'run'; recipe: string; input: Payload }
  | { id: number; kind: 'board'; options: string; input: Payload }
  | { id: number; kind: 'hash'; ops: string[]; format: string; blob: Blob }
  | { id: number; kind: 'cancel' };

export type Response =
  | { id: number; kind: 'meta'; meta: Meta }
  | { id: number; kind: 'run'; report: Report; output?: ArrayBuffer }
  | { id: number; kind: 'board'; rows: BoardRow[] }
  | { id: number; kind: 'progress'; done: number; total: number }
  | { id: number; kind: 'hash'; hashes: string[] }
  | { id: number; kind: 'cancelled' }
  | { id: number; kind: 'error'; message: string; fatal: boolean };

export type Post = (response: Response, transfer?: Transferable[]) => void;
