/*
 * Costruzione del server MCP: nome, versione e registrazione dei tool. Un server nuovo per richiesta.
 */
import { McpServer } from '@modelcontextprotocol/server';
import packageJson from '../../package.json';
import type { McpDeps } from './index.js';
import { registerTools } from './tools/index.js';

const SERVER_NAME = 'webeep';

export const createMcpServer = (deps: McpDeps): McpServer => {
  const server = new McpServer({ name: SERVER_NAME, version: packageJson.version });
  registerTools(server, deps);
  return server;
};
