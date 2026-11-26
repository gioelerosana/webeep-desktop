/*
 * Esecuzione di un tool che parla con WeBeep: sessione, client, errori e pulizia del testo.
 *
 * Il token entra qui solo per costruire il client; ogni testo in uscita passa da `stripAuthTokens`.
 */
import type { CallToolResult } from '@modelcontextprotocol/server';
import { stripAuthTokens, type MoodleClient } from '@webeep/moodle-api';
import type { McpDeps } from './index.js';
import { describeError, NOT_CONNECTED_TEXT } from './errors.js';
import { getWebeepSession, createWebeepClient, type WebeepSessionView } from '../webeep-session.js';

export type ToolContent = CallToolResult['content'];

export type ToolAccess = {
  readonly client: MoodleClient;
  readonly session: WebeepSessionView;
};

export type ToolRun = (access: ToolAccess) => Promise<ToolContent>;

/** Un blocco di testo; il testo passa da `stripAuthTokens` per non portare parametri di accesso. */
export const textBlock = (text: string): ToolContent => [{ type: 'text', text: stripAuthTokens(text) }];

const errorResult = (text: string): CallToolResult => ({
  content: [{ type: 'text', text }],
  isError: true,
});

/** Ultima rete: nessun blocco di testo esce con parametri di accesso, anche in caso di errore. */
const sanitize = (content: ToolContent): ToolContent =>
  content.map((block) => (block.type === 'text' ? { ...block, text: stripAuthTokens(block.text) } : block));

const errorName = (error: unknown): string => (error instanceof Error ? error.name : 'unknown');

/** Cancella la sessione come `DELETE /pair`. Un errore di scrittura non cambia la risposta al modello. */
const dropSession = async (deps: McpDeps): Promise<void> => {
  try {
    await deps.store.update((state) => ({ ...state, webeep: null }));
  } catch (error) {
    console.error(`errore nella cancellazione della sessione: ${errorName(error)}`);
  }
};

const handleFailure = async (deps: McpDeps, error: unknown): Promise<CallToolResult> => {
  const description = describeError(error);
  if (description.unexpected) console.error(`errore tool: ${errorName(error)}`);
  if (description.clearSession) await dropSession(deps);
  return errorResult(stripAuthTokens(description.text));
};

/** Esegue `run` con la sessione corrente. Senza accoppiamento risponde con l'errore dedicato. */
export const runWebeepTool = async (deps: McpDeps, run: ToolRun): Promise<CallToolResult> => {
  try {
    const session = await getWebeepSession(deps.store);
    if (session === null) return errorResult(NOT_CONNECTED_TEXT);
    const client = createWebeepClient(session);
    const content = await run({ client, session });
    return { content: sanitize(content) };
  } catch (error) {
    return handleFailure(deps, error);
  }
};
