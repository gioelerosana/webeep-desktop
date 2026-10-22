/*
 * Modalità web (`WEBEEP_WEB=1`): il main serve renderer e API via HTTP in rete locale,
 * con la sessione WeBeep salvata dall'app desktop. Il token resta nel main: il browser
 * riceve solo `IpcResult`, immagini e file in streaming.
 *
 * Accesso: a ogni avvio si genera una chiave casuale, stampata nel terminale come
 * `http://<ip>:<porta>/?key=<chiave>`. La prima richiesta con la chiave giusta imposta
 * un cookie HttpOnly e reindirizza a `/`; tutte le altre richieste senza cookie valido
 * ricevono 401. Chiave nuova a ogni avvio: un link vecchio smette di funzionare.
 */
import { app } from 'electron';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type RequestListener, type Server, type ServerResponse } from 'node:http';
import { networkInterfaces } from 'node:os';
import { MoodleNetworkError } from '@webeep/moodle-api';
import { NotSignedInError } from './auth.js';
import { InvalidFileRequestError } from './files.js';
import { handleApiRequest } from './web-routes.js';
import {
  HTTP_BAD_GATEWAY,
  HTTP_FORBIDDEN,
  HTTP_FOUND,
  HTTP_INTERNAL_ERROR,
  HTTP_UNAUTHORIZED,
  sendText,
} from './web-http.js';
import { serveRenderer } from './web-static.js';

const WEB_ENV_VAR = 'WEBEEP_WEB';
const WEB_ENABLED_VALUE = '1';
const PORT_ENV_VAR = 'WEBEEP_WEB_PORT';
const DEFAULT_PORT = 4173;
const MIN_PORT = 1;
const MAX_PORT = 65535;
const KEY_BYTES = 24;
const KEY_PARAM = 'key';
const COOKIE_NAME = 'webeep_key';
const COOKIE_SEPARATOR = ';';
const API_PREFIX = '/api/';
const BIND_HOST = '0.0.0.0';
const LOOPBACK_HOST = 'localhost';
const LOOPBACK_BASE_URL = `http://${LOOPBACK_HOST}`;
const LAN_ADDRESS_FAMILY = 'IPv4';
const LOG_PREFIX = '[web]';
const UNAUTHORIZED_TEXT = 'Accesso negato. Apri dal computer con WeBeep Desktop il link stampato nel terminale.';
const SIGNED_OUT_TEXT = "Accesso richiesto: accedi dall'app desktop.";

export const isWebMode = (): boolean => process.env[WEB_ENV_VAR] === WEB_ENABLED_VALUE;

const digest = (value: string): Buffer => createHash('sha256').update(value).digest();

/** Confronto a tempo costante: si confrontano gli hash, così la lunghezza della chiave non si rivela. */
const keysMatch = (candidate: string | null | undefined, expectedDigest: Buffer): boolean =>
  typeof candidate === 'string' && timingSafeEqual(digest(candidate), expectedDigest);

const cookieValue = (header: string | undefined, name: string): string | undefined => {
  const prefix = `${name}=`;
  const pair = (header ?? '')
    .split(COOKIE_SEPARATOR)
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix));
  return pair?.slice(prefix.length);
};

const readPort = (): number => {
  const raw = process.env[PORT_ENV_VAR];
  if (raw === undefined) return DEFAULT_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) {
    throw new Error(`${PORT_ENV_VAR} non valida: "${raw}"`);
  }
  return port;
};

const lanAddresses = (): readonly string[] =>
  Object.values(networkInterfaces())
    .flatMap((infos) => infos ?? [])
    .filter((info) => info.family === LAN_ADDRESS_FAMILY && !info.internal)
    .map((info) => info.address);

const printAccessInfo = (port: number, key: string): void => {
  const addresses = lanAddresses();
  const hosts = addresses.length > 0 ? addresses : [LOOPBACK_HOST];
  console.log(`${LOG_PREFIX} In ascolto sulla porta ${port}. Apri dal browser di un dispositivo in rete locale:`);
  hosts.forEach((host) => console.log(`${LOG_PREFIX}   http://${host}:${port}/?key=${key}`));
  console.warn(`${LOG_PREFIX} Attenzione: chiunque abbia questo URL vede i dati WeBeep. Non condividerlo.`);
};

const grantAccess = (res: ServerResponse, key: string): void => {
  res.writeHead(HTTP_FOUND, {
    Location: '/',
    'Set-Cookie': `${COOKIE_NAME}=${key}; HttpOnly; SameSite=Strict; Path=/`,
    'Cache-Control': 'no-store',
  });
  res.end();
};

const route = async (req: IncomingMessage, res: ServerResponse, key: string, keyDigest: Buffer): Promise<void> => {
  const url = new URL(req.url ?? '/', LOOPBACK_BASE_URL);
  if (keysMatch(url.searchParams.get(KEY_PARAM), keyDigest)) return grantAccess(res, key);
  if (!keysMatch(cookieValue(req.headers.cookie, COOKIE_NAME), keyDigest)) return sendText(res, HTTP_UNAUTHORIZED, UNAUTHORIZED_TEXT);
  if (url.pathname.startsWith(API_PREFIX)) return handleApiRequest(req, res, url);
  return serveRenderer(req, res, url.pathname);
};

const describeError = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * Traduce un errore in risposta HTTP. Le classi note hanno uno stato dedicato; il resto
 * è un errore inatteso: si registra nel terminale e il client riceve un messaggio generico.
 */
const respondWithError = (res: ServerResponse, error: unknown): void => {
  if (res.headersSent) {
    // Lo stream era già partito: non si può più cambiare stato, si chiude la connessione.
    res.destroy();
    return;
  }
  if (error instanceof NotSignedInError) return sendText(res, HTTP_UNAUTHORIZED, SIGNED_OUT_TEXT);
  if (error instanceof InvalidFileRequestError) return sendText(res, HTTP_FORBIDDEN, 'URL non ammesso');
  if (error instanceof MoodleNetworkError) return sendText(res, HTTP_BAD_GATEWAY, 'File non disponibile su WeBeep');
  console.error(`${LOG_PREFIX} errore: ${describeError(error)}`);
  sendText(res, HTTP_INTERNAL_ERROR, 'Richiesta non riuscita');
};

const createRequestListener = (key: string): RequestListener => {
  const keyDigest = digest(key);
  return async (req, res) => {
    try {
      await route(req, res, key, keyDigest);
    } catch (error) {
      respondWithError(res, error);
    }
  };
};

const listen = (server: Server, port: number): Promise<void> =>
  new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, BIND_HOST, () => {
      server.off('error', reject);
      resolve();
    });
  });

/** Ctrl+C o SIGTERM: si chiudono le connessioni aperte e poi si esce. Il secondo segnale termina il processo. */
const stopOnSignal = (server: Server): void => {
  const stop = (): void => {
    server.close(() => app.quit());
    server.closeAllConnections();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
};

export const startWebServer = async (): Promise<void> => {
  const port = readPort();
  const key = randomBytes(KEY_BYTES).toString('base64url');
  const server = createServer(createRequestListener(key));
  await listen(server, port);
  printAccessInfo(port, key);
  stopOnSignal(server);
};
