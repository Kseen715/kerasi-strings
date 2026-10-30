import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { EngineClient } from './engine/client';
import { EngineProvider } from './engine/context';
import './styles.css';

const engine = new EngineClient(
  () =>
    new Worker(new URL('./engine/engine.worker.ts', import.meta.url), {
      type: 'module',
    }),
);

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <EngineProvider client={engine}>
        <App />
      </EngineProvider>
    </StrictMode>,
  );
}

// Precaches the app for offline use; the service worker fetches nothing
// but this site's own files
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
    scope: import.meta.env.BASE_URL,
  });
}
