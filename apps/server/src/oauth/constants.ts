/*
 * Costanti del modulo OAuth (docs/SERVER.md §5 e §9). I tempi sono in millisecondi,
 * salvo i nomi che dicono altro.
 */

export const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

// Access token: 1 ora, solo in memoria (docs/SERVER.md §3.2).
export const ACCESS_TOKEN_TTL_SECONDS = SECONDS_PER_MINUTE * MINUTES_PER_HOUR;
export const ACCESS_TOKEN_TTL_MS = ACCESS_TOKEN_TTL_SECONDS * MS_PER_SECOND;

// Refresh token: 30 giorni, su disco come hash SHA-256.
const REFRESH_TOKEN_TTL_DAYS = 30;
export const REFRESH_TOKEN_TTL_MS =
  REFRESH_TOKEN_TTL_DAYS * HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MS_PER_SECOND;

// Codice di autorizzazione: 60 secondi, monouso.
export const AUTHORIZATION_CODE_TTL_MS = SECONDS_PER_MINUTE * MS_PER_SECOND;

export const MAX_REGISTERED_CLIENTS = 20;
export const MAX_REDIRECT_URIS = 10;
export const MAX_CLIENT_NAME_LENGTH = 200;

// Lunghezze in byte prima della codifica base64url.
export const TOKEN_BYTES = 32;
export const CLIENT_ID_BYTES = 32;
export const AUTHORIZATION_CODE_BYTES = 32;

export const RESPONSE_TYPE_CODE = 'code';
export const CODE_CHALLENGE_METHOD_S256 = 'S256';
export const GRANT_AUTHORIZATION_CODE = 'authorization_code';
export const GRANT_REFRESH_TOKEN = 'refresh_token';
export const TOKEN_AUTH_METHOD_NONE = 'none';
export const TOKEN_TYPE_BEARER = 'Bearer';

export const HTTPS_PROTOCOL = 'https:';
export const HTTP_PROTOCOL = 'http:';
export const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1']);

const PKCE_MIN_LENGTH = 43;
const PKCE_MAX_LENGTH = 128;
// PKCE (RFC 7636 §4.1 e §4.2): code_verifier e code_challenge sono lunghi da 43 a 128
// caratteri, tra lettere, cifre e i simboli - . _ ~.
// Accetta: `dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk` (43 caratteri, esempio della RFC).
// Non accetta: `corto` (troppo breve) oppure valori con `+`, `/` o `=`.
// https://regex101.com/?regex=%5E%5BA-Za-z0-9._~-%5D%7B43%2C128%7D%24&testString=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk&flavor=javascript
export const PKCE_VALUE_PATTERN = new RegExp(`^[A-Za-z0-9._~-]{${PKCE_MIN_LENGTH},${PKCE_MAX_LENGTH}}$`);

// Percorsi del modulo.
export const PROTECTED_RESOURCE_PATH = '/.well-known/oauth-protected-resource';
export const PROTECTED_RESOURCE_ALIAS_PATH = '/.well-known/oauth-protected-resource/mcp';
export const AUTHORIZATION_SERVER_PATH = '/.well-known/oauth-authorization-server';
export const REGISTER_PATH = '/register';
export const AUTHORIZE_PATH = '/authorize';
export const TOKEN_PATH = '/token';
export const REVOKE_PATH = '/revoke';

export const BEARER_SCHEME = 'bearer';
export const BEARER_SEPARATOR = ' ';
