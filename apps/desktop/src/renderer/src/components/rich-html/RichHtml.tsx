/*
 * Mostra un albero di nodi HTML di WeBeep senza iniettarlo: ogni tag diventa un elemento React
 * e il parsing lo fa il chiamante, una volta sola per contenuto.
 */
import type { ReactNode } from 'react';
import type { RichNode } from './parseRichHtml';
import { RichNodeView } from './RichNodeView';
import type { RichLinkRenderer } from './RichLink';

export type RichHtmlProps = {
  readonly nodes: readonly RichNode[];
  readonly renderLink: RichLinkRenderer;
};

export const RichHtml = ({ nodes, renderLink }: RichHtmlProps): ReactNode => (
  <div className="text-sm leading-relaxed text-foreground">
    {nodes.map((node, index) => (
      <RichNodeView key={index} node={node} renderLink={renderLink} />
    ))}
  </div>
);
