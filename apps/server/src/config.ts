/*
 * Configurazione del server, letta dall'ambiente e validata con zod (docs/SERVER.md §2).
 *
 * È una funzione pura: riceve l'ambiente come argomento e non tocca `process`, quindi
 * il nucleo può importarne il tipo. Gli errori nominano solo la variabile, mai il valore.
 */
import { z } from 'zod';

/** Configurazione del login Authentik (docs/SERVER.md §10). Il segreto resta solo in memoria. */
export type OidcConfig = {
  /** Issuer senza slash finale: base della discovery e termine del confronto con il campo `issuer`. */
  readonly issuer: string;
  readonly clientId: string;
  /** Segreto del client confidenziale: solo da ambiente, mai in log, risposte o disco. */
  readonly clientSecret: string;
  /** Gruppo Authentik richiesto per accedere (confronto esatto). */
  readonly allowedGroup: string;
};

export type Config = {
  /** Origine pubblica `https://host[:porta]`, senza slash finale: è l'issuer OAuth. */
  readonly publicUrl: string;
  /** URL del connettore MCP: `publicUrl` più `/mcp`. */
  readonly resourceUrl: string;
  /** Chiave AES-256-GCM dello stato, già decodificata (32 byte). */
  readonly secretKey: Uint8Array<ArrayBuffer>;
  readonly oidc: OidcConfig;
  readonly port: number;
  readonly dataDir: string;
  /** Se true, l'IP client è l'ultimo valore di `X-Forwarded-For` (vedi adattatore Node). */
  readonly trustProxy: boolean;
};

export type EnvRecord = Readonly<Record<string, string | undefined>>;

export class ConfigError extends Error {
  override readonly name = 'ConfigError';
  readonly lines: readonly string[];

  constructor(lines: readonly string[]) {
    super(lines.join('\n'));
    this.lines = lines;
  }
}

// 32 byte in base64 standard con padding: 44 caratteri.
const SECRET_KEY_BYTES = 32;
const SECRET_KEY_BASE64_LENGTH = 44;
const DEFAULT_PORT = 8787;
const MIN_PORT = 1;
const MAX_PORT = 65535;
const DEFAULT_DATA_DIR = '/data';
const DEFAULT_TRUST_PROXY = 'false';
const DEFAULT_OIDC_ALLOWED_GROUP = 'webeep';
const TRUE_VALUE = 'true';
const FALSE_VALUE = 'false';
const HTTPS_PROTOCOL = 'https:';
const RESOURCE_PATH = '/mcp';
const TRAILING_SLASH = '/';
const GENERIC_CONFIG_LINE = 'configurazione non valida';

const CONFIG_KEYS = [
  'WEBEEP_PUBLIC_URL',
  'WEBEEP_SECRET_KEY',
  'WEBEEP_OIDC_ISSUER',
  'WEBEEP_OIDC_CLIENT_ID',
  'WEBEEP_OIDC_CLIENT_SECRET',
  'WEBEEP_OIDC_ALLOWED_GROUP',
  'PORT',
  'WEBEEP_DATA_DIR',
  'WEBEEP_TRUST_PROXY',
] as const;

type ConfigKey = (typeof CONFIG_KEYS)[number];

const NON_EMPTY_MESSAGE = 'deve essere una stringa non vuota';

// Messaggi fissi: non dipendono dal valore ricevuto (niente `received` di zod).
const MESSAGES: Readonly<Record<ConfigKey, string>> = {
  WEBEEP_PUBLIC_URL: 'deve essere un URL https assoluto, senza percorso né slash finale',
  WEBEEP_SECRET_KEY: 'deve essere 32 byte in base64',
  WEBEEP_OIDC_ISSUER: 'deve essere un URL https assoluto, senza query né frammento',
  WEBEEP_OIDC_CLIENT_ID: NON_EMPTY_MESSAGE,
  WEBEEP_OIDC_CLIENT_SECRET: NON_EMPTY_MESSAGE,
  WEBEEP_OIDC_ALLOWED_GROUP: NON_EMPTY_MESSAGE,
  PORT: `deve essere un intero tra ${MIN_PORT} e ${MAX_PORT}`,
  WEBEEP_DATA_DIR: 'deve essere un percorso non vuoto',
  WEBEEP_TRUST_PROXY: `deve essere ${TRUE_VALUE} o ${FALSE_VALUE}`,
};

const isConfigKey = (value: unknown): value is ConfigKey => CONFIG_KEYS.some((key) => key === value);

/** Restituisce l'origine se `value` è esattamente un'origine https (senza slash, percorso, query). */
const httpsOriginOf = (value: string): string | null => {
  if (!URL.canParse(value)) return null;
  const url = new URL(value);
  return url.protocol === HTTPS_PROTOCOL && url.origin === value ? value : null;
};

/** Toglie una sola slash finale: `https://a/o/webeep/` e `https://a/o/webeep` diventano uguali. */
export const normalizeIssuer = (value: string): string =>
  value.endsWith(TRAILING_SLASH) ? value.slice(0, -TRAILING_SLASH.length) : value;

/** Restituisce l'issuer normalizzato se è un URL https assoluto senza query né frammento. */
const httpsIssuerOf = (value: string): string | null => {
  if (value.includes('?') || value.includes('#') || !URL.canParse(value)) return null;
  const url = new URL(value);
  return url.protocol === HTTPS_PROTOCOL ? normalizeIssuer(value) : null;
};

/** Decodifica la chiave: 44 caratteri base64 che danno esattamente 32 byte. */
const decodeSecretKey = (value: string): Uint8Array<ArrayBuffer> | null => {
  if (value.length !== SECRET_KEY_BASE64_LENGTH) return null;
  try {
    const bytes = Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
    return bytes.byteLength === SECRET_KEY_BYTES ? bytes : null;
  } catch {
    // `atob` lancia su caratteri fuori dall'alfabeto base64: per la configurazione è un valore non valido.
    return null;
  }
};

const publicUrlSchema = z.string().transform((value, ctx) => {
  const origin = httpsOriginOf(value);
  if (origin === null) {
    ctx.addIssue({ code: 'custom', message: MESSAGES.WEBEEP_PUBLIC_URL });
    return z.NEVER;
  }
  return origin;
});

const oidcIssuerSchema = z.string().transform((value, ctx) => {
  const issuer = httpsIssuerOf(value);
  if (issuer === null) {
    ctx.addIssue({ code: 'custom', message: MESSAGES.WEBEEP_OIDC_ISSUER });
    return z.NEVER;
  }
  return issuer;
});

const secretKeySchema = z.string().transform((value, ctx) => {
  const bytes = decodeSecretKey(value);
  if (bytes === null) {
    ctx.addIssue({ code: 'custom', message: MESSAGES.WEBEEP_SECRET_KEY });
    return z.NEVER;
  }
  return bytes;
});

const portSchema = z.string().default(String(DEFAULT_PORT)).transform((value, ctx) => {
  const port = Number(value);
  if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) {
    ctx.addIssue({ code: 'custom', message: MESSAGES.PORT });
    return z.NEVER;
  }
  return port;
});

const trustProxySchema = z
  .enum([TRUE_VALUE, FALSE_VALUE])
  .default(DEFAULT_TRUST_PROXY)
  .transform((value) => value === TRUE_VALUE);

const envSchema = z.object({
  WEBEEP_PUBLIC_URL: publicUrlSchema,
  WEBEEP_SECRET_KEY: secretKeySchema,
  WEBEEP_OIDC_ISSUER: oidcIssuerSchema,
  WEBEEP_OIDC_CLIENT_ID: z.string().min(1),
  WEBEEP_OIDC_CLIENT_SECRET: z.string().min(1),
  WEBEEP_OIDC_ALLOWED_GROUP: z.string().min(1).default(DEFAULT_OIDC_ALLOWED_GROUP),
  PORT: portSchema,
  WEBEEP_DATA_DIR: z.string().min(1).default(DEFAULT_DATA_DIR),
  WEBEEP_TRUST_PROXY: trustProxySchema,
});

/** Una riga per variabile non valida, nella forma `NOME: regola`. */
const linesFor = (issues: readonly { readonly path: readonly PropertyKey[] }[]): readonly string[] => {
  const keys = [...new Set(issues.map((issue) => issue.path[0]).filter(isConfigKey))];
  const lines = keys.map((key) => `${key}: ${MESSAGES[key]}`);
  return lines.length > 0 ? lines : [GENERIC_CONFIG_LINE];
};

/** Valida l'ambiente. Lancia `ConfigError` con una riga per variabile sbagliata. */
export const loadConfig = (env: EnvRecord): Config => {
  const result = envSchema.safeParse(env);
  if (!result.success) throw new ConfigError(linesFor(result.error.issues));

  const data = result.data;
  return {
    publicUrl: data.WEBEEP_PUBLIC_URL,
    resourceUrl: `${data.WEBEEP_PUBLIC_URL}${RESOURCE_PATH}`,
    secretKey: data.WEBEEP_SECRET_KEY,
    oidc: {
      issuer: data.WEBEEP_OIDC_ISSUER,
      clientId: data.WEBEEP_OIDC_CLIENT_ID,
      clientSecret: data.WEBEEP_OIDC_CLIENT_SECRET,
      allowedGroup: data.WEBEEP_OIDC_ALLOWED_GROUP,
    },
    port: data.PORT,
    dataDir: data.WEBEEP_DATA_DIR,
    trustProxy: data.WEBEEP_TRUST_PROXY,
  };
};
