/*
 * Tool delle notifiche: `list_notifications`. Leggere non segna come lette: nessuna scrittura su WeBeep.
 */
import type { McpServer } from '@modelcontextprotocol/server';
import { getNotifications, getSiteInfo, htmlToText, type MoodleNotification } from '@webeep/moodle-api';
import { z } from 'zod';
import type { McpDeps } from '../index.js';
import { formatIsoRome, lines, MAX_DESCRIPTION_CHARS, truncate, yesNo } from '../format.js';
import { textBlock } from '../tool-runner.js';
import { defineTool } from './define.js';

const DEFAULT_LIMIT = 20;
const MIN_LIMIT = 1;
const MAX_LIMIT = 50;
const NO_RESULTS = 'nessun risultato';
const UNLABELED_COMPONENT = 'notifica';

const NOTIFICATIONS_DESCRIPTION =
  'Elenca le notifiche di WeBeep più recenti: data, se è letta, oggetto, anteprima del testo e componente ' +
  "che l'ha generata (forum, compiti...). Con unreadOnly mostra solo le non lette. Leggerle non le segna come lette.";

const notificationBlock = (notification: MoodleNotification): readonly string[] => {
  const component = notification.componentlabel ?? notification.component ?? UNLABELED_COMPONENT;
  const head = `- ${formatIsoRome(notification.timecreated)} · letta: ${yesNo(notification.read)} · ${component} · ${notification.subject}`;
  const preview = htmlToText(notification.smallmessage ?? '');
  return preview.length > 0 ? [head, `  ${truncate(preview, MAX_DESCRIPTION_CHARS)}`] : [head];
};

export const registerNotificationTools = (server: McpServer, deps: McpDeps): void => {
  defineTool(server, deps, {
    name: 'list_notifications',
    description: NOTIFICATIONS_DESCRIPTION,
    schema: z.object({
      unreadOnly: z.boolean().default(false),
      limit: z.number().int().min(MIN_LIMIT).max(MAX_LIMIT).default(DEFAULT_LIMIT),
    }),
    run: async ({ unreadOnly, limit }, { client }) => {
      const { userid } = await getSiteInfo(client);
      // Il filtro sulle non lette non è di Moodle: si chiede il massimo e si filtra qui, poi si taglia.
      const page = await getNotifications(client, { userId: userid, limit: unreadOnly ? MAX_LIMIT : limit });
      const selected = (unreadOnly ? page.notifications.filter((item) => !item.read) : page.notifications).slice(
        0,
        limit,
      );
      if (selected.length === 0) return textBlock(lines([`Non lette in totale: ${page.unreadcount}`, NO_RESULTS]));
      const body = selected.flatMap(notificationBlock);
      return textBlock(lines([`Non lette in totale: ${page.unreadcount}`, ...body]));
    },
  });
};
