// The control for one operation option, built from its spec: a row of
// choices, a list, or a switch.

import type { ParamSpec, ParamValue } from '../engine/types';
import { Select } from '../ds/kerasi';
import { Segmented } from '../ds/Segmented';
import { Toggle } from '../ds/Toggle';

interface ParamControlProps {
  spec: ParamSpec;
  value: ParamValue;
  onChange: (value: ParamValue) => void;
}

export function ParamControl({ spec, value, onChange }: ParamControlProps) {
  if (spec.type === 'flag') {
    return (
      <Toggle checked={value === true} onChange={onChange}>
        {spec.name}
      </Toggle>
    );
  }
  return (
    <ChoiceControl spec={spec} value={String(value)} onChange={onChange} />
  );
}

interface ChoiceControlProps {
  spec: Extract<ParamSpec, { type: 'choice' }>;
  value: string;
  onChange: (value: string) => void;
}

/** Up to three options read best side by side; more go in a list. */
function ChoiceControl({ spec, value, onChange }: ChoiceControlProps) {
  if (spec.options.length <= 3) {
    return (
      <div className="io-box">
        <span className="overline" aria-hidden="true">
          {spec.name}
        </span>
        <Segmented
          label={spec.name}
          options={spec.options}
          value={value}
          onChange={onChange}
        />
      </div>
    );
  }
  return (
    <Select
      label={spec.name}
      value={value}
      options={spec.options.map(({ id, name }) => ({ value: id, label: name }))}
      onChange={(event: { target: { value: string } }) => {
        onChange(event.target.value);
      }}
    />
  );
}
