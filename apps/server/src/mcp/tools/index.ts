/*
 * Elenco dei tool del server, nell'ordine di docs/SERVER.md §6.4.
 */
import type { McpServer } from '@modelcontextprotocol/server';
import type { McpDeps } from '../index.js';
import { registerAccountTools } from './account.js';
import { registerCalendarTools } from './calendar.js';
import { registerCourseTools } from './courses.js';
import { registerFileTools } from './files.js';
import { registerNotificationTools } from './notifications.js';
import { registerPageTools } from './pages.js';
import { registerSearchTools } from './search.js';

export const registerTools = (server: McpServer, deps: McpDeps): void => {
  registerAccountTools(server, deps);
  registerCourseTools(server, deps);
  registerCalendarTools(server, deps);
  registerNotificationTools(server, deps);
  registerSearchTools(server, deps);
  registerPageTools(server, deps);
  registerFileTools(server, deps);
};
