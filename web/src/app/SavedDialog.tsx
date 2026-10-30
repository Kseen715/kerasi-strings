// Recipes saved on this device: save the current one under a name, load
// or delete the others.

import { useState } from 'react';
import type { Step } from '../engine/types';
import { Button, Dialog, Input, TOUCH } from '../ds/kerasi';
import { isStepList } from './recipe';

export interface SavedRecipe {
  name: string;
  steps: Step[];
}

export function isSavedList(value: unknown): value is SavedRecipe[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item: Partial<Record<keyof SavedRecipe, unknown>>) =>
        typeof item.name === 'string' && isStepList(item.steps),
    )
  );
}

interface SavedDialogProps {
  saved: SavedRecipe[];
  steps: Step[];
  onSaved: (saved: SavedRecipe[]) => void;
  onLoad: (steps: Step[]) => void;
  onClose: () => void;
}

export function SavedDialog(props: SavedDialogProps) {
  const { saved, onSaved } = props;
  const save = (name: string) => {
    const others = saved.filter((recipe) => recipe.name !== name);
    onSaved([...others, { name, steps: props.steps }]);
  };

  return (
    <Dialog
      open
      title="Saved recipes"
      eyebrow="This device"
      onClose={props.onClose}
    >
      <div className="dialog-stack">
        <SaveForm canSave={props.steps.length > 0} onSave={save} />
        <SavedList {...props} />
      </div>
    </Dialog>
  );
}

interface SaveFormProps {
  canSave: boolean;
  onSave: (name: string) => void;
}

function SaveForm({ canSave, onSave }: SaveFormProps) {
  const [name, setName] = useState('');
  const trimmed = name.trim();
  return (
    <form
      className="pane-head"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(trimmed);
        setName('');
      }}
    >
      <Input
        label="Name"
        value={name}
        onChange={(event: { target: { value: string } }) => {
          setName(event.target.value);
        }}
        style={{ flex: 1 }}
      />
      <Button
        type="submit"
        icon="save"
        disabled={!trimmed || !canSave}
        style={{ alignSelf: 'flex-end', ...TOUCH }}
      >
        Save current
      </Button>
    </form>
  );
}

function SavedList({ saved, onSaved, onLoad }: SavedDialogProps) {
  if (saved.length === 0) {
    return <p className="notice">Nothing saved yet.</p>;
  }
  const tool = { variant: 'ghost', size: 'sm', style: TOUCH } as const;
  return (
    <ul className="saved-list">
      {saved.map(({ name, steps }) => (
        <li key={name} className="saved-item">
          <span style={{ flex: 1 }}>{name}</span>
          <Button
            {...tool}
            aria-label={`Load ${name}`}
            onClick={() => {
              onLoad(steps);
            }}
          >
            Load
          </Button>
          <Button
            {...tool}
            aria-label={`Delete ${name}`}
            onClick={() => {
              onSaved(saved.filter((recipe) => recipe.name !== name));
            }}
          >
            Delete
          </Button>
        </li>
      ))}
    </ul>
  );
}
