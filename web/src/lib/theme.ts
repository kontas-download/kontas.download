export const THEMES = ['dark', 'light', 'system'] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_COOKIE = 'theme';
export const DEFAULT_THEME: Theme = 'dark';

export function parseTheme(value: unknown): Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value) ? (value as Theme) : DEFAULT_THEME;
}

/** Browser side: remember the choice for a year and apply it at once without a reload. */
export function storeTheme(theme: Theme) {
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax`;
  document.documentElement.dataset.theme = theme;
}
