import { useEffect, useState } from 'react';

/**
 * Board looks. The colours themselves live in `styles.css` under
 * `[data-board-theme]`, so the SVG can pick them up through CSS variables and
 * a theme is a palette rather than a second set of components.
 */
export const BOARD_THEMES = [
  { id: 'tangerine', label: 'Tangerine' },
  { id: 'claret', label: 'Walnut & claret' },
  { id: 'harbour', label: 'Navy & rose' },
  { id: 'classic', label: 'Classic green' },
] as const;

export type BoardThemeId = (typeof BOARD_THEMES)[number]['id'];

const DEFAULT_THEME: BoardThemeId = 'claret';
const STORAGE_KEY = 'bg.boardTheme';

function isThemeId(value: string | null): value is BoardThemeId {
  return BOARD_THEMES.some((theme) => theme.id === value);
}

export function loadBoardTheme(): BoardThemeId {
  const stored = localStorage.getItem(STORAGE_KEY);
  return isThemeId(stored) ? stored : DEFAULT_THEME;
}

/** The chosen theme, applied to the document so every board picks it up. */
export function useBoardTheme(): [BoardThemeId, (next: BoardThemeId) => void] {
  const [theme, setTheme] = useState<BoardThemeId>(loadBoardTheme);

  useEffect(() => {
    document.documentElement.dataset.boardTheme = theme;
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  return [theme, setTheme];
}
