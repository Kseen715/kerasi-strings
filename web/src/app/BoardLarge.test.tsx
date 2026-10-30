import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { boardValue, renderApp } from '../test/app';

// A small limit, so a "large" input stays quick to render in jsdom
vi.mock('./input', async (original) => ({
  ...(await original<typeof import('./input')>()),
  LIVE_BYTES: 8,
}));

describe('board mode with a large input', () => {
  it('waits for Run instead of running live', async () => {
    const { user } = await renderApp();
    const input = screen.getByLabelText(/01 — Input/);
    fireEvent.change(input, { target: { value: 'small' } });
    await waitFor(async () => {
      expect(await boardValue('UPPER CASE')).toHaveTextContent('SMALL');
    });

    fireEvent.change(input, { target: { value: 'much larger' } });
    expect(screen.getByText(/large input · press Run/)).toBeVisible();
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(await boardValue('UPPER CASE')).toHaveTextContent('SMALL');

    await user.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(async () => {
      expect(await boardValue('UPPER CASE')).toHaveTextContent('MUCH LARGER');
    });
    expect(screen.queryByRole('button', { name: 'Run' })).toBeNull();
  });
});
