/*
 * Adattatore Node (`node:http`) e avvio del server (docs/SERVER.md §1 e §7).
 *
 * Converte IncomingMessage in Request e Response in ServerResponse (con streaming, così
 * funzionano anche gli SSE), legge la configurazione dall'ambiente e ascolta su PORT.
 * Il processo ascolta in chiaro: il TLS lo termina il reverse proxy.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ConfigError, loadConfig, type Config } from './config.js';
import { createApp, type App } from './http/app.js';
import { createFileStateStore, prepareDataDir } from './state/file-store.js';
import { StateUnreadableError } from './state/codec.js';
import { createStateManager } from './state/manager.js';

const LISTEN_HOST = '0.0.0.0';
// Base solo per costruire l'URL: l'header Host non è mai usato per le decisioni.
const URL_BASE = 'http://localhost';
const BODYLESS_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD']);
const UNKNOWN_CLIENT = 'unknown';
// Indice dell'ultimo elemento di una lista separata da virgole (`X-Forwarded-For`).
const LAST_ITEM = -1;
const EXIT_FAILURE = 1;
const MS_PRECISION = 0;
const INTERNAL_ERROR_BODY = '{"error":"internal"}';

const fail = (lines: readonly string[]): never => {
  lines.forEach((line) => process.stderr.write(`${line}\n`));
  return process.exit(EXIT_FAILURE);
};

const errorName = (error: unknown): string => (error instanceof Error ? error.name : 'unknown');

const loadConfigOrExit = (): Config => {
  try {
    return loadConfig(process.env);
  } catch (error) {
    if (error instanceof ConfigError) return fail(error.lines);
    throw error;
  }
};

/**
 * IP del client. Con `WEBEEP_TRUST_PROXY=true` si usa l'ULTIMO valore di `X-Forwarded-For`,
 * cioè quello aggiunto dal proxy fidato (Caddy o Cloudflare). Il primo valore non si usa:
 * è scritto dal client, che può inviare un `X-Forwarded-For` qualsiasi e il proxy lo
 * conserva in testa. Senza header, o con proxy disattivato, si usa il socket.
 */
const clientIpOf = (req: IncomingMessage, trustProxy: boolean): string => {
  const forwarded = req.headers['x-forwarded-for'];
  if (trustProxy && typeof forwarded === 'string') {
    const parts = forwarded.split(',');
    const last = parts.at(LAST_ITEM)?.trim();
    if (last !== undefined && last.length > 0) return last;
  }
  return req.socket.remoteAddress ?? UNKNOWN_CLIENT;
};

const toRequest = (req: IncomingMessage, url: URL): Request => {
  const method = req.method ?? 'GET';
  const headers = new Headers();
  Object.entries(req.headers).forEach(([name, value]) => {
    if (value === undefined) return;
    const values = Array.isArray(value) ? value : [value];
    values.forEach((item) => headers.append(name, item));
  });
  const hasBody = !BODYLESS_METHODS.has(method);
  return new Request(url, {
    method,
    headers,
    body: hasBody ? Readable.toWeb(req) : undefined,
    duplex: 'half',
  });
};

const writeResponse = async (res: ServerResponse, response: Response): Promise<void> => {
  res.statusCode = response.status;
  response.headers.forEach((value, name) => res.setHeader(name, value));
  if (response.body === null) {
    res.end();
    return;
  }
  await pipeline(Readable.fromWeb(response.body), res);
};

// Una riga per richiesta: istante, metodo, percorso (senza query), stato e durata.
const logRequest = (method: string, pathname: string, status: number, elapsedMs: number): void => {
  const duration = elapsedMs.toFixed(MS_PRECISION);
  console.log(`${new Date().toISOString()} ${method} ${pathname} ${status} ${duration}ms`);
};

const serve = async (req: IncomingMessage, res: ServerResponse, app: App, config: Config): Promise<void> => {
  const started = performance.now();
  const url = new URL(`${URL_BASE}${req.url ?? '/'}`);
  const response = await app.handle(toRequest(req, url), { clientIp: clientIpOf(req, config.trustProxy) });
  logRequest(req.method ?? 'GET', url.pathname, response.status, performance.now() - started);
  await writeResponse(res, response);
};

const onRequest = async (req: IncomingMessage, res: ServerResponse, app: App, config: Config): Promise<void> => {
  try {
    await serve(req, res, app, config);
  } catch (error) {
    // Errori fuori dal nucleo (per esempio un URL malformato): niente dettagli nella risposta.
    console.error(`errore interno: ${errorName(error)}`);
    if (res.headersSent) {
      res.destroy();
      return;
    }
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(INTERNAL_ERROR_BODY);
  }
};

const start = async (): Promise<void> => {
  const config = loadConfigOrExit();

  try {
    await prepareDataDir(config.dataDir);
  } catch {
    return fail([`WEBEEP_DATA_DIR: deve essere una directory scrivibile`]);
  }

  const store = createFileStateStore(config.dataDir);
  const state = await createStateManager({ store, secretKey: config.secretKey });
  try {
    await state.read();
  } catch (error) {
    if (error instanceof StateUnreadableError) return fail([error.message]);
    throw error;
  }

  const app = createApp({ config, store: state });
  const server = createServer((req, res) => {
    void onRequest(req, res, app, config);
  });

  server.listen(config.port, LISTEN_HOST, () => {
    console.log(`webeep-server in ascolto sulla porta ${config.port}`);
  });

  process.on('SIGTERM', () => {
    server.close(() => process.exit(0));
  });
};

process.on('uncaughtException', (error) => {
  // Solo il nome della classe: il messaggio può contenere dati sensibili.
  console.error(`errore non gestito: ${errorName(error)}`);
  process.exit(EXIT_FAILURE);
});

const main = async (): Promise<void> => {
  try {
    await start();
  } catch (error) {
    fail([`avvio non riuscito: ${errorName(error)}`]);
  }
};

void main();
