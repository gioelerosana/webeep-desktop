/*
 * Argomenti dei tool. Lo schema zod è la fonte: `tools/list` lo pubblica come JSON Schema, e la
 * validazione la fa `parseArgs` qui sotto, così l'errore è `parametri non validi: <campo>` (§6.2)
 * e non l'errore di protocollo che farebbe l'SDK.
 */
import { fromJsonSchema, type JsonSchemaType, type jsonSchemaValidator, type JsonSchemaValidatorResult, type StandardSchemaWithJSON } from '@modelcontextprotocol/server';
import { z } from 'zod';

const FALLBACK_FIELD = 'argomenti';
const PATH_SEPARATOR = '.';

/** Il controllo vero lo fa `parseArgs`: qui l'SDK non deve rifiutare nulla da sé. */
const passThroughValidator: jsonSchemaValidator = {
  getValidator: <T>() =>
    (input: unknown): JsonSchemaValidatorResult<T> => ({
      valid: true,
      // Il valore non è ancora validato: `parseArgs` lo fa subito dopo, con lo schema zod.
      data: input as T,
      errorMessage: undefined,
    }),
};

/** Schema dell'input come `StandardSchemaWithJSON`, con il JSON Schema di zod per `tools/list`. */
export const toolInputSchema = (schema: z.ZodType): StandardSchemaWithJSON<unknown, unknown> =>
  // Il JSON Schema prodotto da zod è uno standard compatibile; il tipo dell'SDK è più stretto solo sulla forma.
  fromJsonSchema(z.toJSONSchema(schema, { io: 'input' }) as JsonSchemaType, passThroughValidator);

export type ParsedArgs<TValue> =
  | { readonly ok: true; readonly value: TValue }
  | { readonly ok: false; readonly field: string };

/** Valida gli argomenti; un valore assente vale come oggetto vuoto. Il valore non esce mai nell'errore. */
export const parseArgs = <TSchema extends z.ZodType>(schema: TSchema, raw: unknown): ParsedArgs<z.output<TSchema>> => {
  const result = schema.safeParse(raw ?? {});
  if (result.success) return { ok: true, value: result.data };
  const issue = result.error.issues.at(0);
  const field = issue?.path.map(String).join(PATH_SEPARATOR) ?? '';
  return { ok: false, field: field.length > 0 ? field : FALLBACK_FIELD };
};
