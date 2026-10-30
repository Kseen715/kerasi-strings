import { useCallback } from 'react';
import { useEngine } from '../engine/context';
import { useLatest } from '../engine/hooks';
import { ToastProvider } from './toasts';
import { Workbench } from './Workbench';

export function App() {
  const engine = useEngine();
  const meta = useLatest(useCallback(() => engine.meta(), [engine]));

  if (!meta.value) {
    return (
      <div className="app gutter" role="status" style={{ paddingTop: 32 }}>
        {meta.error
          ? `The engine did not start: ${meta.error}`
          : 'Starting the engine…'}
      </div>
    );
  }
  return (
    <ToastProvider>
      <Workbench meta={meta.value} />
    </ToastProvider>
  );
}
