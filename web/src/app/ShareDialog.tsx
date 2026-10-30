// The share link of the current recipe; the input goes into it only when
// the user ticks it.

import { useMemo, useState } from 'react';
import { useEngine } from '../engine/context';
import { useLatest } from '../engine/hooks';
import type { Step } from '../engine/types';
import { Button, Dialog, Input } from '../ds/kerasi';
import { Toggle } from '../ds/Toggle';
import type { Input as InputState } from './input';
import { shareUrl } from './share';
import { useCopy } from './toasts';

interface ShareDialogProps {
  steps: Step[];
  input: InputState;
  onClose: () => void;
}

export function ShareDialog({ steps, input, onClose }: ShareDialogProps) {
  const copy = useCopy();
  const [withInput, setWithInput] = useState(false);
  const text = input.kind === 'text' ? input.text : undefined;
  const link = useShareLink(steps, withInput ? text : undefined);

  const copyLink = (
    <Button
      icon="copy"
      disabled={!link}
      onClick={() => {
        copy(link, 'the link');
      }}
    >
      Copy link
    </Button>
  );
  return (
    <Dialog
      open
      title="Share link"
      eyebrow="Recipe"
      onClose={onClose}
      actions={copyLink}
    >
      <div className="dialog-stack">
        <p style={{ margin: 0 }}>
          The recipe travels after the # of the link, a part browsers never send
          to a server.
        </p>
        <Toggle checked={withInput} onChange={setWithInput}>
          Include the input in the link
        </Toggle>
        {text === undefined && withInput && (
          <p className="notice">A file input is never put in a link.</p>
        )}
        <Input label="Link" mono readOnly value={link} />
      </div>
    </Dialog>
  );
}

function useShareLink(steps: Step[], input: string | undefined): string {
  const engine = useEngine();
  const task = useMemo(() => {
    const page = location.origin + location.pathname;
    const shared = input === undefined ? { steps } : { steps, input };
    return () => shareUrl(engine, page, shared);
  }, [engine, steps, input]);
  return useLatest(task).value ?? '';
}
