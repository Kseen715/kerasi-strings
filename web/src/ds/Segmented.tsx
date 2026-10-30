// A row of mutually exclusive options (the "hex · HEX · base64" control in
// the design). App-only: the design system's Radio is not reachable by
// keyboard. Arrow keys move the choice, as in a native radio group.

import type { KeyboardEvent } from 'react';
import { useRef } from 'react';

export interface SegmentedOption {
  id: string;
  name: string;
}

interface SegmentedProps {
  label: string;
  options: SegmentedOption[];
  value: string;
  onChange: (value: string) => void;
  full?: boolean;
}

const STEP: Partial<Record<string, number>> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

export function Segmented({
  label,
  options,
  value,
  onChange,
  full,
}: SegmentedProps) {
  const group = useRef<HTMLDivElement>(null);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = STEP[event.key];
    if (step === undefined) {
      return;
    }
    event.preventDefault();
    const current = options.findIndex((option) => option.id === value);
    const next = (current + step + options.length) % options.length;
    onChange(options[next]?.id ?? value);
    group.current?.querySelectorAll('button')[next]?.focus();
  };

  return (
    <div
      ref={group}
      role="radiogroup"
      aria-label={label}
      style={{ display: 'flex', width: full ? '100%' : undefined }}
    >
      {options.map((option, i) => (
        <SegmentButton
          key={option.id}
          option={option}
          checked={option.id === value}
          first={i === 0}
          onSelect={onChange}
          onKeyDown={onKeyDown}
        />
      ))}
    </div>
  );
}

interface SegmentButtonProps {
  option: SegmentedOption;
  checked: boolean;
  first: boolean;
  onSelect: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}

function SegmentButton(props: SegmentButtonProps) {
  const { option, checked, first, onSelect } = props;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      tabIndex={checked ? 0 : -1}
      onKeyDown={props.onKeyDown}
      onClick={() => {
        onSelect(option.id);
      }}
      style={{
        flex: 1,
        minHeight: 44,
        padding: '0 12px',
        background: checked ? 'var(--fg-1)' : 'transparent',
        color: checked ? 'var(--bg)' : 'var(--fg-1)',
        border: `1px solid ${checked ? 'var(--fg-1)' : 'var(--line-strong)'}`,
        borderLeftWidth: first ? 1 : 0,
        fontFamily: 'var(--font-mono)',
        fontSize: 13,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {option.name}
    </button>
  );
}
