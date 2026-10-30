// The app once the engine is ready: header, the current mode, footer and
// the dialogs, around the state both modes share.

import { useEffect, useState } from 'react';
import { useEngine } from '../engine/context';
import type { Meta } from '../engine/types';
import { BoardView } from './BoardView';
import { CommandPalette } from './CommandPalette';
import { Footer } from './Footer';
import { Header } from './Header';
import { newStep, withUids } from './recipe';
import type { RecipeStep } from './recipe';
import { RecipeView } from './RecipeView';
import { SavedDialog } from './SavedDialog';
import { useInput, useSettings } from './settings';
import { ShareDialog } from './ShareDialog';
import { readShare } from './share';
import { useTheme } from './theme';
import { useNotify } from './toasts';

type Open = 'palette' | 'share' | 'saved' | undefined;

type Settings = ReturnType<typeof useSettings>;

type InputState = ReturnType<typeof useInput>;

export function Workbench({ meta }: { meta: Meta }) {
  const settings = useSettings();
  const input = useInput();
  const theme = useTheme(settings.theme);
  const [open, setOpen] = useState<Open>();

  usePaletteShortcut(setOpen);
  useSharedLink(settings, input.setInput);

  return (
    <div className="app">
      <Header
        mode={settings.mode}
        theme={theme}
        onMode={settings.setMode}
        onPalette={() => {
          setOpen('palette');
        }}
      />
      <View meta={meta} settings={settings} input={input} onOpen={setOpen} />
      <Footer
        version={meta.version}
        theme={settings.theme}
        onTheme={settings.setTheme}
        rememberInput={input.remember}
        onRememberInput={input.setRemember}
      />
      <Dialogs
        meta={meta}
        settings={settings}
        input={input}
        open={open}
        onOpen={setOpen}
      />
    </div>
  );
}

interface ViewProps {
  meta: Meta;
  settings: Settings;
  input: InputState;
  onOpen: (open: Open) => void;
}

function View({ meta, settings, input, onOpen }: ViewProps) {
  if (settings.mode === 'board') {
    return (
      <BoardView
        meta={meta}
        input={input.input}
        onInput={input.setInput}
        options={settings.boardOptions}
        onOptions={settings.setBoardOptions}
      />
    );
  }
  return (
    <RecipeView
      meta={meta}
      steps={settings.steps}
      onSteps={settings.setSteps}
      input={input.input}
      onInput={input.setInput}
      onShare={() => {
        onOpen('share');
      }}
      onSaved={() => {
        onOpen('saved');
      }}
    />
  );
}

interface DialogsProps extends ViewProps {
  open: Open;
}

function Dialogs({ meta, settings, input, open, onOpen }: DialogsProps) {
  const close = () => {
    onOpen(undefined);
  };
  // A dialog that changes the recipe shows it and closes
  const toRecipe = (change: (steps: RecipeStep[]) => RecipeStep[]) => {
    settings.setSteps(change);
    settings.setMode('recipe');
    close();
  };
  const steps = settings.engineSteps;

  if (open === 'palette') {
    const add = (op: string) => {
      toRecipe((all) => [...all, newStep(op)]);
    };
    return <CommandPalette meta={meta} onAdd={add} onClose={close} />;
  }
  if (open === 'share') {
    return <ShareDialog steps={steps} input={input.input} onClose={close} />;
  }
  if (open === 'saved') {
    return (
      <SavedDialog
        saved={settings.saved}
        steps={steps}
        onSaved={settings.setSaved}
        onLoad={(loaded) => {
          toRecipe(() => withUids(loaded));
        }}
        onClose={close}
      />
    );
  }
  return null;
}

/** Ctrl K (⌘ K on a Mac) opens and closes the palette from anywhere. */
function usePaletteShortcut(setOpen: (change: (open: Open) => Open) => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((open) => (open === 'palette' ? undefined : 'palette'));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [setOpen]);
}

/** A share link opens its recipe once, then leaves the address bar clean,
 * so the shared input does not stay in the history. */
function useSharedLink(settings: Settings, setInput: InputState['setInput']) {
  const engine = useEngine();
  const notify = useNotify();
  const { setSteps, setMode } = settings;

  useEffect(() => {
    if (!location.hash) {
      return;
    }
    void readShare(engine, location.hash).then((shared) => {
      history.replaceState(null, '', location.pathname + location.search);
      if (!shared) {
        notify('The link holds no recipe this version can read', 'danger');
        return;
      }
      setSteps(withUids(shared.steps));
      setMode('recipe');
      if (shared.input !== undefined) {
        setInput({ kind: 'text', text: shared.input });
      }
      notify('Opened the shared recipe');
    });
  }, [engine, notify, setSteps, setMode, setInput]);
}
