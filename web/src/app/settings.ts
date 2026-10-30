// What the app remembers between visits. The input is kept only when the
// user turns that on, since it may be a secret.

import { useEffect, useMemo, useState } from 'react';
import type { ParamValue } from '../engine/types';
import { MODES } from './Header';
import type { Mode } from './Header';
import { EMPTY } from './input';
import type { Input } from './input';
import { isStepList, toEngine } from './recipe';
import type { RecipeStep } from './recipe';
import { isSavedList } from './SavedDialog';
import type { SavedRecipe } from './SavedDialog';
import {
  forget,
  isBoolean,
  isOneOf,
  load,
  save,
  usePersistent,
} from './storage';
import { THEME_CHOICES } from './theme';
import type { ThemeChoice } from './theme';

type Options = Record<string, ParamValue>;

function isRecipe(value: unknown): value is RecipeStep[] {
  return (
    isStepList(value) &&
    value.every((step) => typeof (step as RecipeStep).uid === 'string')
  );
}

function isOptions(value: unknown): value is Options {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(
      (v) => typeof v === 'string' || typeof v === 'boolean',
    )
  );
}

export function useSettings() {
  const [mode, setMode] = usePersistent<Mode>('mode', 'board', isOneOf(MODES));
  const [theme, setTheme] = usePersistent<ThemeChoice>(
    'theme',
    'system',
    isOneOf(THEME_CHOICES),
  );
  const [steps, setSteps] = usePersistent<RecipeStep[]>('recipe', [], isRecipe);
  const [boardOptions, setBoardOptions] = usePersistent<Options>(
    'board',
    {},
    isOptions,
  );
  const [saved, setSaved] = usePersistent<SavedRecipe[]>(
    'saved',
    [],
    isSavedList,
  );
  const engineSteps = useMemo(() => toEngine(steps), [steps]);
  return {
    mode,
    setMode,
    theme,
    setTheme,
    steps,
    engineSteps,
    setSteps,
    boardOptions,
    setBoardOptions,
    saved,
    setSaved,
  };
}

/** The shared input; stored only while `remember` is on, and only text. */
export function useInput() {
  const [remember, setRemember] = usePersistent(
    'remember-input',
    false,
    isBoolean,
  );
  const [input, setInput] = useState<Input>(() => {
    const stored = remember ? load('input') : undefined;
    return typeof stored === 'string' ? { kind: 'text', text: stored } : EMPTY;
  });

  useEffect(() => {
    if (remember && input.kind === 'text') {
      save('input', input.text);
    } else {
      forget('input');
    }
  }, [remember, input]);

  return { input, setInput, remember, setRemember };
}
