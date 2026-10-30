import { Button, Tooltip } from '../ds/kerasi';
import { Icon } from '../ds/Icon';
import { useRequestCounts } from '../privacy/requests';
import { isDark } from './theme';
import type { ThemeId } from './theme';

export const MODES = ['board', 'recipe'] as const;

export type Mode = (typeof MODES)[number];

const MODE_NAMES: Record<Mode, string> = { board: 'Board', recipe: 'Recipe' };

interface HeaderProps {
  mode: Mode;
  theme: ThemeId;
  onMode: (mode: Mode) => void;
  onPalette: () => void;
}

export function Header({ mode, theme, onMode, onPalette }: HeaderProps) {
  const mark = isDark(theme) ? 'strings-mark-on-dark.svg' : 'strings-mark.svg';
  return (
    <header className="top gutter">
      <div className="brand">
        <img
          src={`${import.meta.env.BASE_URL}brand/${mark}`}
          alt=""
          width={32}
          height={32}
        />
        <h1 className="brand-name">
          <span className="brand-dim">kerasi /</span> <b>strings</b>
        </h1>
      </div>
      <div className="top-space" />
      <PrivacyBadge />
      <ModeSwitch mode={mode} onMode={onMode} />
      <Button
        variant="secondary"
        icon="search"
        aria-label="Find operation"
        aria-keyshortcuts="Control+K"
        onClick={onPalette}
      >
        <span className="wide-only">Find operation</span>
        <kbd className="wide-only">Ctrl K</kbd>
      </Button>
    </header>
  );
}

function ModeSwitch({ mode, onMode }: Pick<HeaderProps, 'mode' | 'onMode'>) {
  return (
    <nav aria-label="Mode" className="modes">
      {MODES.map((id) => (
        <button
          key={id}
          type="button"
          className="mode"
          aria-pressed={mode === id}
          onClick={() => {
            onMode(id);
          }}
        >
          {MODE_NAMES[id]}
        </button>
      ))}
    </nav>
  );
}

function PrivacyBadge() {
  const { local, remote, blocked } = useRequestCounts();
  const detail =
    `${local} files from this site · ${remote} from anywhere else` +
    (blocked ? ` · ${blocked} blocked` : '');
  return (
    <Tooltip label={detail} placement="bottom" align="end">
      <span
        className={remote ? 'privacy privacy-alert' : 'privacy'}
        data-testid="privacy-badge"
      >
        <Icon name={remote ? 'triangle-alert' : 'lock'} size={14} />
        <span className="wide-only">
          {remote ? 'Not local' : 'Local only'} ·{' '}
        </span>
        {remote} {remote === 1 ? 'request' : 'requests'}
        <span className="sr-only">. {detail}</span>
      </span>
    </Tooltip>
  );
}
