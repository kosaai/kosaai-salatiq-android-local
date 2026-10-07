import { useLocalSearchParams } from 'expo-router';

/**
 * The home screen owns its dark-mode state, so every secondary page receives
 * the current mode as a `theme` search param when it opens and forwards the
 * same param when navigating deeper. A page opened directly (deep link or a
 * fresh web URL) falls back to light, which is also the home screen default.
 */
export function usePageTheme() {
  const { theme } = useLocalSearchParams<{ theme?: string }>();
  return theme === 'dark';
}

export function themeParam(isDarkMode: boolean) {
  return { theme: isDarkMode ? 'dark' : 'light' };
}
