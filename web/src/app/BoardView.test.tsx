import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { boardValue, renderApp } from '../test/app';

function typeInBoard(text: string) {
  const input = screen.getByLabelText(/01 — Input/);
  fireEvent.change(input, { target: { value: text } });
  return input;
}

describe('board mode', () => {
  it('is the default and shows every transform of the input', async () => {
    await renderApp();
    typeInBoard('Grown slowly, cut sharp');
    await waitFor(async () => {
      expect(await boardValue('snake_case')).toHaveTextContent(
        'grown_slowly_cut_sharp',
      );
    });
    expect(await boardValue('Base64 URL')).toHaveTextContent(
      'R3Jvd24gc2xvd2x5LCBjdXQgc2hhcnA',
    );
    expect(await boardValue('MD5')).toHaveTextContent(
      'bd73f4c042894390137a214665b9b828',
    );
    expect(screen.getByText('23 chars · 23 bytes · UTF-8')).toBeVisible();
    expect(await boardValue('Base64 decode')).toHaveTextContent(
      "Invalid Base64 character ','",
    );
  });

  it('copies a row and sends a row to the input', async () => {
    const { user } = await renderApp();
    const input = typeInBoard('Foo Bar');
    await waitFor(async () => {
      expect(await boardValue('kebab-case')).toHaveTextContent('foo-bar');
    });

    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    await user.click(screen.getByRole('button', { name: 'Copy kebab-case' }));
    expect(writeText).toHaveBeenCalledWith('foo-bar');
    expect(await screen.findByText('Copied kebab-case')).toBeVisible();

    await user.click(await boardValue('kebab-case'));
    expect(input).toHaveValue('foo-bar');
  });

  it('tells when copying is not allowed', async () => {
    const { user } = await renderApp();
    typeInBoard('x');
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(
      new Error('denied'),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Copy lower case' }),
    );
    expect(
      await screen.findByText('The browser did not allow copying'),
    ).toBeVisible();
  });

  it('shows binary output as hex without a send button', async () => {
    await renderApp();
    typeInBoard('/w==');
    await waitFor(async () => {
      expect(await boardValue('Base64 decode')).toHaveTextContent(
        'ff (binary, as hex)',
      );
    });
  });

  it('switches the hash format and the layout target', async () => {
    const { user } = await renderApp();
    typeInBoard('ghbdtn');
    await user.click(await screen.findByRole('radio', { name: 'HEX' }));
    await waitFor(async () => {
      expect(await boardValue('MD5')).toHaveTextContent(
        '2A3DFA66C2D8E8C67B77F2A25886E3CF',
      );
    });

    await user.selectOptions(screen.getByLabelText('To'), 'uk');
    await waitFor(async () => {
      expect(await boardValue('Fix layout')).toHaveTextContent('привет');
    });
    expect(await boardValue('Detect layout')).toHaveTextContent('English');
  });

  it('shows groups as tabs on a phone', async () => {
    vi.mocked(matchMedia).mockImplementation(
      (query) =>
        ({
          matches: query.includes('640px'),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList,
    );
    const { user } = await renderApp();
    const tabs = screen.getByRole('tablist');
    expect(
      within(tabs)
        .getAllByRole('tab')
        .map((t) => t.textContent),
    ).toEqual(['Case', 'Keyboard layout', 'Transliteration', 'Encode', 'Hash']);
    expect(screen.getByRole('heading', { name: 'Case' })).toBeVisible();
    await user.click(within(tabs).getByRole('tab', { name: 'Hash' }));
    expect(screen.getByRole('heading', { name: 'Hash' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Case' })).toBeNull();
  });
});
