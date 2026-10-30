import { fireEvent, render, screen } from '@testing-library/react';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Icon } from './Icon';
import { ICONS } from './icons';
import { Segmented } from './Segmented';
import { Toggle } from './Toggle';

const COMPONENTS = resolve(process.cwd(), '../vendor/kerasi-design/components');

/** Icon names the design system's components ask for */
function vendorIconNames(): string[] {
  const names = new Set<string>();
  for (const folder of readdirSync(COMPONENTS)) {
    for (const file of readdirSync(join(COMPONENTS, folder))) {
      if (!file.endsWith('.jsx')) continue;
      const source = readFileSync(join(COMPONENTS, folder, file), 'utf8');
      const patterns = [/<Icon name="([a-z0-9-]+)"/g, /icon="([a-z0-9-]+)"/g];
      // Toast picks its icon from a table of [icon, colour] per tone
      if (file === 'Toast.jsx') {
        patterns.push(/\['([a-z0-9-]+)','var\(--/g);
      }
      for (const pattern of patterns) {
        for (const match of source.matchAll(pattern)) {
          names.add(match[1] ?? '');
        }
      }
    }
  }
  return [...names];
}

describe('Icon', () => {
  it('bundles every icon the design system components use', () => {
    const missing = vendorIconNames().filter((name) => !(name in ICONS));
    expect(missing).toEqual([]);
  });

  it('draws a bundled icon without its outer svg or comments', () => {
    const { container } = render(<Icon name="copy" size={16} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '16');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg?.innerHTML).toContain('<rect');
    expect(svg?.innerHTML).not.toContain('<svg');
    expect(svg?.innerHTML).not.toContain('@license');
  });

  it('is an image with a title, and empty for an unknown name', () => {
    const { container } = render(<Icon name="no-such-icon" title="Nothing" />);
    expect(screen.getByRole('img', { name: 'Nothing' })).toBeVisible();
    expect(container.querySelector('svg')?.innerHTML).toBe('');
  });
});

const OPTIONS = [
  { id: 'hex', name: 'hex' },
  { id: 'HEX', name: 'HEX' },
  { id: 'base64', name: 'base64' },
];

function Formats() {
  const [value, setValue] = useState('hex');
  return (
    <Segmented
      label="Format"
      options={OPTIONS}
      value={value}
      onChange={setValue}
    />
  );
}

describe('Segmented', () => {
  it('is a radio group that arrow keys move through', () => {
    render(<Formats />);
    const group = screen.getByRole('radiogroup', { name: 'Format' });
    const radios = screen.getAllByRole('radio');
    const [hex, upper, base64] = radios as [
      HTMLElement,
      HTMLElement,
      HTMLElement,
    ];
    expect(group).toBeVisible();
    expect(radios.map((r) => r.tabIndex)).toEqual([0, -1, -1]);

    fireEvent.keyDown(hex, { key: 'ArrowRight' });
    expect(screen.getByRole('radio', { name: 'HEX' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'HEX' })).toHaveFocus();

    fireEvent.keyDown(upper, { key: 'ArrowLeft' });
    fireEvent.keyDown(hex, { key: 'ArrowUp' });
    expect(screen.getByRole('radio', { name: 'base64' })).toBeChecked();
    fireEvent.keyDown(base64, { key: 'ArrowDown' });
    expect(screen.getByRole('radio', { name: 'hex' })).toBeChecked();

    fireEvent.keyDown(hex, { key: 'a' });
    fireEvent.click(screen.getByRole('radio', { name: 'base64' }));
    expect(screen.getByRole('radio', { name: 'base64' })).toBeChecked();
  });
});

describe('Toggle', () => {
  it('is a switch named by its label', () => {
    const onChange = vi.fn();
    render(
      <Toggle checked={false} onChange={onChange}>
        Padding
      </Toggle>,
    );
    const toggle = screen.getByRole('switch', { name: 'Padding' });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
