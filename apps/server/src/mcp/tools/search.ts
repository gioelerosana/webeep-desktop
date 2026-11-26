/*
 * Tool di ricerca nel catalogo: `search_courses`. Riguarda anche i corsi a cui non si è iscritti.
 */
import type { McpServer } from '@modelcontextprotocol/server';
import { getCourses, searchCourses } from '@webeep/moodle-api';
import { z } from 'zod';
import type { McpDeps } from '../index.js';
import { lines } from '../format.js';
import { textBlock } from '../tool-runner.js';
import { defineTool } from './define.js';

const SEARCH_PAGE_SIZE = 20;
const SEARCH_MIN_CHARS = 2;
const SEARCH_MAX_CHARS = 100;
const FIRST_PAGE = 0;
const NO_RESULTS = 'nessun risultato';

const SEARCH_COURSES_DESCRIPTION =
  'Cerca nel catalogo WeBeep per nome o codice e mostra la prima pagina dei risultati, anche di corsi a cui ' +
  "non si è iscritti (stato: iscritto o non iscritto). Usalo quando l'utente cerca un corso che non conosce già.";

export const registerSearchTools = (server: McpServer, deps: McpDeps): void => {
  defineTool(server, deps, {
    name: 'search_courses',
    description: SEARCH_COURSES_DESCRIPTION,
    schema: z.object({
      query: z.string().min(SEARCH_MIN_CHARS).max(SEARCH_MAX_CHARS),
    }),
    run: async ({ query }, { client }) => {
      const [results, enrolled] = await Promise.all([
        searchCourses(client, { query, page: FIRST_PAGE, perPage: SEARCH_PAGE_SIZE }),
        getCourses(client, 'all'),
      ]);
      const enrolledIds = new Set(enrolled.map((course) => course.id));
      const rows = results.courses.map(
        (course) =>
          `- id ${course.id}: ${course.fullname} (${course.shortname}) · ${enrolledIds.has(course.id) ? 'iscritto' : 'non iscritto'}`,
      );
      const header = `risultati totali: ${results.total}`;
      return textBlock(rows.length === 0 ? lines([header, NO_RESULTS]) : lines([header, ...rows]));
    },
  });
};
