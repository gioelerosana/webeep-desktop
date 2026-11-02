/*
 * Corpo di una notifica espansa. L'HTML di Moodle passa da `<RichHtml>` (albero di nodi
 * con whitelist, nessun `dangerouslySetInnerHTML`); il testo semplice resta testo.
 * I link escono dall'app con il browser del sistema, come il pulsante della riga.
 */
import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { RichHtml } from '../../components/rich-html/RichHtml';
import { hasRichContent, parseRichHtml, type RichNode } from '../../components/rich-html/parseRichHtml';
import type { NotificationContent } from '../../lib/notificationContext';
import { NotificationLink } from './NotificationLink';

export type NotificationBodyProps = {
  readonly content: NotificationContent;
};

const EMPTY_TEXT = 'Nessun contenuto';
const NO_NODES: readonly RichNode[] = [];

/** Link dentro il corpo: si apre nel browser, non nella finestra dell'app. */
const renderNotificationLink = (href: string, children: ReactNode): ReactNode => (
  <NotificationLink href={href}>{children}</NotificationLink>
);

/** Corpo della notifica: HTML come albero di nodi se c'è, altrimenti testo semplice o "nessun contenuto". */
export const NotificationBody = ({ content }: NotificationBodyProps): ReactNode => {
  // Il parsing dipende solo dall'HTML: la stessa notifica ridisegnata non lo rifà.
  const html = content.kind === 'html' ? content.html : '';
  const nodes = useMemo(() => (html === '' ? NO_NODES : parseRichHtml(html)), [html]);

  if (content.kind === 'html') {
    if (!hasRichContent(nodes)) return <p className="text-sm text-muted-foreground">{EMPTY_TEXT}</p>;
    return <RichHtml nodes={nodes} renderLink={renderNotificationLink} />;
  }
  if (content.kind === 'text') return <p className="whitespace-pre-line text-sm text-foreground">{content.text}</p>;
  return <p className="text-sm text-muted-foreground">{EMPTY_TEXT}</p>;
};
