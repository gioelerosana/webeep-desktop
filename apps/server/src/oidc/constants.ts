/*
 * Costanti del modulo OIDC (docs/SERVER.md §10). I tempi sono in millisecondi.
 */

export const OIDC_CALLBACK_PATH = '/oidc/callback';
export const DISCOVERY_PATH = '/.well-known/openid-configuration';
export const OIDC_SCOPE = 'openid profile email';

export const MS_PER_SECOND = 1000;
// Login pendente: 10 minuti, monouso (docs/SERVER.md §3.2).
export const PENDING_LOGIN_TTL_MS = 10 * 60 * MS_PER_SECOND;
// Tetto ai login pendenti in memoria: oltre il tetto si scarta il più vecchio, così
// chiamate ripetute a `startLogin` non fanno crescere la memoria senza limite.
export const MAX_PENDING_LOGINS = 1000;
// Timeout di ogni chiamata verso Authentik.
export const OIDC_REQUEST_TIMEOUT_MS = 10 * MS_PER_SECOND;

// Lunghezze in byte prima della codifica base64url.
export const STATE_BYTES = 32;
export const NONCE_BYTES = 32;
export const CODE_VERIFIER_BYTES = 32;

export const HTTP_OK = 200;
export const HTTP_BAD_REQUEST = 400;
export const HTTP_FORBIDDEN = 403;
export const HTTP_METHOD_NOT_ALLOWED = 405;
export const HTTP_SERVICE_UNAVAILABLE = 503;
export const GET_METHOD = 'GET';

export const HTTPS_PROTOCOL = 'https:';
export const TRAILING_SLASH = '/';

export const FORM_CONTENT_TYPE = 'application/x-www-form-urlencoded';
export const JSON_ACCEPT = 'application/json';
export const BASIC_SCHEME = 'Basic';
export const BEARER_SCHEME = 'Bearer';
export const CREDENTIALS_SEPARATOR = ':';

// Un JWT ha tre parti separate da punti; la seconda è il payload con i claim.
export const JWT_SEPARATOR = '.';
export const JWT_PARTS_COUNT = 3;
export const JWT_PAYLOAD_INDEX = 1;
// Il base64 lavora a blocchi di 4 caratteri: il padding porta la lunghezza a un multiplo di 4.
export const BASE64_BLOCK_LENGTH = 4;
export const BASE64_PADDING = '=';
