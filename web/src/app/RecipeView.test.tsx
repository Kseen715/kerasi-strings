import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test/app';

async function openRecipe() {
  const app = await renderApp();
  await app.user.click(screen.getByRole('button', { name: 'Recipe' }));
  return app;
}

function output() {
  return screen.getByRole('status', { name: '04 — Output' });
}

function typeInput(text: string) {
  fireEvent.change(screen.getByLabelText('03 — Input'), {
    target: { value: text },
  });
}

describe('recipe mode', () => {
  it('chains steps added from the list and traces each', async () => {
    const { user } = await openRecipe();
    await user.click(screen.getByRole('button', { name: 'Add Fix layout' }));
    await user.click(screen.getByRole('button', { name: 'Add Title Case' }));
    typeInput('ghbdtn vbh');

    await waitFor(() => {
      expect(output()).toHaveTextContent('Привет Мир');
    });
    const trace = screen.getByRole('heading', { name: '05 — Step trace' })
      .nextElementSibling as HTMLElement;
    const rows = within(trace).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Fix layout');
    expect(rows[0]).toHaveTextContent('привет мир');
    expect(rows[1]).toHaveTextContent('Привет Мир');
    expect(screen.getByText('02 — Recipe · 2 steps')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Add Fix layout' }).className,
    ).toContain('op-item-used');
  });

  it('filters the operation list', async () => {
    const { user } = await openRecipe();
    await user.type(screen.getByLabelText('Filter operations'), 'sha-2');
    const ops = screen.getByRole('navigation', { name: 'Operations' });
    const found = within(ops).getAllByRole('button');
    expect(found.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Add SHA-224',
      'Add SHA-256',
    ]);
    await user.clear(screen.getByLabelText('Filter operations'));
    await user.type(screen.getByLabelText('Filter operations'), 'zzz');
    expect(screen.getByText('No operation matches.')).toBeVisible();
  });

  it('edits options, turns steps off, keeps the input', async () => {
    const { user } = await openRecipe();
    await user.click(screen.getByRole('button', { name: 'Add Base64 encode' }));
    typeInput('?>?');
    await waitFor(() => {
      expect(output()).toHaveTextContent('Pz4/');
    });

    await user.click(screen.getByRole('radio', { name: 'URL-safe' }));
    await waitFor(() => {
      expect(output()).toHaveTextContent('Pz4_');
    });
    await user.click(screen.getByRole('switch', { name: 'Padding (=)' }));
    await user.click(screen.getByRole('button', { name: 'Step 1 on' }));
    await waitFor(() => {
      expect(output()).toHaveTextContent('?>?');
    });
    expect(screen.getByText('off')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Board' }));
    expect(screen.getByLabelText(/01 — Input/)).toHaveValue('?>?');
    await user.click(screen.getByRole('button', { name: 'Recipe' }));
    expect(screen.getByLabelText('03 — Input')).toHaveValue('?>?');
  });

  it('reorders and removes steps by keyboard', async () => {
    const { user } = await openRecipe();
    await user.click(screen.getByRole('button', { name: 'Add UPPER CASE' }));
    await user.click(screen.getByRole('button', { name: 'Add snake_case' }));
    const second = screen.getByRole('button', { name: 'Step 2: snake_case' });
    second.focus();
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}');

    const first = screen.getByRole('button', { name: 'Step 1: snake_case' });
    expect(first).toHaveFocus();
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
    expect(
      screen.getByRole('button', { name: 'Step 2: snake_case' }),
    ).toHaveFocus();

    await user.keyboard('{Delete}');
    expect(
      screen.getByRole('button', { name: 'Step 1: UPPER CASE' }),
    ).toHaveFocus();
    await user.keyboard('x');
    expect(screen.getByText('02 — Recipe · 1 step')).toBeVisible();
  });

  it('moves and removes steps with the buttons, then clears', async () => {
    const { user } = await openRecipe();
    await user.click(screen.getByRole('button', { name: 'Add UPPER CASE' }));
    await user.click(screen.getByRole('button', { name: 'Add flatcase' }));
    expect(
      screen.getByRole('button', { name: 'Move step 1 up' }),
    ).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Move step 1 down' }));
    expect(
      screen.getByRole('button', { name: 'Step 1: flatcase' }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Remove step 2' }));
    expect(screen.getByText('02 — Recipe · 1 step')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByText(/Add an operation from the list/)).toBeVisible();
  });

  it('names the failing step, then offers the output', async () => {
    const { user } = await openRecipe();
    await user.click(screen.getByRole('button', { name: 'Add Base64 decode' }));
    await user.click(screen.getByRole('button', { name: 'Add UPPER CASE' }));
    typeInput('Zm9v!');
    expect(
      await screen.findByText(
        'Step 1 (Base64 decode) failed: ' +
          "Invalid Base64 character '!' at offset 4",
      ),
    ).toBeVisible();
    expect(screen.getByText('not run')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Use as input' })).toBeDisabled();

    typeInput('Zm9v');
    await waitFor(() => {
      expect(output()).toHaveTextContent('FOO');
    });
    await user.click(screen.getByRole('button', { name: 'Use as input' }));
    expect(screen.getByLabelText('03 — Input')).toHaveValue('FOO');
  });

  it('shows binary output as hex with a download', async () => {
    const { user } = await openRecipe();
    await user.click(screen.getByRole('button', { name: 'Add Base64 decode' }));
    typeInput('3q2+7w==');
    await waitFor(() => {
      expect(output()).toHaveTextContent('de ad be ef');
    });
    expect(screen.getByText('Binary, 4 B, shown as hex')).toBeVisible();
    const created = vi.fn(() => 'blob:test');
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: created,
        revokeObjectURL: vi.fn(),
      }),
    );
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    await user.click(screen.getByRole('button', { name: 'Download' }));
    expect(created).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Use as input' }));
    expect(screen.getByText('output.bin')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Clear the file' }));
    expect(screen.getByLabelText('03 — Input')).toHaveValue('');
  });

  it('copies the output', async () => {
    const { user } = await openRecipe();
    typeInput('as is');
    await waitFor(() => {
      expect(output()).toHaveTextContent('as is');
    });
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(await screen.findByText('Copied the output')).toBeVisible();
  });
});
