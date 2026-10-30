// One step of the recipe: its name, options and controls. Its handle
// takes the keyboard: Delete removes the step, Alt+↑/↓ moves it.

import type { KeyboardEvent } from 'react';
import type { OpMeta, ParamValue } from '../engine/types';
import { Icon } from '../ds/Icon';
import { IconButton } from '../ds/kerasi';
import { ParamControl } from './ParamControl';
import { paramValue } from './recipe';
import type { RecipeStep } from './recipe';

/** The id of a step's handle, so the stack can give it focus */
export function handleId(uid: string): string {
  return `step-${uid}`;
}

export interface StepActions {
  onRemove: () => void;
  onMove: (by: -1 | 1) => void;
  onToggle: () => void;
  onParam: (id: string, value: ParamValue) => void;
}

interface StepCardProps extends StepActions {
  step: RecipeStep;
  op: OpMeta;
  index: number;
  count: number;
}

export function StepCard(props: StepCardProps) {
  const { step, op } = props;
  return (
    <article className={step.enabled ? 'step' : 'step step-off'}>
      <div className="step-head">
        <Handle {...props} />
        <span className="step-name">{op.name}</span>
        <StepTools {...props} />
      </div>
      {op.params.length > 0 && (
        <div className="step-body">
          {op.params.map((spec) => (
            <ParamControl
              key={spec.id}
              spec={spec}
              value={paramValue(step, spec)}
              onChange={(value) => {
                props.onParam(spec.id, value);
              }}
            />
          ))}
        </div>
      )}
    </article>
  );
}

function StepTools(props: StepCardProps) {
  const { step, index, count } = props;
  const n = index + 1;
  const button = { size: 44 } as const;
  return (
    <>
      <IconButton
        {...button}
        icon="power"
        label={`Step ${n} on`}
        active={!step.enabled}
        aria-pressed={step.enabled}
        onClick={props.onToggle}
      />
      {([-1, 1] as const).map((by) => (
        <IconButton
          key={by}
          {...button}
          icon={by < 0 ? 'arrow-up' : 'arrow-down'}
          label={`Move step ${n} ${by < 0 ? 'up' : 'down'}`}
          disabled={by < 0 ? n === 1 : n === count}
          onClick={() => {
            props.onMove(by);
          }}
        />
      ))}
      <IconButton
        {...button}
        icon="x"
        label={`Remove step ${n}`}
        onClick={props.onRemove}
      />
    </>
  );
}

const KEYS: Partial<Record<string, (props: StepCardProps) => void>> = {
  Delete: (props) => {
    props.onRemove();
  },
  Backspace: (props) => {
    props.onRemove();
  },
};

const ALT_KEYS: Partial<Record<string, -1 | 1>> = {
  ArrowUp: -1,
  ArrowDown: 1,
};

function Handle(props: StepCardProps) {
  const { op, index, step } = props;
  const onKeyDown = (event: KeyboardEvent) => {
    const by = event.altKey ? ALT_KEYS[event.key] : undefined;
    const action = KEYS[event.key];
    if (by !== undefined) {
      props.onMove(by);
    } else if (action) {
      action(props);
    } else {
      return;
    }
    event.preventDefault();
  };

  return (
    <button
      id={handleId(step.uid)}
      type="button"
      className="step-handle"
      aria-label={`Step ${index + 1}: ${op.name}${step.enabled ? '' : ', off'}`}
      aria-keyshortcuts="Delete Alt+ArrowUp Alt+ArrowDown"
      title="Delete removes the step, Alt+↑/↓ moves it"
      onKeyDown={onKeyDown}
    >
      <Icon name="grip-vertical" size={16} />
      <span className="step-num">{String(index + 1).padStart(2, '0')}</span>
    </button>
  );
}
