/*
 * Pagine HTML di errore del login OIDC (docs/SERVER.md §7 e §10.2). Testo in italiano,
 * senza script né CSS esterni, con la stessa CSP stretta delle pagine OAuth (copiata
 * qui per non dipendere da `oauth/`). I messaggi sono costanti: nessun dato dell'utente.
 */

const CONTENT_SECURITY_POLICY = "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'";
const STYLE = `
body{margin:0;padding:16px;font:16px/1.5 system-ui,-apple-system,sans-serif;background:#fafafa;color:#1a1a1a}
main{max-width:28rem;margin:2rem auto}
h1{font-size:1.25rem}
@media (prefers-color-scheme:dark){body{background:#161616;color:#eee}}
`;

const documentShell = (title: string, message: string): string => `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<h1>${title}</h1>
<p>${message}</p>
</main>
</body>
</html>
`;

/** Pagina HTML con le intestazioni di sicurezza e `Cache-Control: no-store`. */
export const htmlPage = (status: number, title: string, message: string): Response =>
  new Response(documentShell(title, message), {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': CONTENT_SECURITY_POLICY,
      'Cache-Control': 'no-store',
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
    },
  });
