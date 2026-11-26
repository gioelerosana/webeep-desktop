/*
 * Tool delle pagine del corso: `get_page`.
 */
import type { McpServer } from '@modelcontextprotocol/server';
import { getCourseModule, getPages, htmlToText, toCoursePage } from '@webeep/moodle-api';
import { z } from 'zod';
import { NOT_A_PAGE_TEXT, PAGE_NOT_FOUND_TEXT, ToolFailure } from '../errors.js';
import type { McpDeps } from '../index.js';
import { formatBytes, formatIsoRome, lines, MAX_OUTPUT_CHARS, truncate } from '../format.js';
import { textBlock } from '../tool-runner.js';
import { defineTool } from './define.js';

const CMID_MIN = 1;
const PAGE_MODULE_NAME = 'page';

const GET_PAGE_DESCRIPTION =
  "Legge una pagina di WeBeep (modulo di tipo page) dal suo cmid: nome, testo in chiaro e l'elenco dei file " +
  'allegati con fileUrl, da passare a read_file. Il cmid si trova in get_course_contents.';

export const registerPageTools = (server: McpServer, deps: McpDeps): void => {
  defineTool(server, deps, {
    name: 'get_page',
    description: GET_PAGE_DESCRIPTION,
    schema: z.object({
      cmid: z.number().int().min(CMID_MIN),
    }),
    run: async ({ cmid }, { client }) => {
      const context = await getCourseModule(client, cmid);
      if (context.modname !== PAGE_MODULE_NAME) throw new ToolFailure(NOT_A_PAGE_TEXT);
      const pages = await getPages(client, [context.course]);
      const found = pages.find((page) => page.coursemodule === cmid);
      if (found === undefined) throw new ToolFailure(PAGE_NOT_FOUND_TEXT);

      const page = toCoursePage(found);
      const text = htmlToText(page.contentHtml) || htmlToText(page.introHtml);
      const files = page.files.map(
        (file) =>
          `- ${file.filename} · ${formatBytes(file.filesize)}${file.timemodified !== undefined ? ` · ${formatIsoRome(file.timemodified)}` : ''} · fileUrl: ${file.fileurl}`,
      );
      const filesBlock = files.length > 0 ? ['', 'File allegati:', ...files] : [];
      return textBlock(
        lines([
          `Pagina: ${page.name}`,
          `Modulo: ${page.moduleId}`,
          `Aggiornata: ${formatIsoRome(page.timemodified)}`,
          '',
          truncate(text, MAX_OUTPUT_CHARS),
          ...filesBlock,
        ]),
      );
    },
  });
};
