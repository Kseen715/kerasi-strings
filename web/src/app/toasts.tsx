// Short confirmations ("Copied") as Kerasi toasts, and copying itself.

import { Toast } from '@kerasi/components/feedback/Toast.jsx';
import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';

const SHOWN_MS = 2400;

type Tone = 'success' | 'danger' | 'info';

interface Note {
  id: number;
  tone: Tone;
  title: string;
}

type Notify = (title: string, tone?: Tone) => void;

const ToastContext = createContext<Notify>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [notes, setNotes] = useState<Note[]>([]);

  const notify = useCallback<Notify>((title, tone = 'success') => {
    const id = Date.now() + Math.random();
    setNotes((all) => [...all.slice(-2), { id, tone, title }]);
    setTimeout(() => {
      setNotes((all) => all.filter((note) => note.id !== id));
    }, SHOWN_MS);
  }, []);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="toasts">
        {notes.map((note) => (
          <Toast key={note.id} tone={note.tone} title={note.title} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useNotify(): Notify {
  return useContext(ToastContext);
}

export function useCopy(): (text: string, what: string) => void {
  const notify = useNotify();
  return useCallback(
    (text, what) => {
      navigator.clipboard.writeText(text).then(
        () => {
          notify(`Copied ${what}`);
        },
        () => {
          notify('The browser did not allow copying', 'danger');
        },
      );
    },
    [notify],
  );
}
