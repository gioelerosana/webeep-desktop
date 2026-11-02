/*
 * Errore di caricamento di una vista: icona e struttura comuni, mentre titolo,
 * testo e azione restano al chiamante perché cambiano da vista a vista.
 */
import { EmptyState } from '@webeep/ui-kit';
import { CircleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

export type QueryErrorStateProps = {
  readonly title: string;
  readonly description?: ReactNode;
  readonly action?: ReactNode;
  readonly className?: string;
};

export const QueryErrorState = ({ title, description, action, className }: QueryErrorStateProps): ReactNode => (
  <EmptyState icon={<CircleAlert />} title={title} description={description} action={action} className={className} />
);
