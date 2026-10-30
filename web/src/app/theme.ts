// The six Kerasi themes. Until the user picks one, the app follows the
// system's light or dark preference with Sakura.

import { useEffect, useState } from 'react';

export const THEMES = [
  { id: 'sakura', name: 'Sakura' },
  { id: 'sakura-dark', name: 'Sakura dark' },
  { id: 'wine', name: 'Wine' },
  { id: 'wine-dark', name: 'Wine dark' },
  { id: 'rust', name: 'Rust' },
  { id: 'rust-dark', name: 'Rust dark' },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];

export type ThemeChoice = ThemeId | 'system';

export const THEME_CHOICES: readonly ThemeChoice[] = [
  'system',
  ...THEMES.map((theme) => theme.id),
];

const DARK_QUERY = '(prefers-color-scheme: dark)';

export function resolveTheme(choice: ThemeChoice, dark: boolean): ThemeId {
  if (choice !== 'system') {
    return choice;
  }
  return dark ? 'sakura-dark' : 'sakura';
}

export function isDark(theme: ThemeId): boolean {
  return theme.endsWith('-dark');
}

export function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const list = matchMedia(query);
    const onChange = () => {
      setMatches(list.matches);
    };
    list.addEventListener('change', onChange);
    return () => {
      list.removeEventListener('change', onChange);
    };
  }, [query]);
  return matches;
}

/** Puts the chosen theme on <html> and returns the one in use. */
export function useTheme(choice: ThemeChoice): ThemeId {
  const theme = resolveTheme(choice, useMedia(DARK_QUERY));
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  return theme;
}
