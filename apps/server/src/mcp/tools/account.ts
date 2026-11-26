/*
 * Tool di account: `whoami`.
 */
import type { McpServer } from '@modelcontextprotocol/server';
import { getSiteInfo, WEBEEP_SITE_URL } from '@webeep/moodle-api';
import { z } from 'zod';
import type { McpDeps } from '../index.js';
import { lines } from '../format.js';
import { textBlock } from '../tool-runner.js';
import { defineTool } from './define.js';

const WHOAMI_DESCRIPTION =
  "Dice a quale account WeBeep è collegato il server: nome completo, username e stato della connessione. " +
  "Usalo per verificare il collegamento prima di altre richieste, o quando l'utente chiede di chi sono i dati.";

export const registerAccountTools = (server: McpServer, deps: McpDeps): void => {
  defineTool(server, deps, {
    name: 'whoami',
    description: WHOAMI_DESCRIPTION,
    schema: z.object({}),
    run: async (_args, { client }) => {
      const info = await getSiteInfo(client);
      return textBlock(
        lines([
          'Collegato a WeBeep',
          `Nome: ${info.fullname}`,
          `Username: ${info.username}`,
          `Sito: ${WEBEEP_SITE_URL}`,
          'Stato: collegato',
        ]),
      );
    },
  });
};
