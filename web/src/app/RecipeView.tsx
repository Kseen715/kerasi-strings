// Recipe mode (layout A): the operations, the recipe built from them,
// and the input running through it with a trace of every step.

import { useMemo } from 'react';
import { useEngine } from '../engine/context';
import { useDebounced, useLatest } from '../engine/hooks';
import type { Meta } from '../engine/types';
import { DEBOUNCE_MS } from './BoardView';
import { IoPanel } from './IoPanel';
import { OpList } from './OpList';
import { RecipeStack } from './RecipeStack';
import { sourceOf } from './input';
import type { Input } from './input';
import { opsById } from './meta';
import { newStep, toEngine } from './recipe';
import type { RecipeStep } from './recipe';

interface RecipeViewProps {
  meta: Meta;
  steps: RecipeStep[];
  onSteps: (steps: RecipeStep[]) => void;
  input: Input;
  onInput: (input: Input) => void;
  onShare: () => void;
  onSaved: () => void;
}

export function RecipeView(props: RecipeViewProps) {
  const { meta, steps, onSteps, input } = props;
  const engine = useEngine();
  const ops = useMemo(() => opsById(meta), [meta]);
  const used = useMemo(() => new Set(steps.map((s) => s.op)), [steps]);
  const engineSteps = useMemo(() => toEngine(steps), [steps]);
  const debounced = useDebounced(input, DEBOUNCE_MS);

  const task = useMemo(
    () => () => engine.run(engineSteps, sourceOf(debounced)),
    [engine, engineSteps, debounced],
  );
  const run = useLatest(task);

  return (
    <main className="workspace">
      <OpList
        meta={meta}
        used={used}
        onAdd={(op) => {
          onSteps([...steps, newStep(op)]);
        }}
      />
      <RecipeStack
        ops={ops}
        steps={steps}
        onSteps={onSteps}
        onShare={props.onShare}
        onSaved={props.onSaved}
      />
      <IoPanel
        ops={ops}
        steps={engineSteps}
        input={input}
        onInput={props.onInput}
        run={run}
      />
    </main>
  );
}
