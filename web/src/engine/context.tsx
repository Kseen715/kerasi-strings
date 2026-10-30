// Hands the one engine client to every component that needs it.

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { EngineClient } from './client';

const EngineContext = createContext<EngineClient | null>(null);

export function EngineProvider({
  client,
  children,
}: {
  client: EngineClient;
  children: ReactNode;
}) {
  return (
    <EngineContext.Provider value={client}>{children}</EngineContext.Provider>
  );
}

export function useEngine(): EngineClient {
  const client = useContext(EngineContext);
  if (!client) {
    throw new Error('useEngine needs an EngineProvider');
  }
  return client;
}
