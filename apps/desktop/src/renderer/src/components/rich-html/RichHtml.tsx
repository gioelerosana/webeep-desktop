/*
 * Mostra un albero di nodi HTML di WeBeep senza iniettarlo: ogni tag diventa un elemento React
 * e il parsing lo fa il chiamante, una volta sola per contenuto.
 */
import { cn } from '@webeep/ui-kit';
import type { ReactNode } from 'react';
import type { RichNode } from './parseRichHtml';
import { RichNodeView } from './RichNodeView';
import type { RichLinkRenderer } from './RichLink';

export type RichHtmlProps = {
  readonly nodes: readonly RichNode[];
  readonly renderLink: RichLinkRenderer;
  /** Colore o tipo di un contesto specifico (es. sommario in una card); il default resta quello delle pagine. */
  readonly className?: string;
};

export const RichHtml = ({ nodes, renderLink, className }: RichHtmlProps): ReactNode => (
  <div className={cn('text-sm leading-relaxed text-foreground', className)}>
    {nodes.map((node, index) => (
      <RichNodeView key={index} node={node} renderLink={renderLink} />
    ))}
  </div>
);
