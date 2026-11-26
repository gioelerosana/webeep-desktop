/*
 * Registrazione di un tool: schema, annotazione di sola lettura e esecuzione con la sessione WeBeep.
 */
import type { CallToolResult, McpServer } from '@modelcontextprotocol/server';
import type { z } from 'zod';
import { parseArgs, toolInputSchema } from '../args.js';
import { INVALID_PARAMS_PREFIX } from '../errors.js';
import type { McpDeps } from '../index.js';
import { runWebeepTool, textBlock, type ToolAccess, type ToolContent } from '../tool-runner.js';

export type ToolDefinition<TSchema extends z.ZodObject> = {
  readonly name: string;
  readonly description: string;
  readonly schema: TSchema;
  readonly run: (args: z.output<TSchema>, access: ToolAccess) => Promise<ToolContent>;
};

const ANNOTATIONS = { readOnlyHint: true } as const;

/** Registra un tool di sola lettura. Gli argomenti non validi diventano un errore del tool, non del protocollo. */
export const defineTool = <TSchema extends z.ZodObject>(
  server: McpServer,
  deps: McpDeps,
  definition: ToolDefinition<TSchema>,
): void => {
  server.registerTool(
    definition.name,
    {
      description: definition.description,
      inputSchema: toolInputSchema(definition.schema),
      annotations: ANNOTATIONS,
    },
    async (rawArgs): Promise<CallToolResult> => {
      const parsed = parseArgs(definition.schema, rawArgs);
      if (!parsed.ok) {
        return { content: textBlock(`${INVALID_PARAMS_PREFIX}${parsed.field}`), isError: true };
      }
      return runWebeepTool(deps, (access) => definition.run(parsed.value, access));
    },
  );
};
