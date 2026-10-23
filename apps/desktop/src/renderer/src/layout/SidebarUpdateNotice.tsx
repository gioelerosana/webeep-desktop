import { Button, cn } from '@webeep/ui-kit';
import type { ReactNode } from 'react';
import { selectUpdateNotice, type UpdateNoticeAction } from './updateNotice';
import { useUpdates } from './useUpdates';

/** Avviso sottile sopra il piè di sidebar: compare solo quando c'è un aggiornamento da fare. */
export const SidebarUpdateNotice = (): ReactNode => {
  const updates = useUpdates();
  const notice = updates.state ? selectUpdateNotice(updates.state) : null;
  if (!notice) return null;

  const runAction: Record<UpdateNoticeAction, () => void> = {
    download: updates.download,
    install: updates.install,
    'open-release': updates.openRelease,
  };

  // Niente troncamento: la sidebar è stretta, quindi il dettaglio va a capo e l'azione sta sotto.
  return (
    <div role="status" className="flex flex-col items-start gap-2 border-t px-3 py-2">
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-xs font-medium">{notice.title}</p>
        <p className={cn('text-2xs', updates.actionError ? 'text-error-foreground' : 'text-muted-foreground')}>
          {updates.actionError ?? notice.detail}
        </p>
      </div>
      <Button variant="outline" size="xs" onClick={runAction[notice.action]}>
        {notice.actionLabel}
      </Button>
    </div>
  );
};
