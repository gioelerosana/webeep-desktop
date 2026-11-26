/*
 * Tool delle scadenze: `get_upcoming_deadlines`.
 */
import type { McpServer } from '@modelcontextprotocol/server';
import { getUpcomingEvents } from '@webeep/moodle-api';
import { z } from 'zod';
import type { McpDeps } from '../index.js';
import { formatIsoRome, formatLocalRome, lines } from '../format.js';
import { textBlock } from '../tool-runner.js';
import { defineTool } from './define.js';

const SECONDS_PER_DAY = 86_400;
const MS_PER_SECOND = 1000;
const DEFAULT_DAYS = 14;
const MIN_DAYS = 1;
const MAX_DAYS = 90;
const DEFAULT_LIMIT = 25;
const MIN_LIMIT = 1;
const MAX_LIMIT = 50;
const NO_RESULTS = 'nessun risultato';

const DEADLINES_DESCRIPTION =
  'Elenca le scadenze e le attività con azione su WeBeep in ordine cronologico: titolo, corso, scadenza in ISO ' +
  'e nella forma locale gg/mm/aaaa hh:mm (fuso di Roma). Usalo per chiedere cosa c\'è da consegnare o fare ' +
  'nei prossimi giorni. days è la finestra in giorni, limit il numero massimo di scadenze.';

const nowInSeconds = (): number => Math.floor(Date.now() / MS_PER_SECOND);

export const registerCalendarTools = (server: McpServer, deps: McpDeps): void => {
  defineTool(server, deps, {
    name: 'get_upcoming_deadlines',
    description: DEADLINES_DESCRIPTION,
    schema: z.object({
      days: z.number().int().min(MIN_DAYS).max(MAX_DAYS).default(DEFAULT_DAYS),
      limit: z.number().int().min(MIN_LIMIT).max(MAX_LIMIT).default(DEFAULT_LIMIT),
    }),
    run: async ({ days, limit }, { client }) => {
      const now = nowInSeconds();
      const until = now + days * SECONDS_PER_DAY;
      // Le scadenze arrivano in ordine: quelle oltre la finestra si scartano dopo il limite.
      const events = (await getUpcomingEvents(client, { fromSeconds: now, limit })).filter(
        (event) => event.timestart <= until,
      );
      if (events.length === 0) return textBlock(NO_RESULTS);
      const rows = events.map((event) => {
        const course = event.course?.fullname ?? 'senza corso';
        return `- ${formatLocalRome(event.timestart)} (${formatIsoRome(event.timestart)}) · ${course} · ${event.name}`;
      });
      return textBlock(lines([`Scadenze nei prossimi ${days} giorni: ${events.length}`, ...rows]));
    },
  });
};
