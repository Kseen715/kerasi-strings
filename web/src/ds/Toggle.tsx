// An on/off switch drawn like the design system's Switch, but as a real
// button, so it can be reached and flipped by keyboard. App-only.

import type { ReactNode } from 'react';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}

export function Toggle({ checked, onChange, children }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => {
        onChange(!checked);
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        minHeight: 44,
        padding: 0,
        background: 'transparent',
        border: 'none',
        color: 'var(--fg-1)',
        font: 'inherit',
        fontSize: 14,
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <Track on={checked} />
      {children}
    </button>
  );
}

function Track({ on }: { on: boolean }) {
  const ink = on ? 'var(--accent)' : 'var(--line-strong)';
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'relative',
        width: 38,
        height: 20,
        flex: 'none',
        background: on ? 'var(--accent)' : 'var(--bg-sunken)',
        border: `1px solid ${ink}`,
        transition: 'background var(--dur-2) var(--ease-out)',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: on ? 20 : 2,
          width: 14,
          height: 14,
          background: on ? 'var(--accent-fg)' : 'var(--fg-2)',
          transition: 'left var(--dur-2) var(--ease-out)',
        }}
      />
    </span>
  );
}
