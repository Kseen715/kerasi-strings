import { Select } from '../ds/kerasi';
import { Toggle } from '../ds/Toggle';
import { THEMES, THEME_CHOICES } from './theme';
import type { ThemeChoice } from './theme';

const SOURCE = 'https://github.com/Kseen715/kerasi-strings';

const THEME_OPTIONS = THEME_CHOICES.map((id) => ({
  value: id,
  label: THEMES.find((theme) => theme.id === id)?.name ?? 'System (Sakura)',
}));

interface FooterProps {
  version: string;
  theme: ThemeChoice;
  onTheme: (theme: ThemeChoice) => void;
  rememberInput: boolean;
  onRememberInput: (remember: boolean) => void;
}

export function Footer(props: FooterProps) {
  return (
    <footer className="bottom gutter">
      <span>
        Everything runs in this tab · Rust → WebAssembly · works offline
      </span>
      <div className="bottom-settings">
        <Toggle checked={props.rememberInput} onChange={props.onRememberInput}>
          Remember input on this device
        </Toggle>
        <Select
          label="Theme"
          options={THEME_OPTIONS}
          value={props.theme}
          onChange={(event: { target: { value: ThemeChoice } }) => {
            props.onTheme(event.target.value);
          }}
        />
      </div>
      <span>
        v{props.version} ·{' '}
        <a href={`${import.meta.env.BASE_URL}THIRD-PARTY-NOTICES.txt`}>
          licenses
        </a>{' '}
        ·{' '}
        <a href={SOURCE} rel="noreferrer">
          source
        </a>
      </span>
    </footer>
  );
}
