import { Button, Card, CardHeader, Skeleton } from '@webeep/ui-kit';
import type { ReactNode } from 'react';
import { chooseDownloadDir, useSettings, useUpdateSettings } from '../../lib/queries';

export const DownloadCard = (): ReactNode => {
  const settingsQuery = useSettings();
  const updateSettings = useUpdateSettings();
  const downloadDir = settingsQuery.data?.downloadDir;

  // Annullare il dialogo restituisce null: in quel caso non si tocca nulla.
  const changeDownloadDir = async (): Promise<void> => {
    const selected = await chooseDownloadDir();
    if (selected !== null) updateSettings.mutate({ downloadDir: selected });
  };

  return (
    <Card>
      <CardHeader
        title="Download"
        description="Cartella in cui salvare i file dei corsi."
        action={
          <Button variant="outline" size="sm" onClick={changeDownloadDir}>
            Cambia cartella
          </Button>
        }
      />
      <div className="flex flex-col gap-1 px-4 py-3">
        {downloadDir ? (
          <p className="truncate font-mono text-sm tabular-nums" title={downloadDir}>
            {downloadDir}
          </p>
        ) : (
          <Skeleton className="h-4 w-2/3" />
        )}
        <p className="text-2xs text-muted-foreground">I file vengono salvati in una sottocartella per corso e sezione.</p>
      </div>
    </Card>
  );
};
