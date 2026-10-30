// Renders the whole app on the real engine, as the component tests use it.

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../app/App';
import { EngineProvider } from '../engine/context';
import { testEngine } from '../engine/testing';

export async function renderApp() {
  const user = userEvent.setup();
  const engine = testEngine();
  const view = render(
    <EngineProvider client={engine}>
      <App />
    </EngineProvider>,
  );
  await screen.findByRole('navigation', { name: 'Mode' });
  return { user, engine, ...view };
}

/** The value button of a board row, found by its row label */
export async function boardValue(label: string): Promise<HTMLElement> {
  const row = (await screen.findByText(label, { selector: '.row-label' }))
    .parentElement;
  if (!row) throw new Error(`no row ${label}`);
  const value = row.querySelector<HTMLElement>('.row-value, .row-note');
  if (!value) throw new Error(`no value in ${label}`);
  return value;
}
