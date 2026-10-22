import { Button, Card, CardHeader, cn } from '@webeep/ui-kit';
import { Monitor, Moon, Sun } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ThemePreference } from '../../../../shared/ipc';
import { useSettings, useUpdateSettings } from '../../lib/queries';

const THEME_OPTIONS: readonly { readonly value: ThemePreference; readonly label: string; readonly icon: ReactNode }[] = [
  { value: 'system', label: 'Sistema', icon: <Monitor /> },
  { value: 'light', label: 'Chiaro', icon: <Sun /> },
  { value: 'dark', label: 'Scuro', icon: <Moon /> },
];

export const AppearanceCard = (): ReactNode => {
  const settingsQuery = useSettings();
  const updateSettings = useUpdateSettings();
  const currentTheme = settingsQuery.data?.theme;

  return (
    <Card>
      <CardHeader title="Aspetto" description="Tema dell'interfaccia." />
      <div className="px-4 py-3">
        <div role="radiogroup" aria-label="Tema" className="flex flex-wrap gap-1">
          {THEME_OPTIONS.map((option) => {
            const checked = option.value === currentTheme;
            return (
              <Button
                key={option.value}
                role="radio"
                aria-checked={checked}
                variant={checked ? 'secondary' : 'ghost-muted'}
                size="sm"
                disabled={currentTheme === undefined}
                className={cn(checked && 'border-input')}
                icon={option.icon}
                onClick={() => updateSettings.mutate({ theme: option.value })}
              >
                {option.label}
              </Button>
            );
          })}
        </div>
      </div>
    </Card>
  );
};
