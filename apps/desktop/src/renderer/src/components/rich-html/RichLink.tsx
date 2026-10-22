import type { ReactNode } from 'react';
import { parseHttpUrl } from './richUrl';

/** Come si mostra un link http(s): la vista decide se è un file, una pagina del corso o un link esterno. Riceve l'URL già assoluto. */
export type RichLinkRenderer = (href: string, children: ReactNode) => ReactNode;

export type RichLinkProps = {
  readonly href: string | undefined;
  readonly renderLink: RichLinkRenderer;
  readonly children: ReactNode;
};

/** Un `<a>` diventa un link solo se l'href risolto è http(s); altrimenti resta il testo. */
export const RichLink = ({ href, renderLink, children }: RichLinkProps): ReactNode => {
  const url = href === undefined ? undefined : parseHttpUrl(href);
  if (url === undefined) return children;
  return renderLink(url.href, children);
};
