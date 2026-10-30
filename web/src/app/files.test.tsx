import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { boardValue, renderApp } from '../test/app';

function bytes(...values: number[]) {
  return new File([new Uint8Array(values)], 'data.bin');
}

describe('files', () => {
  it('opens a small text file as text', async () => {
    const { user } = await renderApp();
    await user.upload(
      screen.getByTestId('file-input'),
      new File(['from a file'], 'note.txt'),
    );
    await waitFor(() => {
      expect(screen.getByLabelText(/01 — Input/)).toHaveValue('from a file');
    });
  });

  it('hashes a binary file on the board in chunks', async () => {
    const { user } = await renderApp();
    await user.upload(screen.getByTestId('file-input'), bytes(0xff, 0x00));
    expect(await screen.findByText('data.bin')).toBeVisible();
    expect(screen.getByText(/Text transforms need text input/)).toBeVisible();
    await waitFor(async () => {
      expect(await boardValue('MD5')).toHaveTextContent(/^[0-9a-f]{32}$/);
    });
    await user.click(screen.getByRole('radio', { name: 'base64' }));
    await waitFor(async () => {
      expect(await boardValue('SHA-256')).toHaveTextContent(/=$/);
    });
    await user.click(screen.getByRole('button', { name: 'Clear the file' }));
    expect(screen.getByLabelText(/01 — Input/)).toHaveValue('');
  });

  it('runs a recipe on a dropped file', async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole('button', { name: 'Recipe' }));
    await user.click(screen.getByRole('button', { name: 'Add Base64 encode' }));
    const box = screen.getByLabelText('03 — Input').closest('.io-box');
    if (!box) throw new Error('no input box');

    const file = bytes(0xde, 0xad, 0xbe, 0xef);
    fireEvent.dragOver(box, { dataTransfer: { types: ['Files'] } });
    expect(box).toHaveClass('dropping');
    fireEvent.dragLeave(box);
    expect(box).not.toHaveClass('dropping');
    fireEvent.drop(box, { dataTransfer: { files: [file], types: ['Files'] } });

    expect(await screen.findByText('data.bin')).toBeVisible();
    await waitFor(() => {
      expect(
        screen.getByRole('status', { name: '04 — Output' }),
      ).toHaveTextContent('3q2+7w==');
    });
  });

  it('ignores drags without files', async () => {
    await renderApp();
    const band = screen.getByRole('region', { name: 'Input' });
    fireEvent.dragOver(band, { dataTransfer: { types: ['text/plain'] } });
    fireEvent.drop(band, { dataTransfer: { files: [], types: [] } });
    expect(band.querySelector('.dropping')).toBeNull();
  });
});
