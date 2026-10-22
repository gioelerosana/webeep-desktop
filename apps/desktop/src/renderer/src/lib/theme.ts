/*
 * Applica il tema scelto (Impostazioni) come `data-theme` su <html>.
 * `system` segue `prefers-color-scheme` e reagisce ai cambi del sistema.
 */
import { useEffect } from 'react';
import type { ThemePreference } from '../../../shared/ipc';

const DARK_QUERY = '(prefers-color-scheme: dark)';

const resolveTheme = (preference: ThemePreference, media: MediaQueryList): 'light' | 'dark' => {
  if (preference !== 'system') return preference;
  return media.matches ? 'dark' : 'light';
};

export const useApplyTheme = (preference: ThemePreference): void => {
  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY);
    const apply = (): void => {
      document.documentElement.dataset['theme'] = resolveTheme(preference, media);
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [preference]);
};
