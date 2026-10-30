import { render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EngineClient } from '../engine/client';
import type { WorkerLike } from '../engine/client';
import type { Response } from '../engine/protocol';
import { EngineProvider } from '../engine/context';
import { testEngine } from '../engine/testing';
import { renderApp } from '../test/app';
import { App } from './App';
import { shareUrl } from './share';
import { load, save } from './storage';

function stepNames() {
  return screen
    .queryAllByRole('button', { name: /^Step \d+: / })
    .map((handle) => handle.getAttribute('aria-label'));
}

describe('the command palette', () => {
  it('opens with Ctrl K and adds the chosen operation', async () => {
    const { user } = await renderApp();
    await user.keyboard('{Control>}k{/Control}');
    const dialog = screen.getByRole('dialog');
    const search = within(dialog).getByRole('combobox');
    expect(search).toHaveFocus();

    await user.keyboard('sha');
    const options = within(dialog).getAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowUp}');
    expect(search).toHaveAttribute('aria-activedescendant', options[1]?.id);
    await user.keyboard('{Enter}');

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(stepNames()).toEqual(['Step 1: SHA-224']);
    expect(screen.getByRole('button', { name: 'Recipe' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('wraps around, adds by click, closes by key', async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole('button', { name: 'Find operation' }));
    await user.keyboard('{ArrowUp}');
    const options = screen.getAllByRole('option');
    expect(options.at(-1)).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.keyboard('{Control>}k{/Control}');
    await user.keyboard('{Control>}k{/Control}');
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.keyboard('{Control>}k{/Control}');
    await user.keyboard('nothing at all');
    expect(screen.getByText('No operation matches.')).toBeVisible();
    await user.keyboard('{Enter}{ArrowDown}x');
    const search = within(screen.getByRole('dialog')).getByRole('combobox');
    await user.clear(search);
    await user.type(search, 'md5');
    await user.pointer({
      keys: '[MouseLeft]',
      target: screen.getByRole('option', { name: /MD5/ }),
    });
    expect(stepNames()).toEqual(['Step 1: MD5']);
  });
});

describe('share links', () => {
  it('builds a link with or without the input', async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole('button', { name: 'Recipe' }));
    await user.click(screen.getByRole('button', { name: 'Add snake_case' }));
    await user.type(screen.getByLabelText('03 — Input'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Share link' }));

    const link = screen.getByLabelText<HTMLInputElement>('Link');
    await waitFor(() => {
      expect(link.value).toContain('#r=');
    });
    expect(link.value).not.toContain('&i=');
    await user.click(
      screen.getByRole('switch', { name: 'Include the input in the link' }),
    );
    await waitFor(() => {
      expect(link.value).toContain('&i=');
    });
    await user.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(await screen.findByText('Copied the link')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('never puts a file in a link', async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole('button', { name: 'Recipe' }));
    await user.upload(
      screen.getByTestId('file-input'),
      new File([new Uint8Array([0xff])], 'b.bin'),
    );
    await screen.findByText('b.bin');
    await user.click(screen.getByRole('button', { name: 'Share link' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('switch'));
    expect(
      screen.getByText('A file input is never put in a link.'),
    ).toBeVisible();
  });

  it('opens a shared recipe once and cleans the address bar', async () => {
    const url = await shareUrl(testEngine(), 'https://x.test/', {
      steps: [{ op: 'case.upper', params: {}, enabled: true }],
      input: 'from a link',
    });
    history.replaceState(null, '', new URL(url).hash);
    await renderApp();

    expect(await screen.findByText('Opened the shared recipe')).toBeVisible();
    expect(stepNames()).toEqual(['Step 1: UPPER CASE']);
    expect(screen.getByLabelText('03 — Input')).toHaveValue('from a link');
    expect(location.hash).toBe('');
  });

  it('tells when a link holds no readable recipe', async () => {
    history.replaceState(null, '', '#r=!!');
    await renderApp();
    expect(
      await screen.findByText('The link holds no recipe this version can read'),
    ).toBeVisible();
    expect(location.hash).toBe('');
  });
});

describe('saved recipes', () => {
  it('saves, loads and deletes recipes on this device', async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole('button', { name: 'Recipe' }));
    await user.click(screen.getByRole('button', { name: 'Saved' }));
    expect(screen.getByText('Nothing saved yet.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save current' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Close' }));

    await user.click(screen.getByRole('button', { name: 'Add MD5' }));
    await user.click(screen.getByRole('button', { name: 'Saved' }));
    await user.type(screen.getByLabelText('Name'), 'hash it{Enter}');
    expect(load('saved')).toEqual([
      {
        name: 'hash it',
        steps: [{ op: 'hash.md5', params: {}, enabled: true }],
      },
    ]);
    await user.click(screen.getByRole('button', { name: 'Close' }));

    await user.click(screen.getByRole('button', { name: 'Clear' }));
    await user.click(screen.getByRole('button', { name: 'Saved' }));
    await user.click(screen.getByRole('button', { name: 'Load hash it' }));
    expect(stepNames()).toEqual(['Step 1: MD5']);

    await user.click(screen.getByRole('button', { name: 'Saved' }));
    await user.click(screen.getByRole('button', { name: 'Delete hash it' }));
    expect(screen.getByText('Nothing saved yet.')).toBeVisible();
  });
});

describe('settings', () => {
  it('switches the theme and remembers the input only when asked', async () => {
    const { user, unmount } = await renderApp();
    await user.selectOptions(screen.getByLabelText('Theme'), 'wine-dark');
    expect(document.documentElement.dataset.theme).toBe('wine-dark');

    await user.type(screen.getByLabelText(/01 — Input/), 'keep me');
    expect(load('input')).toBeUndefined();
    await user.click(
      screen.getByRole('switch', { name: 'Remember input on this device' }),
    );
    expect(load('input')).toBe('keep me');
    unmount();

    const { container } = await renderApp();
    expect(screen.getByLabelText(/01 — Input/)).toHaveValue('keep me');
    expect(container.querySelector('.brand img')).toHaveAttribute(
      'src',
      expect.stringContaining('on-dark'),
    );
  });

  it('forgets the input when remembering is turned off', async () => {
    save('remember-input', true);
    save('input', 'old');
    const { user } = await renderApp();
    await user.click(
      screen.getByRole('switch', { name: 'Remember input on this device' }),
    );
    expect(load('input')).toBeUndefined();
  });

  it('restores the mode and recipe from the last visit', async () => {
    save('mode', 'recipe');
    save('recipe', [{ uid: 'u1', op: 'case.dot', params: {}, enabled: true }]);
    await renderApp();
    expect(stepNames()).toEqual(['Step 1: dot.case']);
  });

  it('shows the request counter', async () => {
    await renderApp();
    expect(screen.getByTestId('privacy-badge')).toHaveTextContent(
      'Local only · 0 requests',
    );
  });
});

describe('startup', () => {
  it('says when the engine does not start', async () => {
    const broken: WorkerLike = {
      onmessage: null,
      postMessage(message) {
        setTimeout(() => {
          broken.onmessage?.({
            data: {
              id: message.id,
              kind: 'error',
              message: 'no wasm',
              fatal: false,
            },
          } as MessageEvent<Response>);
        });
      },
      terminate: vi.fn(),
    };
    render(
      <EngineProvider client={new EngineClient(() => broken)}>
        <App />
      </EngineProvider>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Starting the engine');
    expect(
      await screen.findByText('The engine did not start: no wasm'),
    ).toBeVisible();
  });

  it('needs an engine provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<App />)).toThrow('useEngine needs an EngineProvider');
  });
});
