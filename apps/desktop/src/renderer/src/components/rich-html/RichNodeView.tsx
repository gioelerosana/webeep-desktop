import { createElement, type ReactNode } from 'react';
import type { RichNode } from './parseRichHtml';
import { RichImage } from './RichImage';
import { RichLink, type RichLinkRenderer } from './RichLink';
import { RICH_TAG_CLASSES } from './richStyles';

const TABLE_WRAPPER_CLASS = 'my-3 overflow-x-auto';

export type RichNodeViewProps = {
  readonly node: RichNode;
  readonly renderLink: RichLinkRenderer;
};

/** Un nodo dell'albero: testo come stringa, tag della whitelist come elemento React con le sue classi. */
export const RichNodeView = ({ node, renderLink }: RichNodeViewProps): ReactNode => {
  if (node.kind === 'text') return node.text;

  // La chiave è la posizione tra i fratelli: l'albero non si riordina, quindi resta stabile.
  const children = node.children.map((child, index) => <RichNodeView key={index} node={child} renderLink={renderLink} />);

  if (node.tag === 'a') return <RichLink href={node.href} renderLink={renderLink}>{children}</RichLink>;
  if (node.tag === 'img') return <RichImage src={node.src} alt={node.alt} />;
  if (node.tag === 'br') return <br />;
  if (node.tag === 'hr') return <hr className={RICH_TAG_CLASSES.hr} />;
  if (node.tag === 'table') {
    return <div className={TABLE_WRAPPER_CLASS}>{createElement('table', { className: RICH_TAG_CLASSES.table }, children)}</div>;
  }
  return createElement(node.tag, { className: RICH_TAG_CLASSES[node.tag], colSpan: node.colSpan, rowSpan: node.rowSpan }, children);
};
