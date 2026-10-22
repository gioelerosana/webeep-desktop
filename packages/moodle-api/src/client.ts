/*
 * Client REST per Moodle (web service `moodle_mobile_app`).
 *
 * Un'unica primitiva, `call`, che invia una funzione al server e valida la
 * risposta con uno schema zod; gli endpoint tipizzati in `endpoints.ts` sono
 * costruiti sopra. Il client non conosce Electron né il disco: riceve il token
 * e (in test) un `fetch` finto.
 */
import type { z } from 'zod';
import { MoodleApiError, MoodleNetworkError, MoodleResponseShapeError } from './errors.js';
import { encodeMoodleParams, type MoodleParams } from './params.js';

const REST_PATH = '/webservice/rest/server.php';
const AJAX_NOLOGIN_PATH = '/lib/ajax/service-nologin.php';
const REST_FORMAT = 'json';

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export type MoodleClientOptions = {
  readonly siteUrl: string;
  readonly token: string;
  readonly fetch?: FetchLike;
};

export type MoodleClient = {
  readonly siteUrl: string;
  readonly call: <TSchema extends z.ZodType>(
    wsfunction: string,
    params: MoodleParams,
    schema: TSchema,
  ) => Promise<z.output<TSchema>>;
};

type MoodleErrorBody = { readonly exception: string; readonly errorcode: string; readonly message: string };

const isMoodleErrorBody = (body: unknown): body is MoodleErrorBody =>
  typeof body === 'object' && body !== null && 'exception' in body && 'errorcode' in body;

// Una o più barre in fondo all'URL: "https://webeep.polimi.it//" → "https://webeep.polimi.it";
// "https://webeep.polimi.it" resta invariato.
// https://regex101.com/?regex=%5C%2F%2B%24&testString=https%3A%2F%2Fwebeep.polimi.it%2F%2F%0Ahttps%3A%2F%2Fwebeep.polimi.it&flavor=javascript
const trimTrailingSlash = (url: string): string => url.replace(/\/+$/, '');

const postForm = async (fetchFn: FetchLike, url: string, body: URLSearchParams): Promise<unknown> => {
  let response: Response;
  try {
    response = await fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
  } catch (cause) {
    throw new MoodleNetworkError(`Impossibile contattare ${url}`, undefined, { cause });
  }
  if (!response.ok) throw new MoodleNetworkError(`HTTP ${response.status} da ${url}`, response.status);
  return response.json();
};

const parseWith = <TSchema extends z.ZodType>(wsfunction: string, schema: TSchema, body: unknown): z.output<TSchema> => {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new MoodleResponseShapeError(wsfunction, parsed.error.message);
  return parsed.data;
};

export const createMoodleClient = (options: MoodleClientOptions): MoodleClient => {
  const siteUrl = trimTrailingSlash(options.siteUrl);
  const fetchFn: FetchLike = options.fetch ?? fetch;

  const call = async <TSchema extends z.ZodType>(
    wsfunction: string,
    params: MoodleParams,
    schema: TSchema,
  ): Promise<z.output<TSchema>> => {
    const form = encodeMoodleParams({
      ...params,
      wstoken: options.token,
      wsfunction,
      moodlewsrestformat: REST_FORMAT,
    });
    const body = await postForm(fetchFn, `${siteUrl}${REST_PATH}?wsfunction=${wsfunction}`, form);
    if (isMoodleErrorBody(body)) throw new MoodleApiError(body.errorcode, body.message, wsfunction);
    return parseWith(wsfunction, schema, body);
  };

  return { siteUrl, call };
};

/**
 * Chiama una funzione AJAX pubblica (senza login), es.
 * `tool_mobile_get_public_config`. Serve prima di avere un token.
 */
export const callPublicAjax = async <TSchema extends z.ZodType>(
  siteUrl: string,
  methodname: string,
  args: MoodleParams,
  schema: TSchema,
  fetchFn: FetchLike = fetch,
): Promise<z.output<TSchema>> => {
  const url = `${trimTrailingSlash(siteUrl)}${AJAX_NOLOGIN_PATH}?info=${methodname}`;
  let response: Response;
  try {
    response = await fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ index: 0, methodname, args }]),
    });
  } catch (cause) {
    throw new MoodleNetworkError(`Impossibile contattare ${url}`, undefined, { cause });
  }
  if (!response.ok) throw new MoodleNetworkError(`HTTP ${response.status} da ${url}`, response.status);
  const body: unknown = await response.json();
  const first: unknown = Array.isArray(body) ? body[0] : undefined;
  if (typeof first !== 'object' || first === null || !('error' in first) || !('data' in first)) {
    throw new MoodleResponseShapeError(methodname, 'risposta AJAX senza { error, data }');
  }
  if (first.error) throw new MoodleApiError('ajaxerror', JSON.stringify(first.data), methodname);
  return parseWith(methodname, schema, first.data);
};
