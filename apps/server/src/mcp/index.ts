/*
 * Server MCP (docs/SERVER.md §6). Il contratto del modulo (tipi e `createMcpHandler`) non cambia.
 *
 * Il router chiama `handle` solo per richieste `POST /mcp` con token valido: non serve
 * ricontrollare l'autenticazione. Il corpo è già letto (1 MB).
 *
 * Modalità stateless: per ogni richiesta un server e un transport nuovi. Risposte JSON, mai SSE.
 */
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/server';
import { emptyResponse } from '../http/responses.js';
import type { Config } from '../config.js';
import type { StateManager } from '../state/manager.js';
import { createMcpServer } from './server.js';

export type McpDeps = {
  readonly config: Config;
  readonly store: StateManager;
};

export type McpHandler = {
  readonly handle: (request: Request) => Promise<Response>;
};

const ALLOWED_METHOD = 'POST';
const NO_STORE_HEADER = 'Cache-Control';
const NO_STORE_VALUE = 'no-store';

/** Ogni risposta del server porta `Cache-Control: no-store` (docs/SERVER.md §7). */
const withNoStore = (response: Response): Response => {
  const headers = new Headers(response.headers);
  headers.set(NO_STORE_HEADER, NO_STORE_VALUE);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};

export const createMcpHandler = (deps: McpDeps): McpHandler => ({
  handle: async (request) => {
    // Il router già risponde 405 agli altri metodi: qui è una rete di sicurezza.
    if (request.method !== ALLOWED_METHOD) return emptyResponse(405, { Allow: ALLOWED_METHOD });
    const server = createMcpServer(deps);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    try {
      await server.connect(transport);
      return withNoStore(await transport.handleRequest(request));
    } finally {
      await server.close();
    }
  },
});
