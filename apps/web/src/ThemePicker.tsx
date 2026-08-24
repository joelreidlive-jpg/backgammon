import { BOARD_THEMES, type BoardThemeId } from './theme.js';

export interface ThemePickerProps {
  theme: BoardThemeId;
  onChange: (next: BoardThemeId) => void;
}

/**
 * Swatches rather than a list of names: the choice is a look, so it should be
 * shown as one. Each swatch previews the case, the felt and both checkers.
 */
export function ThemePicker({ theme, onChange }: ThemePickerProps) {
  return (
    <div className="theme-picker" role="radiogroup" aria-label="Board colours">
      {BOARD_THEMES.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={option.id === theme}
          aria-label={option.label}
          title={option.label}
          className={`swatch${option.id === theme ? ' chosen' : ''}`}
          data-board-theme={option.id}
          onClick={() => onChange(option.id)}
        >
          <span className="swatch-felt">
            <span className="swatch-checker white" />
            <span className="swatch-checker black" />
          </span>
        </button>
      ))}
    </div>
  );
}
