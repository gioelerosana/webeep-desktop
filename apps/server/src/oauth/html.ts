/*
 * Pagine HTML di `/authorize` e del consenso (docs/SERVER.md §5.3). Nessuno script, nessun
 * CSS esterno. Tutto ciò che arriva dal client o da Authentik (nome del client, host, nome
 * dell'utente) passa da `escapeHtml`: sono dati non fidati.
 */
import { CONSENT_PATH } from './constants.js';
import { htmlResponse } from './responses.js';

export type ConsentPage = {
  /** Nome dichiarato in registrazione; undefined se assente. */
  readonly clientName: string | undefined;
  /** Host del redirect_uri, con la porta se presente: è quello che l'utente deve riconoscere. */
  readonly redirectHost: string;
  /** Nome dell'utente Authentik, già scelto dal chiamante. */
  readonly userLabel: string;
  /** Token CSRF monouso legato a questa richiesta di consenso. */
  readonly consentToken: string;
  /** Origine di `redirect_uri`: serve in `form-action`, perché il browser applica la CSP anche al redirect. */
  readonly redirectOrigin: string;
};

const CSP_BASE = "default-src 'none'; style-src 'unsafe-inline'";
const CSP_FRAMING = "frame-ancestors 'none'; base-uri 'none'";
const UNNAMED_CLIENT = "un'app senza nome";

const STYLE = `
body{margin:0;padding:16px;font:16px/1.5 system-ui,-apple-system,sans-serif;background:#fafafa;color:#1a1a1a}
main{max-width:28rem;margin:2rem auto}
h1{font-size:1.25rem}
button{margin-top:1rem;margin-right:.75rem;padding:.6rem 1.2rem;font:inherit;cursor:pointer}
@media (prefers-color-scheme:dark){body{background:#161616;color:#eee}}
`;

/** Escape dei cinque caratteri HTML. `&` va per primo, altrimenti si raddoppia. */
export const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const documentShell = (title: string, content: string): string => `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
${content}
</main>
</body>
</html>
`;

const consentTitle = (page: ConsentPage): string =>
  `Autorizza ${page.clientName ?? UNNAMED_CLIENT} (${page.redirectHost}) ad accedere a WeBeep in sola lettura`;

const consentContent = (page: ConsentPage): string =>
  [
    `<h1>${escapeHtml(consentTitle(page))}</h1>`,
    `<p>Accesso effettuato come ${escapeHtml(page.userLabel)}.</p>`,
    '<p>Il client potrà leggere corsi, materiali, scadenze e notifiche di WeBeep tramite questo server.</p>',
    `<form method="post" action="${CONSENT_PATH}">`,
    `<input type="hidden" name="consent" value="${escapeHtml(page.consentToken)}">`,
    '<button type="submit" name="decision" value="allow">autorizza</button>',
    '<button type="submit" name="decision" value="deny">annulla</button>',
    '</form>',
  ].join('\n');

/**
 * Pagina di consenso (docs/SERVER.md §5.3). `form-action` include l'origine di `redirect_uri`:
 * dopo l'invio del form il browser segue il redirect e applica la CSP anche a quello.
 */
export const consentPageResponse = (status: number, page: ConsentPage): Response =>
  htmlResponse(
    status,
    documentShell(consentTitle(page), consentContent(page)),
    `${CSP_BASE}; form-action 'self' ${page.redirectOrigin}; ${CSP_FRAMING}`,
  );

/** Pagina di errore che non reindirizza: client o redirect_uri non validi, richiesta scaduta. */
export const errorPageResponse = (status: number, title: string, message: string): Response =>
  htmlResponse(
    status,
    documentShell(title, `<h1>${escapeHtml(title)}</h1>\n<p>${escapeHtml(message)}</p>`),
    `${CSP_BASE}; ${CSP_FRAMING}`,
  );
