/*
 * Pagine HTML minime di `/authorize` (docs/SERVER.md §5.3). Nessuno script, nessun CSS
 * esterno. Tutto ciò che arriva dal client (nome, parametri nascosti, messaggi) passa da
 * `escapeHtml`: il nome del client è dato non fidato.
 */
import { htmlResponse } from './responses.js';

export type HiddenField = readonly [name: string, value: string];

export type AuthorizePage = {
  /** Nome dichiarato in registrazione; undefined se assente. */
  readonly clientName: string | undefined;
  readonly fields: readonly HiddenField[];
  /** Origine di `redirect_uri`: serve in `form-action`, perché il browser applica la CSP anche al redirect. */
  readonly redirectOrigin: string;
  readonly errorMessage: string | undefined;
};

const CSP_BASE = "default-src 'none'; style-src 'unsafe-inline'";
const CSP_FRAMING = "frame-ancestors 'none'; base-uri 'none'";
const UNNAMED_CLIENT = "un'app senza nome";

const STYLE = `
body{margin:0;padding:16px;font:16px/1.5 system-ui,-apple-system,sans-serif;background:#fafafa;color:#1a1a1a}
main{max-width:28rem;margin:2rem auto}
h1{font-size:1.25rem}
label{display:block;margin:1rem 0 .25rem}
input{box-sizing:border-box;width:100%;padding:.6rem;font:inherit}
button{margin-top:1rem;padding:.6rem 1.2rem;font:inherit;cursor:pointer}
.errore{color:#b00020}
@media (prefers-color-scheme:dark){body{background:#161616;color:#eee}input{background:#222;color:#eee;border:1px solid #444}.errore{color:#ff8a80}}
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

const authorizeTitle = (clientName: string | undefined): string =>
  `Autorizza ${clientName ?? UNNAMED_CLIENT} ad accedere a WeBeep`;

const hiddenInput = ([name, value]: HiddenField): string =>
  `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`;

const authorizeContent = (page: AuthorizePage): string => {
  const error =
    page.errorMessage === undefined ? '' : `<p class="errore" role="alert">${escapeHtml(page.errorMessage)}</p>\n`;
  return [
    `<h1>${escapeHtml(authorizeTitle(page.clientName))}</h1>`,
    '<p>Il client potrà leggere corsi, materiali, scadenze e notifiche di WeBeep tramite questo server.</p>',
    error.trimEnd(),
    '<form method="post" action="/authorize">',
    page.fields.map(hiddenInput).join('\n'),
    '<label for="password">Password di amministrazione</label>',
    '<input id="password" name="password" type="password" autocomplete="current-password" required>',
    '<button type="submit">autorizza</button>',
    '</form>',
  ]
    .filter((line) => line.length > 0)
    .join('\n');
};

export const authorizePageResponse = (status: number, page: AuthorizePage): Response =>
  htmlResponse(
    status,
    documentShell(authorizeTitle(page.clientName), authorizeContent(page)),
    `${CSP_BASE}; form-action 'self' ${page.redirectOrigin}; ${CSP_FRAMING}`,
  );

/** Pagina di errore che non reindirizza: client o redirect_uri non validi, o accesso sospeso. */
export const errorPageResponse = (status: number, title: string, message: string): Response =>
  htmlResponse(
    status,
    documentShell(title, `<h1>${escapeHtml(title)}</h1>\n<p>${escapeHtml(message)}</p>`),
    `${CSP_BASE}; ${CSP_FRAMING}`,
  );
