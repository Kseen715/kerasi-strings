// The recipe in recipe mode: its steps in order, with the tools that act
// on the whole recipe (share, saved recipes, clear).

import { useEffect, useRef } from 'react';
import type { OpMeta } from '../engine/types';
import { Button, IconButton, TOUCH } from '../ds/kerasi';
import { StepCard, handleId } from './StepCard';
import type { StepActions } from './StepCard';
import { moveStep, opOf, removeStep, setParam, updateStep } from './recipe';
import type { RecipeStep } from './recipe';

interface RecipeStackProps {
  ops: Map<string, OpMeta>;
  steps: RecipeStep[];
  onSteps: (steps: RecipeStep[]) => void;
  onShare: () => void;
  onSaved: () => void;
}

export function RecipeStack(props: RecipeStackProps) {
  const { ops, steps } = props;
  const actions = useStepActions(steps, props.onSteps);

  return (
    <section aria-label="Recipe" className="pane pane-recipe">
      <StackHead {...props} />
      {steps.length === 0 ? (
        <p className="empty">
          Add an operation from the list, or press <kbd>Ctrl K</kbd>
        </p>
      ) : (
        <ol className="steps">
          {steps.map((step, index) => (
            <li key={step.uid}>
              <StepCard
                step={step}
                op={opOf(ops, step)}
                index={index}
                count={steps.length}
                {...actions(step, index)}
              />
            </li>
          ))}
        </ol>
      )}
      <div className="live">
        <span className="live-dot" aria-hidden="true" />
        Live — recalculates as you type
      </div>
    </section>
  );
}

/** A moved or removed step loses focus; it goes back to the handle of
 * the step that now stands there, so the keyboard flow continues. */
function useHandleFocus(steps: RecipeStep[]) {
  const focusNext = useRef<string>(undefined);
  useEffect(() => {
    const uid = focusNext.current;
    focusNext.current = undefined;
    if (uid !== undefined) {
      document.getElementById(handleId(uid))?.focus();
    }
  }, [steps]);
  return focusNext;
}

function useStepActions(
  steps: RecipeStep[],
  onSteps: (steps: RecipeStep[]) => void,
) {
  const focusNext = useHandleFocus(steps);

  const of = (step: RecipeStep, index: number): StepActions => {
    const edit = (change: (step: RecipeStep) => RecipeStep) => {
      onSteps(updateStep(steps, step.uid, change));
    };
    return {
      onRemove: () => {
        focusNext.current = (steps[index + 1] ?? steps[index - 1])?.uid;
        onSteps(removeStep(steps, step.uid));
      },
      onMove: (by) => {
        focusNext.current = step.uid;
        onSteps(moveStep(steps, step.uid, by));
      },
      onToggle: () => {
        edit((s) => ({ ...s, enabled: !s.enabled }));
      },
      onParam: (id, value) => {
        edit((s) => setParam(s, id, value));
      },
    };
  };

  return of;
}

function StackHead({ steps, onSteps, onShare, onSaved }: RecipeStackProps) {
  const count = steps.length;
  const tool = { variant: 'ghost', size: 'sm', style: TOUCH } as const;
  return (
    <div className="pane-head">
      <span className="overline">
        02 — Recipe · {count} {count === 1 ? 'step' : 'steps'}
      </span>
      <div className="pane-tools">
        <IconButton
          icon="share-2"
          label="Share link"
          size={44}
          onClick={onShare}
        />
        <Button {...tool} icon="save" onClick={onSaved}>
          Saved
        </Button>
        <Button
          {...tool}
          icon="trash-2"
          disabled={count === 0}
          onClick={() => {
            onSteps([]);
          }}
        >
          Clear
        </Button>
      </div>
    </div>
  );
}
