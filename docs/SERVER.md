# Server privato WeBeep (`apps/server`)

> **Contratto v1.** Gli sotto-agenti lo implementano senza modificarlo. Le modifiche
> passano dall'orchestratore e producono una nuova versione di questo documento.
>
> Convenzione: **deve** e **non deve** indicano un obbligo; il resto è descrittivo.

## 1. Scopo e architettura

`apps/server` (pacchetto `@webeep/server`) è un processo Node 22, senza Electron, per
un solo utente: il proprietario. Gira su un server del proprietario (Docker dietro un
reverse proxy HTTPS) ed espone un server MCP (Streamable HTTP, modalità stateless,
endpoint `/mcp`) da collegare a Claude come connettore remoto.

- Solo lettura verso WeBeep (regola 8 di AGENTS.md): la v1 non ha tool di scrittura.
- Un solo account WeBeep collegato alla volta: quello dell'ultimo accoppiamento.

Architettura a tre strati:

| Strato | Contenuto | Vincoli |
|---|---|---|
| Nucleo | `handle(request: Request, ctx: { clientIp: string }): Promise<Response>`; router, OAuth 2.1, endpoint MCP, tool, accoppiamento | solo API Web standard (`Request`, `Response`, `fetch`, `URL`, `crypto.subtle`, `TextEncoder`); nessun import da `node:*`; usa `@webeep/moodle-api` (neutrale) e zod |
| Storage | interfaccia `StateStore`: `get(): Promise<Uint8Array \| null>` e `put(bytes: Uint8Array): Promise<void>`, che lavorano sullo stato **già cifrato** | implementazione v1: `FileStateStore` su file |
| Adattatore | `node:http` → `handle()`; configurazione da env; log; `FileStateStore` | unico adattatore della v1 |

Il nucleo cifra e decifra lo stato con `crypto.subtle`: lo store vede solo byte. Un
futuro adattatore (per esempio Cloudflare Workers) sostituisce adattatore e store, non
il nucleo. Non fa parte della v1.

Le scritture di stato sono serializzate: una alla volta, in ordine.

Struttura indicativa:

```
apps/server/
  src/http/     handle(), router, rate limit, risposte e lettura del corpo (solo Web API)
  src/oauth/    OAuth 2.1: metadati, registrazione, autorizzazione, token, revoca
  src/mcp/      endpoint MCP (Streamable HTTP, stateless), tool e formato dei risultati
  src/state/    StateStore, codifica e decodifica dello stato cifrato
  src/pair.ts   endpoint /pair (accoppiamento, sezione 4)
  src/webeep-session.ts  sessione WeBeep salvata, usata dai tool (token mai nelle risposte)
  src/crypto.ts primitive crittografiche del nucleo (solo `crypto.subtle`)
  src/config.ts configurazione da env, validata con zod
  src/node.ts  adattatore node:http, FileStateStore, avvio (listen su PORT)
  Dockerfile
  deploy/Caddyfile
```

## 2. Configurazione

Tutte le variabili sono lette all'avvio e validate con zod.

| Variabile | Obbligatoria | Regola | Note |
|---|---|---|---|
| `WEBEEP_PUBLIC_URL` | sì | URL `https` assoluto, senza percorso né slash finale (es. `https://webeep.example.it`) | è l'`issuer` e la `resource` OAuth; `<WEBEEP_PUBLIC_URL>/mcp` è l'URL del connettore |
| `WEBEEP_SECRET_KEY` | sì | 32 byte in base64 standard (44 caratteri con padding) | chiave AES-256-GCM dello stato; generazione: `openssl rand -base64 32` |
| `WEBEEP_ADMIN_PASSWORD` | sì | almeno 12 caratteri | password della pagina `/authorize` |
| `WEBEEP_PAIRING_KEY` | sì | almeno 32 caratteri | chiave degli endpoint `/pair` (sezione 4) |
| `PORT` | no | intero 1–65535; default `8787` | porta in ascolto |
| `WEBEEP_DATA_DIR` | no | default `/data` | directory di `state.bin` |

Regole di avvio:

- Se una variabile obbligatoria manca o non è valida, il processo scrive su stderr una
  riga per errore, nella forma `WEBEEP_SECRET_KEY: deve essere 32 byte in base64`, ed
  esce con codice 1.
- I messaggi **non devono** contenere i valori ricevuti: niente `received` di zod, niente
  valore nel testo. Vale anche per le eccezioni non gestite.
- Se `WEBEEP_DATA_DIR` non esiste, la crea con permessi 0700. Se non è scrivibile, esce
  con codice 1.
- Se `state.bin` esiste ma non si decifra (chiave errata o file corrotto) o non passa la
  validazione, il processo esce con codice 1 e il messaggio
  `state.bin non leggibile: controlla WEBEEP_SECRET_KEY`. Non sovrascrive il file.

## 3. Stato persistente

### 3.1 File su disco

`$WEBEEP_DATA_DIR/state.bin`, permessi 0600.

- Formato: `iv || ciphertext+tag`, con `iv` di 12 byte casuali, nuovi a ogni scrittura,
  e AES-256-GCM con la chiave decodificata da `WEBEEP_SECRET_KEY`.
- Il contenuto in chiaro, prima della cifratura, è un JSON UTF-8 che deve passare questo
  schema zod:

```ts
{
  version: 1,
  webeep: { siteUrl: string, token: string, privateToken?: string } | null,
  clients: OAuthClient[],
  refreshTokens: { hash: string, clientId: string, expiresAt: number }[]
}

OAuthClient = { clientId: string, clientName?: string, redirectUris: string[], createdAt: number }
```

- `hash`: SHA-256 del refresh token, in esadecimale minuscolo.
- `expiresAt` e `createdAt`: millisecondi epoch.
- Se il file manca, lo stato iniziale è `{ version: 1, webeep: null, clients: [], refreshTokens: [] }`
  e viene scritto alla prima modifica.
- Scrittura atomica: si scrive `state.bin.part`, si esegue `fsync`, poi si rinomina in
  `state.bin`. Un errore lascia intatto il file precedente.

### 3.2 Solo in memoria

- Access token: `Map<hash SHA-256 esadecimale, { clientId, expiresAt }>`. Mai su disco.
  Un riavvio li cancella: Claude riceve 401 e usa il refresh token.
- Codici di autorizzazione: `Map<hash SHA-256 del codice, { clientId, redirectUri, codeChallenge, resource?, expiresAt }>`,
  validi 60 secondi, monouso.
- Contatori di rate limit (sezione 9).

I token OAuth non compaiono mai in chiaro su disco: per i refresh token si salva solo
l'hash.

## 4. Accoppiamento (il token WeBeep arriva solo così)

Il token WeBeep entra nel server solo tramite `POST /pair`, chiamato dal main process
dell'app desktop (sezione 4.4).

### 4.1 Regole comuni

Tutti e tre gli endpoint usano `Authorization: Bearer <WEBEEP_PAIRING_KEY>`. I controlli
sono in quest'ordine:

1. **Rate limit.** Se l'IP ha già 5 tentativi falliti nella finestra corrente, risposta
   429 senza confrontare la chiave.
2. **Chiave.** Si calcola SHA-256 del valore del Bearer (lo schema `Bearer` è
   case-insensitive) e di `WEBEEP_PAIRING_KEY`, poi si confrontano i due digest a tempo
   costante. Header assente o malformato, o chiave diversa: 401.
3. **Metodo specifico**, descritto sotto.

Un tentativo è **fallito** se la risposta è 401 o 422. Il 429 non conta. La finestra dura
15 minuti e si apre al primo fallimento; alla sua scadenza il contatore torna a zero.

Il confronto a tempo costante è implementato nel nucleo sui digest (differenza dei byte
accumulata con `reduce`), perché il nucleo non usa `node:crypto`. Ha lo stesso effetto di
`timingSafeEqual`.

### 4.2 Endpoint

**`POST /pair`**

- Corpo JSON: `{ siteUrl: "https://webeep.polimi.it", token: string (non vuota), privateToken?: string }`.
  `siteUrl` deve essere esattamente quella stringa. I campi extra sono ignorati.
- Corpo non JSON o non conforme: 400.
- Verifica del token: `getSiteInfo` di `@webeep/moodle-api` con token e sito dichiarati.
  - WeBeep rifiuta il token (`invalidtoken` o altro errore Moodle): 422.
  - WeBeep non raggiungibile (`MoodleNetworkError`): 503.
- Successo: sostituisce l'eventuale sessione WeBeep precedente, **revoca tutti i refresh
  token e cancella tutti gli access token in memoria** (Claude deve ricollegarsi), scrive
  lo stato su disco prima di rispondere.
- 200 `{ "fullName": <fullname di getSiteInfo>, "siteUrl": "https://webeep.polimi.it" }`.
- Né il token né una sua parte compaiono nella risposta o nei log.

**`DELETE /pair`**

- Imposta `webeep` a `null`, revoca tutti i refresh token, cancella tutti gli access token
  in memoria, scrive lo stato.
- 204, corpo vuoto. È idempotente: 204 anche se non c'era una sessione.

**`GET /pair`**

- Se `webeep` è `null`: 200 `{ "paired": false }`.
- Altrimenti chiama `getSiteInfo`:
  - successo: 200 `{ "paired": true, "fullName": <fullname> }`;
  - WeBeep rifiuta il token: il server esegue la stessa pulizia di `DELETE /pair` e risponde
    200 `{ "paired": false }`;
  - WeBeep non raggiungibile: 200 `{ "paired": true }` senza `fullName`.

Riepilogo delle risposte:

| Metodo | 200 | 204 | 400 | 401 | 422 | 429 | 503 |
|---|---|---|---|---|---|---|---|
| `POST /pair` | sì | | sì | sì | sì | sì | sì |
| `DELETE /pair` | | sì | | sì | | sì | |
| `GET /pair` | sì | | | sì | | sì | |

### 4.3 Codici degli errori JSON di `/pair`

Corpo `{ "error": "<codice>" }`:

| Stato | `error` |
|---|---|
| 400 | `invalid_body` |
| 401 | `unauthorized` |
| 422 | `token_rejected` |
| 429 | `too_many_attempts` |
| 503 | `webeep_unreachable` |

### 4.4 Lato desktop

- Impostazioni: campo URL del server, campo chiave di accoppiamento, pulsante
  "collega al server". Testi in italiano.
- Validazione dell'URL nel main (il renderer può anticiparla, non basta): `https://`
  obbligatorio; `http://` ammesso solo per `localhost` e `127.0.0.1`; solo origine
  (schema, host, porta facoltativa), senza percorso diverso da `/`, query o frammento.
  Si salva normalizzato, senza slash finale.
- Chiave: stringa non vuota, massimo 512 caratteri. La lunghezza minima la applica il server.
- Il main process, mai il renderer, legge token e `privateToken` dalla sessione salvata e
  invia `POST <serverUrl>/pair` con `siteUrl: "https://webeep.polimi.it"` (la costante
  `WEBEEP_SITE_URL` di moodle-api). Timeout della richiesta: 15 secondi.
- URL e chiave si salvano in un file dedicato nella `userData`, cifrati con `safeStorage`
  come `session-store.ts`. Se la cifratura non è disponibile, restano in memoria per la
  sessione dell'app: mai in chiaro.
- Senza sessione WeBeep nel desktop, `server:link` fallisce con `auth`.

Canali IPC, da dichiarare in `apps/desktop/src/shared/ipc.ts`:

| Canale | Input | Output | Comportamento |
|---|---|---|---|
| `server:get-link` | nessuno | `{ serverUrl: string \| null, paired: boolean, fullName?: string }` | se c'è un URL, chiama `GET /pair` con la chiave salvata; senza URL risponde `paired: false` senza rete |
| `server:link` | `{ serverUrl: string, pairingKey: string }` | come sopra | chiama `POST /pair`; in caso di successo salva URL e chiave |
| `server:unlink` | nessuno | `void` | chiama `DELETE /pair`; rimuove URL e chiave locali solo dopo 204 |

Mappatura degli errori su `IpcError.kind`:

| Risposta del server o errore | `kind` | Messaggio |
|---|---|---|
| 400 | `invalid-input` | `richiesta non valida` |
| 401 | `invalid-input` | `chiave di accoppiamento errata` |
| 422 | `auth` | `sessione WeBeep rifiutata: accedi di nuovo dall'app` |
| 429 | `invalid-input` | `troppi tentativi: riprova tra 15 minuti` |
| 503, errore di rete, timeout | `network` | `server non raggiungibile` |
| altro | `unknown` | `errore imprevisto` |

- In modalità web (`WEBEEP_WEB=1`), `server:link` e `server:unlink` vanno in
  `WEB_UNAVAILABLE_CHANNELS`: l'accoppiamento usa la sessione del desktop. `server:get-link` resta disponibile.
- Il bridge finto (`mock-bridge`) risponde ai tre canali con dati finti.

## 5. OAuth 2.1

Implementato a mano con handler Web standard. Nel seguito `B` indica `WEBEEP_PUBLIC_URL`.

### 5.1 Metadati

`GET /.well-known/oauth-protected-resource` (RFC 9728), 200 `application/json`:

```json
{
  "resource": "<B>/mcp",
  "authorization_servers": ["<B>"],
  "bearer_methods_supported": ["header"]
}
```

Alias: `GET /.well-known/oauth-protected-resource/mcp` restituisce lo stesso documento,
perché alcuni client lo cercano per percorso.

`GET /.well-known/oauth-authorization-server` (RFC 8414), 200 `application/json`:

```json
{
  "issuer": "<B>",
  "authorization_endpoint": "<B>/authorize",
  "token_endpoint": "<B>/token",
  "registration_endpoint": "<B>/register",
  "revocation_endpoint": "<B>/revoke",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "code_challenge_methods_supported": ["S256"],
  "token_endpoint_auth_methods_supported": ["none"]
}
```

I nomi dei campi sono quelli della RFC (con il suffisso `_supported`).

### 5.2 Registrazione (`POST /register`, RFC 7591)

Endpoint aperto, senza autenticazione: la protezione è la password di `/authorize`.
Corpo JSON:

- `client_name`: stringa facoltativa, massimo 200 caratteri;
- `redirect_uris`: array obbligatorio di 1–10 stringhe. Ogni URI deve essere assoluto,
  senza frammento, e deve essere `https`, oppure `http` con host `localhost` o `127.0.0.1`
  (qualsiasi porta);
- `token_endpoint_auth_method`, se presente, deve essere `"none"`;
- `grant_types` e `response_types`, se presenti, devono essere sottoinsiemi dei valori supportati.

Errori (400, corpo RFC 7591): `invalid_redirect_uri` per un URI non ammesso,
`invalid_client_metadata` per tutto il resto. Corpo oltre 1 MB: 413.

Successo, 201 `application/json`:

```json
{
  "client_id": "<stringa casuale>",
  "client_id_issued_at": 1764000000,
  "client_name": "<se fornito>",
  "redirect_uris": ["<uri>"],
  "token_endpoint_auth_method": "none",
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"]
}
```

- `client_id`: 32 byte casuali in base64url. Nessun `client_secret`: i client sono pubblici.
- Limite di 20 client. Se una registrazione porta il numero oltre 20, si eliminano i più
  vecchi (per `createdAt`) insieme ai loro refresh token. Lo stato viene scritto su disco.

### 5.3 Autorizzazione (`GET /authorize`)

Parametri: `client_id`, `redirect_uri`, `response_type`, `code_challenge`,
`code_challenge_method`, `state` (facoltativo), `resource` (facoltativo), `scope`
(ignorato). Un parametro ripetuto è `invalid_request`.

Validazione, in quest'ordine:

1. **Client e `redirect_uri`** (errore non reindirizzabile). Se `client_id` è sconosciuto,
   o `redirect_uri` non coincide esattamente con uno dei `redirectUris` del client, la
   risposta è una pagina HTML di errore con 400. Non si reindirizza mai verso un URI non
   registrato.
2. **Errori reindirizzabili**: 302 verso `redirect_uri` con `error`, `error_description` e
   `state` se presente (RFC 6749 §4.1.2.1).
   - `response_type` diverso da `code`: `unsupported_response_type`.
   - `code_challenge` assente, o `code_challenge_method` diverso da `S256`: `invalid_request`.
   - `resource` presente e diverso da `<B>/mcp`: `invalid_target` (RFC 8707).
3. Tutto valido: 200 con la pagina di autorizzazione.

**Pagina di autorizzazione.** HTML in italiano, senza script né CSS esterni.

- Titolo e intestazione: "Autorizza <client_name> ad accedere a WeBeep". Il nome è
  escapato. Se manca: "Autorizza un'app senza nome ad accedere a WeBeep".
- Testo breve: il client potrà leggere corsi, materiali, scadenze e notifiche di WeBeep
  tramite questo server.
- Form `POST /authorize` con i campi nascosti `client_id`, `redirect_uri`, `response_type`,
  `code_challenge`, `code_challenge_method`, `state` e `resource` (se presenti), più il
  campo `password` (`type="password"`, `autocomplete="current-password"`) e il pulsante
  "autorizza". La v1 non ha un pulsante di rifiuto: l'utente chiude la pagina.
- Intestazioni: `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; form-action 'self' <origine di redirect_uri>; frame-ancestors 'none'; base-uri 'none'`,
  `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`. L'origine di `redirect_uri`
  in `form-action` è necessaria: il browser applica la CSP anche al redirect che segue
  l'invio del form.

### 5.4 Invio della password (`POST /authorize`, form-urlencoded)

1. Rivalidazione completa dei parametri, come in 5.3: i campi nascosti possono essere
   manomessi.
2. Rate limit: 5 password errate in 15 minuti per IP. Il contatore è separato da quello di
   `/pair`. Oltre il limite: 429 con pagina HTML "troppi tentativi: riprova tra 15 minuti".
   Il controllo avviene prima della verifica della password.
3. Verifica: SHA-256 della password inviata e di `WEBEEP_ADMIN_PASSWORD`, confronto a tempo
   costante dei digest. Password errata: 401, pagina di autorizzazione ripresentata con
   "password errata", fallimento conteggiato.
4. Password corretta: crea il codice (32 byte casuali in base64url), lo salva in memoria per
   60 secondi, poi risponde 302 verso `redirect_uri` con `code=<codice>` e `state` se
   presente. Se `redirect_uri` ha già una query, i parametri si aggiungono con `URL.searchParams`.

### 5.5 Token (`POST /token`, form-urlencoded)

Successo, 200 `application/json` con `Cache-Control: no-store` e `Pragma: no-cache`:

```json
{ "access_token": "<...>", "token_type": "Bearer", "expires_in": 3600, "refresh_token": "<...>" }
```

Errori: 400 con `{ "error", "error_description" }` secondo RFC 6749 §5.2. Client
sconosciuto: 401 `invalid_client`.

**`grant_type=authorization_code`**, parametri `code`, `redirect_uri`, `client_id`, `code_verifier`:

1. Il codice (cercato per hash) deve esistere e non essere scaduto, altrimenti `invalid_grant`.
2. Il codice viene **cancellato subito**, monouso, anche se i controlli seguenti falliscono.
3. `client_id` e `redirect_uri` devono coincidere con quelli dell'autorizzazione, altrimenti `invalid_grant`.
4. PKCE: `base64url(SHA-256(code_verifier))` deve essere uguale a `code_challenge`, altrimenti
   `invalid_grant`. `code_verifier` ha tra 43 e 128 caratteri dell'insieme RFC 7636.

Poi emette access token e refresh token.

**`grant_type=refresh_token`**, parametri `refresh_token`, `client_id`:

1. L'hash del token deve essere presente in `refreshTokens`, non scaduto, e con lo stesso
   `clientId`, altrimenti `invalid_grant`.
2. Rotazione: il vecchio refresh token è rimosso; il nuovo ha `expiresAt = adesso + 30 giorni`.
   Lo stato è scritto su disco prima della risposta.
3. Nuovo access token in memoria.

Un refresh token già ruotato, se riusato, dà `invalid_grant`. La v1 non revoca l'intera
famiglia (sezione 9).

Altro `grant_type`: `unsupported_grant_type`.

Formato dei token: access e refresh sono 32 byte casuali in base64url. L'access token dura
3600 secondi ed è in memoria; il refresh token dura 30 giorni ed è su disco come hash.

### 5.6 Revoca (`POST /revoke`, RFC 7009)

Parametri: `token` (obbligatorio), `token_type_hint` (`access_token` o `refresh_token`,
facoltativo). Nessuna autenticazione del client: il token è il segreto.

- `token` mancante: 400 `invalid_request`.
- Altrimenti: 200 con corpo vuoto, sempre, anche se il token non esiste (RFC 7009 §2.2).
- Refresh token: rimosso dallo stato, con scrittura su disco. Access token: rimosso dalla
  memoria. Un access token già emesso dalla stessa concessione resta valido fino alla
  scadenza (limite della v1).

### 5.7 Protezione di `/mcp`

Richiesta senza `Authorization: Bearer <token>` valido (token non trovato in memoria o
scaduto): 401, corpo vuoto, con

```
WWW-Authenticate: Bearer resource_metadata="<B>/.well-known/oauth-protected-resource"
```

## 6. Server MCP e tool

### 6.1 Protocollo

- Endpoint `POST /mcp`, con corpo JSON-RPC 2.0 (una richiesta per volta). Nessuna sessione:
  niente `Mcp-Session-Id`, ogni richiesta è indipendente.
- Risposta `Content-Type: application/json`, mai SSE. Una notifica (richiesta senza `id`)
  riceve 202 senza corpo.
- `GET /mcp` e `DELETE /mcp`: 405 con `Allow: POST`. In modalità stateless non esiste uno
  stream server-sent.
- Metodi: `initialize`, `notifications/initialized`, `ping`, `tools/list`, `tools/call`.
  Un metodo diverso riceve l'errore JSON-RPC `-32601` (method not found).
- `initialize` dichiara `capabilities: { tools: {} }` e
  `serverInfo: { name: "webeep", version: <versione di @webeep/server> }`. La versione del
  protocollo è negoziata come da specifica MCP.
- Implementazione: vedi sezione 10, punto 1.

### 6.2 Regole comuni dei tool

- Ogni tool dichiara `annotations: { readOnlyHint: true }`.
- L'input è un oggetto JSON validato con zod. Se non è valido, il risultato ha
  `isError: true` e testo `parametri non validi: <campo>`: il nome del campo, mai il valore.
- L'output è un solo blocco `{ type: "text", text }` in italiano, testo semplice (niente
  HTML, niente tabelle markdown). Ogni elemento occupa una riga, con l'id numerico visibile.
- Date: ISO 8601 con offset (es. `2026-12-03T23:59:00+01:00`). Le scadenze hanno anche la
  forma locale (6.4).
- L'HTML di Moodle passa sempre da `htmlToText` del nucleo: stessa logica di
  `apps/desktop/src/renderer/src/lib/format.ts`, ma senza DOM e senza dipendenze nuove
  (sezione 10, punto 2).
- Nessun output contiene token, URL con parametro `token`, stack trace o messaggi grezzi di Moodle.
- Un elenco vuoto è un risultato con testo `nessun risultato`, non un errore.

### 6.3 Errori comuni (testi esatti)

| Situazione | Testo di `isError: true` |
|---|---|
| nessun accoppiamento (vale per tutti i tool, anche `whoami`) | `server non collegato a WeBeep: collega dall'app desktop` |
| WeBeep rifiuta il token | `sessione WeBeep scaduta: collega di nuovo dall'app desktop`; il server cancella la sessione come `DELETE /pair` |
| WeBeep non raggiungibile | `WeBeep non raggiungibile, riprova più tardi` |
| altro errore Moodle | `WeBeep ha risposto con un errore (codice <errorcode>)` |
| parametri non validi | `parametri non validi: <campo>` |

### 6.4 Tool

Notazione: `nome({ input }) → output`. I campi con `?` sono opzionali; il valore dopo `=` è il default.

1. **`whoami()`** → nome completo, username, sito (`https://webeep.polimi.it`), stato
   `collegato`. Usa `getSiteInfo`.

2. **`list_courses({ classification?: "inprogress" | "past" | "future" | "all" = "inprogress" })`**
   → per corso: id, nome, nome breve, preferito (sì/no). Usa `getCourses` con la
   classificazione ricevuta.

3. **`get_course_contents({ courseId: intero > 0 })`** → sezioni nell'ordine di WeBeep; per
   sezione nome e numero; per modulo `cmid`, tipo (`modname`), nome, descrizione in testo
   (`htmlToText`, omessa se vuota); per file nome, dimensione (byte e forma leggibile),
   data (`timemodified` in ISO), mimetype e `fileUrl`. `fileUrl` è l'URL del file **senza**
   il parametro `token`. Usa `getCourseContents`.

4. **`get_upcoming_deadlines({ days?: intero 1..90 = 14, limit?: intero 1..50 = 25 })`** →
   scadenze in ordine cronologico: titolo, corso, scadenza in ISO e in forma locale
   `gg/mm/aaaa hh:mm` (fuso Europe/Rome). Usa `getUpcomingEvents`.

5. **`list_notifications({ unreadOnly?: boolean = false, limit?: intero 1..50 = 20 })`** →
   per notifica: data (ISO), letta (sì/no), soggetto, anteprima (`smallmessage`, senza HTML),
   componente (`componentlabel`). Usa `getNotifications`. **Non chiama mai**
   `markNotificationRead` né `markAllNotificationsRead`: leggere non segna come lette.

6. **`search_courses({ query: stringa, da 2 a 100 caratteri })`** → risultati della prima
   pagina, con la riga `risultati totali: N`; per corso id, nome, nome breve e stato
   `iscritto` o `non iscritto`. Lo stato si ricava confrontando con
   `getCourses({ classification: "all" })`. Usa `searchCourses`.

7. **`get_page({ cmid: intero > 0 })`** → nome della pagina e testo (`htmlToText`), più
   l'elenco dei file allegati (nome e `fileUrl` senza token). Flusso: `getCourseModule(cmid)`;
   se `modname` non è `page`, errore `il modulo indicato non è una pagina`; altrimenti
   `getPages` sul `courseId` e selezione per `cmid`; se la pagina manca, `pagina non trovata`.

8. **`read_file({ fileUrl: stringa, massimo 2048 caratteri })`**
   - Validazione: URL assoluto `https`, host esattamente `webeep.polimi.it`, percorso con il
     segmento `pluginfile.php` seguito da almeno un altro segmento, nessun parametro `token`
     nella query. Altrimenti: `URL non valido: sono accettati solo file di WeBeep (pluginfile.php)`.
   - Il server aggiunge il token internamente (`authenticatedFileUrl`). Il token non esce mai
     nell'output. Sono seguiti solo i redirect verso `webeep.polimi.it`; un altro host è errore.
   - Limite: 10 MB (10 × 1024 × 1024 byte). Si controlla `Content-Length` e, durante la
     lettura, si interrompe al superamento. Oltre il limite: `file troppo grande (massimo 10 MB)`.
   - Nome: da `Content-Disposition`, altrimenti ultimo segmento del percorso.
   - Output secondo il `Content-Type` (senza parametri, in minuscolo):
     - `text/*` e `application/json`: blocco di testo con intestazione (nome, mimetype,
       dimensione) e contenuto decodificato in UTF-8;
     - `text/html`: come sopra, con `htmlToText`;
     - `image/jpeg`, `image/png`, `image/gif`, `image/webp`: blocco `image` con `data` (base64)
       e `mimeType`;
     - ogni altro tipo, compresi `image/svg+xml` e gli altri `image/*`: blocco di intestazione
       più una risorsa `{ type: "resource", resource: { uri: <fileUrl senza token>, mimeType, blob: <base64> } }`.

## 7. Altri endpoint e convenzioni HTTP

- `GET /healthz` → 200, `Content-Type: text/plain`, corpo `ok`. Nessun dato, nessuna autenticazione.
- Percorso non previsto → 404 con corpo vuoto. Percorso previsto con metodo non ammesso → 405 con `Allow`.
- Corpo oltre 1 MB (per `Content-Length` o durante la lettura) → 413 `{ "error": "payload_too_large" }`.
- Errore imprevisto → 500 `{ "error": "internal" }`, senza dettagli nella risposta. Nel log
  si registra solo il nome della classe dell'errore.
- Nessun CORS: nessun header `Access-Control-*`, nessuna risposta alle preflight `OPTIONS`
  (che ricevono 405).
- Le risposte JSON e quelle di autenticazione hanno `Cache-Control: no-store`.
- Endpoint non OAuth: errore `{ "error": "<codice>" }` (codici di `/pair` in 4.3, più
  `payload_too_large` e `internal`). Endpoint OAuth: formato della RFC.

**Log.** Una riga per richiesta su stdout, con istante ISO, metodo, percorso senza query,
stato e durata in ms. Esempio: `2026-11-26T10:00:00.000Z POST /pair 401 12ms`. Non si
registrano mai: header `Authorization`, corpi, query string, token, password.

**Adattatore Node.**

- `node:http` converte la richiesta in `Request` (corpo letto con il limite di 1 MB) e la
  risposta del nucleo in `ServerResponse`.
- `ctx.clientIp`: ultimo valore di `X-Forwarded-For` se presente, altrimenti
  `socket.remoteAddress`. Il valore dell'header è affidabile perché la porta è raggiungibile
  solo dal proxy (sezione 8).
- Il processo ascolta in chiaro su `0.0.0.0:PORT` dentro il container. Il TLS è del proxy.

## 8. Deploy

- **Dockerfile multi-stage** su `node:22-slim`: uno stadio di build (installazione con
  lockfile, build, `pnpm deploy` del pacchetto in produzione) e uno stadio finale che copia
  solo il risultato.
- Utente non root: `USER node` (uid 1000). `/data` deve essere scrivibile da quell'utente.
- `ENV WEBEEP_DATA_DIR=/data PORT=8787`, `VOLUME ["/data"]`, `EXPOSE 8787`.
- I segreti arrivano dall'ambiente del container (file d'ambiente o secret del runtime),
  mai dentro l'immagine.
- La porta 8787 **non va pubblicata** verso l'esterno: il proxy raggiunge il container sulla
  rete Docker interna, oppure si pubblica solo `127.0.0.1:8787:8787`.
- **Reverse proxy HTTPS.** Esempio in `deploy/Caddyfile`: Caddy ottiene il certificato e
  aggiunge `X-Forwarded-For`.

```
webeep.example.it {
	reverse_proxy webeep-server:8787
}
```

  `example.it` è un segnaposto: il dominio coincide con l'host di `WEBEEP_PUBLIC_URL`.

- **Backup.** `state.bin` è cifrato, ma senza `WEBEEP_SECRET_KEY` non serve a nulla: la
  chiave va conservata separatamente.

Ordine per il primo collegamento:

1. avviare il server con le quattro variabili obbligatorie;
2. accoppiare dall'app desktop (sezione 4.4);
3. in Claude: Impostazioni → Connettori → aggiungi connettore personalizzato, con URL
   `<WEBEEP_PUBLIC_URL>/mcp`;
4. Claude apre la pagina di autorizzazione (sezione 5.3): inserire `WEBEEP_ADMIN_PASSWORD`.

## 9. Sicurezza

| Rischio | Mitigazione |
|---|---|
| Furto di `state.bin` | Inutile senza `WEBEEP_SECRET_KEY` (AES-256-GCM). I refresh token sono salvati come hash; gli access token stanno solo in memoria. |
| Furto della chiave di accoppiamento o della password admin | Valori solo in ambiente; mai su disco, nei log o nelle risposte; confronto tramite digest. |
| Intercettazione in transito | HTTPS obbligatorio (`WEBEEP_PUBLIC_URL` https; il proxy termina il TLS). Il processo ascolta in chiaro solo sulla rete interna. |
| Forza bruta su `/pair` e sulla password admin | 5 fallimenti in 15 minuti per IP, poi 429. |
| Uso da pagine web (CSRF, CORS) | Nessun CORS. La pagina di autorizzazione ha CSP restrittiva, `frame-ancestors 'none'` e richiede la password. |
| Redirect OAuth verso siti terzi | `redirect_uri` solo per corrispondenza esatta con quelli registrati, e solo `https` o localhost. |
| Intercettazione del codice di autorizzazione | PKCE S256 obbligatorio; codice monouso valido 60 secondi. |
| Registrazione massiva di client | DCR aperto ma limitato a 20 client; nessun dato accessibile senza la password admin. |
| Scritture su WeBeep | Nessun tool di scrittura; il nucleo usa solo le funzioni di lettura (più `getSiteInfo`). |
| SSRF tramite `read_file` | Solo host `webeep.polimi.it`, segmento `pluginfile.php`, redirect solo verso lo stesso host. |
| Token nell'output | Il token non compare in risposte, tool o log; `fileUrl` è privo di token. |
| Falsificazione dell'IP tramite `X-Forwarded-For` | La porta è raggiungibile solo dal proxy (sezione 8). |

Rischi residui della v1:

- Chi ottiene insieme il file di stato e la chiave ottiene anche il token WeBeep: va
  protetto l'host del server.
- Il riuso di un refresh token già ruotato dà `invalid_grant` ma non revoca la famiglia:
  un refresh token trafugato resta valido fino a scadenza o revoca.
- I contatori di rate limit stanno in memoria: un riavvio li azzera.
- `GET /authorize` non ha un pulsante di rifiuto.

## 10. Punti aperti e dipendenze

Da decidere prima dell'implementazione:

1. **SDK MCP. Decisa.** Il protocollo usa `@modelcontextprotocol/server` 2.4.0, nuova
   dipendenza autorizzata dall'utente (regola 9 di AGENTS.md).
2. **`htmlToText` nel nucleo.** Il desktop lo fa con il DOM, il server non ha DOM: la
   versione del nucleo non usa dipendenze nuove (sezione 6.2).

Dipendenze già presenti: `@webeep/moodle-api` e `zod` (versione 4, come nel monorepo).

Decisioni prese in questa versione che non erano nella richiesta originale, da confermare
o annullare:

- firma `handle(request, ctx: { clientIp })`: l'IP serve ai rate limit e non può arrivare
  in un header controllabile dal client;
- `clientIp` con `WEBEEP_TRUST_PROXY=true` è l'ULTIMO valore di `X-Forwarded-For`: il proxy
  aggiunge il suo valore in coda, mentre i valori precedenti li può scrivere il client;
- errori JSON `{ "error": "<codice>" }` per gli endpoint non OAuth, con `503 webeep_unreachable`;
- ogni nuovo accoppiamento revoca i refresh token e cancella gli access token in memoria;
  anche `DELETE /pair` cancella gli access token;
- alias `/.well-known/oauth-protected-resource/mcp`;
- nomi dei metadati OAuth con il suffisso RFC `_supported`;
- `image/svg+xml` e gli altri `image/*` diversi da JPEG, PNG, GIF e WebP vanno come risorsa `blob`;
- output MCP solo JSON; `GET` e `DELETE` su `/mcp` rispondono 405;
- `server:link` e `server:unlink` in `WEB_UNAVAILABLE_CHANNELS`.
