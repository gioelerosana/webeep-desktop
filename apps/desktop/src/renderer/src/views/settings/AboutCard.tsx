import { Card, CardHeader } from '@webeep/ui-kit';
import type { ReactNode } from 'react';

export const AboutCard = (): ReactNode => (
  <Card>
    <CardHeader title="Informazioni" description="Versione e note sul progetto." />
    <div className="flex flex-col gap-1 px-4 py-3 text-sm">
      <p>WeBeep Desktop · prototipo</p>
      <p className="text-muted-foreground">Progetto non ufficiale, non affiliato al Politecnico di Milano.</p>
    </div>
  </Card>
);
