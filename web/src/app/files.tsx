// Opening files: the "Open file" button, dropping a file on an input,
// and the chip that stands for a file input.

import { useCallback, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { useEngine } from '../engine/context';
import { Button, IconButton, TOUCH } from '../ds/kerasi';
import { formatBytes } from './format';
import { inputFromFile } from './input';
import type { Input } from './input';
import { useNotify } from './toasts';

export function useOpenFile(onInput: (input: Input) => void) {
  const engine = useEngine();
  const notify = useNotify();
  return useCallback(
    (file: File) => {
      inputFromFile(engine, file).then(onInput, (error: unknown) => {
        notify(`Could not open the file: ${String(error)}`, 'danger');
      });
    },
    [engine, notify, onInput],
  );
}

export function useDrop(onFile: (file: File) => void) {
  const [dropping, setDropping] = useState(false);
  const onDragOver = (event: DragEvent) => {
    if (event.dataTransfer.types.includes('Files')) {
      event.preventDefault();
      setDropping(true);
    }
  };
  const onDragLeave = () => {
    setDropping(false);
  };
  const onDrop = (event: DragEvent) => {
    const file = event.dataTransfer.files[0];
    setDropping(false);
    if (file) {
      event.preventDefault();
      onFile(file);
    }
  };
  return { dropping, handlers: { onDragOver, onDragLeave, onDrop } };
}

interface OpenFileProps {
  onFile: (file: File) => void;
  /** A plain button with this class instead of a Kerasi button */
  className?: string;
}

/** A visible button for a hidden file input, which is hard to style. */
export function OpenFile({ onFile, className }: OpenFileProps) {
  const picker = useRef<HTMLInputElement>(null);
  const open = () => picker.current?.click();
  return (
    <>
      <input
        ref={picker}
        type="file"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="file-input"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            onFile(file);
          }
          event.target.value = '';
        }}
      />
      {className ? (
        <button type="button" className={className} onClick={open}>
          Open file
        </button>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          icon="upload"
          style={TOUCH}
          onClick={open}
        >
          Open file
        </Button>
      )}
    </>
  );
}

interface FileChipProps {
  name: string;
  size: number;
  onClear: () => void;
}

export function FileChip({ name, size, onClear }: FileChipProps) {
  return (
    <div className="file-chip">
      <span className="file-name">{name}</span>
      <span className="mono">{formatBytes(size)}</span>
      <IconButton
        icon="x"
        label="Clear the file"
        size={44}
        onClick={onClear}
        style={{ color: 'inherit' }}
      />
    </div>
  );
}
