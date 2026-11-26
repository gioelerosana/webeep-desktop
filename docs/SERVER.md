# Server privato WeBeep (`apps/server`)

> **Contratto v2.** Gli sotto-agenti lo implementano senza modificarlo. Le modifiche
> passano dall'orchestratore e producono una nuova versione di questo documento.
> La v2 sostituisce la password admin e la chiave di accoppiamento con il login
> Authentik (OIDC) e un dispositivo collegato con deviceToken.
>
> Convenzione: **deve** e **non deve** indicano un obbligo; il resto è descrittivo.

## 1. Scopo e architettura

`apps/server` (pacchetto `@webeep/server`) è un processo Node 22, senza Electron, per
un solo utente: il proprietario. Gira su un server del proprietario (Docker dietro un
reverse proxy HTTPS) ed espone un server MCP (Streamable HTTP, modalità stateless,
endpoint `/mcp`) da collegare a Claude come connettore remoto.

- Solo lettura verso WeBeep (regola 8 di AGENTS.md): il server non ha tool di scrittura.
- Un solo account WeBeep collegato alla volta: quello dell'ultimo accoppiamento.
- Accesso riservato ai membri del gruppo Authentik indicato da `WEBEEP_OIDC_ALLOWED_GROUP`
  (sezione 10).

Architettura a tre strati:

| Strato | Contenuto | Vincoli |
|---|---|---|
| Nucleo | `handle(request: Request, ctx: { clientIp: string }): Promise<Response>`; router, login OIDC, OAuth 2.1, endpoint MCP, tool, accoppiamento | solo API Web standard (`Request`, `Response`, `fetch`, `URL`, `crypto.subtle`, `TextEncoder`, `atob`); nessun import da `node:*`; usa `@webeep/moodle-api` (neutrale) e zod |
| Storage | interfaccia `StateStore`: `get(): Promise<Uint8Array \| null>` e `put(bytes: Uint8Array): Promise<void>`, che lavorano sullo stato **già cifrato** | implementazione v2: `FileStateStore` su file |
| Adattatore | `node:http` → `handle()`; configurazione da env; log; `FileStateStore` | unico adattatore della v2 |

Il nucleo cifra e decifra lo stato con `crypto.subtle`: lo store vede solo byte. Un
futuro adattatore (per esempio Cloudflare Workers) sostituisce adattatore e store, non
il nucleo. Non fa parte della v2.

Le scritture di stato sono serializzate: una alla volta, in ordine.

Struttura indicativa:

```
apps/server/
  src/http/     handle(), router, rate limit, risposte e lettura del corpo (solo Web API)
  src/oidc/     client OIDC verso Authentik: discovery, login pendenti, callback, userinfo (sezione 10)
  src/oauth/    OAuth 2.1: metadati, registrazione, autorizzazione e consenso, token, revoca
  src/mcp/      endpoint MCP (Streamable HTTP, stateless), tool e formato dei risultati
  src/state/    StateStore, codifica e decodifica dello stato cifrato
  src/pair.ts   endpoint /pair e /pair/start (accoppiamento, sezione 4)
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
| `WEBEEP_PUBLIC_URL` | sì | URL `https` assoluto, senza percorso né slash finale (es. `https://webeep.example.it`) | è l'`issuer` e la `resource` OAuth; `<WEBEEP_PUBLIC_URL>/mcp` è l'URL del connettore; `<WEBEEP_PUBLIC_URL>/oidc/callback` è il redirect URI verso Authentik |
| `WEBEEP_SECRET_KEY` | sì | 32 byte in base64 standard (44 caratteri con padding) | chiave AES-256-GCM dello stato; generazione: `openssl rand -base64 32` |
| `WEBEEP_OIDC_ISSUER` | sì | URL `https` assoluto, senza query né frammento; slash finale facoltativa (es. `https://auth.example.com/application/o/webeep/`) | issuer dell'applicazione Authentik; la normalizzazione è nella sezione 10.1 |
| `WEBEEP_OIDC_CLIENT_ID` | sì | stringa non vuota | client ID del provider OAuth2/OpenID di Authentik (sezione 8.1) |
| `WEBEEP_OIDC_CLIENT_SECRET` | sì | stringa non vuota | solo in ambiente; mai nei log, nelle risposte o su disco |
| `WEBEEP_OIDC_ALLOWED_GROUP` | no | stringa non vuota; default `webeep` | gruppo Authentik richiesto per accedere (sezione 10.3) |
| `PORT` | no | intero 1–65535; default `8787` | porta in ascolto |
| `WEBEEP_DATA_DIR` | no | default `/data` | directory di `state.bin` |
| `WEBEEP_TRUST_PROXY` | no | `true` o `false`; default `false` | `true` solo dietro il proxy della sezione 8: abilita la lettura di `X-Forwarded-For` (sezione 7) |

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
- L'avvio **non deve** contattare Authentik: la discovery avviene al primo login (sezione 10.1).
  Un Authentik momentaneamente irraggiungibile non impedisce l'avvio.

## 3. Stato persistente

### 3.1 File su disco

`$WEBEEP_DATA_DIR/state.bin`, permessi 0600.

- Formato: `iv || ciphertext+tag`, con `iv` di 12 byte casuali, nuovi a ogni scrittura,
  e AES-256-GCM con la chiave decodificata da `WEBEEP_SECRET_KEY`.
- Il contenuto in chiaro, prima della cifratura, è un JSON UTF-8 che deve passare questo
  schema zod:

```ts
{
  version: 2,
  webeep: { siteUrl: string, token: string, privateToken?: string } | null,
  deviceTokenHash: string | null,
  clients: OAuthClient[],
  refreshTokens: { hash: string, clientId: string, expiresAt: number }[]
}

OAuthClient = { clientId: string, clientName?: string, redirectUris: string[], createdAt: number }
```

- `deviceTokenHash`: SHA-256 del deviceToken (sezione 4.2), in esadecimale minuscolo;
  `null` se nessun dispositivo è collegato.
- `hash` dei refresh token: SHA-256 del refresh token, in esadecimale minuscolo.
- `expiresAt` e `createdAt`: millisecondi epoch.
- Se il file manca, lo stato iniziale è
  `{ version: 2, webeep: null, deviceTokenHash: null, clients: [], refreshTokens: [] }`
  e viene scritto alla prima modifica.
- Migrazione dalla versione 1: un file con `version: 1` viene letto con `deviceTokenHash`
  impostato a `null`; la versione diventa 2 alla prima scrittura. Sessione WeBeep e client
  OAuth restano. Dopo la migrazione nessun dispositivo è collegato: l'app va ricollegata
  (sezione 4.4).
- Scrittura atomica: si scrive `state.bin.part`, si esegue `fsync`, poi si rinomina in
  `state.bin`. Un errore lascia intatto il file precedente.

### 3.2 Solo in memoria

- Access token: `Map<hash SHA-256 esadecimale, { clientId, expiresAt }>`. Mai su disco.
  Un riavvio li cancella: Claude riceve 401 e usa il refresh token.
- Codici di autorizzazione: `Map<hash SHA-256 del codice, { clientId, redirectUri, codeChallenge, resource?, expiresAt }>`,
  validi 60 secondi, monouso.
- Codici di accoppiamento: `Map<hash SHA-256 del codice, { codeChallenge, expiresAt }>`,
  validi 120 secondi, monouso (sezione 4.1).
- Login OIDC pendenti: `Map<stato OIDC, { purpose, data, nonce, codeVerifier, expiresAt }>`,
  validi 10 minuti, monouso (sezione 10.2).
- Consensi pendenti: `Map<token CSRF, { params, expiresAt }>`, validi 5 minuti, monouso
  (sezione 5.4).
- Discovery OIDC in cache (sezione 10.1).
- Contatori di rate limit (sezione 4.3).

I token OAuth e il deviceToken non compaiono mai in chiaro su disco: per i refresh token
e per il deviceToken si salva solo l'hash.

## 4. Accoppiamento (il token WeBeep arriva solo così)

Il token WeBeep entra nel server solo tramite `POST /pair`, chiamato dal main process
dell'app desktop (sezione 4.4). L'accoppiamento non usa segreti condivisi tra app e
server: l'identità dell'utente è verificata da Authentik (sezione 10) e il dispositivo
riceve un deviceToken, che usa nelle richieste successive.

### 4.1 Flusso

Lo schema è quello loopback della RFC 8252, con PKCE (RFC 7636):

1. Il main process avvia un server HTTP su `127.0.0.1`, su una porta casuale libera.
   Genera `state` (32 byte casuali in base64url) e `code_verifier` (32 byte casuali in
   base64url, 43 caratteri), e calcola `code_challenge` = base64url(SHA-256(`code_verifier`)).
2. Il main apre il browser di sistema su
   `<serverUrl>/pair/start?redirect_uri=http://127.0.0.1:<porta>/callback&state=<state>&code_challenge=<code_challenge>&code_challenge_method=S256`.
3. `GET /pair/start` valida i parametri (sezione 4.2) ed esegue il login Authentik con
   purpose `desktop-pair`. Dopo un callback riuscito crea un codice di accoppiamento e
   risponde 302 a `<redirect_uri>?code=<codice>&state=<state>`.
4. Il main riceve la richiesta sul loopback e verifica che `state` coincida con quello
   generato. Risponde con la pagina "collegamento completato, puoi chiudere questa
   scheda", oppure con una pagina d'errore, e chiude il listener.
5. Il main invia `POST /pair` (sezione 4.2) con `code` e `code_verifier`.

Il flusso ha un timeout complessivo di 5 minuti dall'apertura del browser: allo scadere
il main chiude il listener e il collegamento fallisce. Un login Authentik fallito nel
browser non produce alcun callback sul loopback: il flusso termina per timeout o per
annullamento (`server:cancel-link`, sezione 4.4).

### 4.2 Endpoint

**`GET /pair/start`**

- Parametri: `redirect_uri`, `state`, `code_challenge`, `code_challenge_method`. Un
  parametro ripetuto non è valido.
- Validazione, in quest'ordine. Ogni errore è una pagina HTML 400 in italiano: il server
  **non deve** reindirizzare verso un `redirect_uri` non valido.
  - `redirect_uri` deve essere esattamente `http://127.0.0.1:<porta>/callback`, con porta
    intera tra 1024 e 65535, senza utente, query o frammento. Nessun altro host, schema o
    percorso è accettato, nemmeno `localhost`.
  - `state`: stringa base64url di 16–128 caratteri.
  - `code_challenge`: stringa base64url di 43 caratteri.
  - `code_challenge_method`: deve essere `S256`.
- Poi login Authentik con purpose `desktop-pair` e dati `{ redirectUri, state, codeChallenge }`
  (sezione 10.2). Se la discovery OIDC non è disponibile: pagina 503 (sezione 10.1).
- Dopo un callback riuscito: crea il codice di accoppiamento (32 byte casuali in
  base64url), lo salva in memoria (sezione 3.2) e risponde 302 verso `redirect_uri` con
  `code` e `state`. I parametri si aggiungono con `URL.searchParams`.

**`POST /pair`**

- Corpo JSON: `{ code: string (non vuota), codeVerifier: string (43–128 caratteri dell'insieme RFC 7636), siteUrl: "https://webeep.polimi.it", token: string (non vuota), privateToken?: string }`.
  `siteUrl` deve essere esattamente quella stringa. I campi extra sono ignorati.
- Corpo non JSON o non conforme: 400.
- Rate limit: se l'IP ha già 5 codici errati nella finestra corrente, risposta 429 senza
  verificare il codice (sezione 4.3).
- Verifica del codice: il codice (cercato per hash) deve esistere e non essere scaduto, e
  `base64url(SHA-256(codeVerifier))` deve coincidere con `codeChallenge`. Altrimenti 401.
  Il codice viene cancellato al primo `POST /pair` che lo riceve, anche se la verifica
  fallisce: è monouso.
- Verifica del token: `getSiteInfo` di `@webeep/moodle-api` con token e sito dichiarati.
  - WeBeep rifiuta il token (`invalidtoken` o altro errore Moodle): 422.
  - WeBeep non raggiungibile (`MoodleNetworkError`): 503.
- Successo: sostituisce l'eventuale sessione WeBeep precedente, **revoca tutti i refresh
  token e cancella tutti gli access token in memoria** (Claude deve ricollegarsi). Genera
  un deviceToken (32 byte casuali in base64url) e salva in `deviceTokenHash` il suo SHA-256,
  sostituendo l'hash precedente: c'è un solo dispositivo alla volta. Scrive lo stato su
  disco prima di rispondere.
- 200 `{ "fullName": <fullname di getSiteInfo>, "siteUrl": "https://webeep.polimi.it", "deviceToken": "<token>" }`.
  Il deviceToken è mostrato una sola volta e il server non può recuperarlo.
- Né il token WeBeep, né il codice, né il `code_verifier`, né una loro parte compaiono
  nella risposta o nei log.

**`GET /pair`**

- Header `Authorization: Bearer <deviceToken>`. Il server calcola SHA-256 del valore e lo
  confronta a tempo costante con `deviceTokenHash`. Header assente o malformato,
  `deviceTokenHash` nullo, o hash diverso: 401 `unauthorized`.
- Altrimenti:
  - se `webeep` è `null`: 200 `{ "paired": false }`;
  - altrimenti chiama `getSiteInfo`:
    - successo: 200 `{ "paired": true, "fullName": <fullname> }`;
    - WeBeep rifiuta il token: il server esegue la stessa pulizia di `DELETE /pair`
      (sessione, deviceToken, token OAuth) e risponde 200 `{ "paired": false }`;
    - WeBeep non raggiungibile: 200 `{ "paired": true }` senza `fullName`.

**`DELETE /pair`**

- Stessa autenticazione Bearer di `GET /pair`: 401 `unauthorized` se non valida.
- Imposta `webeep` e `deviceTokenHash` a `null`, revoca tutti i refresh token, cancella
  tutti gli access token in memoria, scrive lo stato.
- 204, corpo vuoto. Dopo il `DELETE` il deviceToken non è più valido: una seconda chiamata
  riceve 401.

`GET` e `DELETE` su `/pair` non hanno rate limit: il deviceToken ha 256 bit di entropia.
`GET /pair/start` non risponde in JSON: risponde con redirect 302 (verso Authentik o verso
il loopback), con pagine HTML 400 per parametri non validi, o con pagina 503 se Authentik
non è disponibile.

Riepilogo delle risposte JSON:

| Metodo | 200 | 204 | 400 | 401 | 422 | 429 | 503 |
|---|---|---|---|---|---|---|---|
| `POST /pair` | sì | | sì | sì | sì | sì | sì |
| `GET /pair` | sì | | | sì | | | |
| `DELETE /pair` | | sì | | sì | | | |

### 4.3 Codici degli errori JSON di `/pair` e rate limit

Corpo `{ "error": "<codice>" }`:

| Stato | `error` | Quando |
|---|---|---|
| 400 | `invalid_body` | corpo non JSON o non conforme |
| 401 | `invalid_code` | `POST /pair`: codice assente, scaduto, già usato o PKCE errato |
| 401 | `unauthorized` | `GET` o `DELETE /pair`: Bearer assente o non valido |
| 422 | `token_rejected` | WeBeep ha rifiutato il token |
| 429 | `too_many_attempts` | troppi codici errati dallo stesso IP |
| 503 | `webeep_unreachable` | WeBeep non raggiungibile |

Rate limit. Un tentativo è **fallito** solo se la risposta è 401 `invalid_code`. Cinque
tentativi falliti per IP in una finestra di 15 minuti, aperta al primo fallimento, portano
a 429 fino alla scadenza della finestra. Le altre risposte, 429 comprese, non contano.
I contatori stanno in memoria (sezione 3.2).

### 4.4 Lato desktop

- Impostazioni: un solo campo, l'URL del server, e il pulsante "collega al server". Testi
  in italiano. Non ci sono campi per chiavi o password.
- Validazione dell'URL nel main (il renderer può anticiparla, non basta): `https://`
  obbligatorio; `http://` ammesso solo per `localhost` e `127.0.0.1`; solo origine
  (schema, host, porta facoltativa), senza percorso diverso da `/`, query o frammento.
  Si salva normalizzato, senza slash finale.
- Il flusso (sezione 4.1) è gestito interamente dal main process. Il renderer riceve solo lo
  stato. Il deviceToken **non deve** mai uscire dal main process (regola 1 di AGENTS.md) e
  non compare nell'output di nessun canale IPC.
- Stati della UI: mentre il browser è aperto, "completa l'accesso nel browser" con il
  pulsante "annulla"; a collegamento completato, "collegato come <nome>".
- `server:link` resta pendente fino a successo, errore, annullamento o timeout. Un nuovo
  `server:link` mentre un flusso è in corso annulla quello in corso.
- Il main invia `POST <serverUrl>/pair` con `siteUrl: "https://webeep.polimi.it"` (la
  costante `WEBEEP_SITE_URL` di moodle-api), con token e `privateToken` letti dalla sessione
  salvata. Timeout della richiesta: 15 secondi.
- Senza sessione WeBeep nel desktop, `server:link` fallisce con `auth` prima di aprire il
  browser.
- URL e deviceToken si salvano in un file dedicato nella `userData`, cifrati con
  `safeStorage` come `session-store.ts`. Se la cifratura non è disponibile, restano in
  memoria per la sessione dell'app: mai in chiaro. Dopo un riavvio in questo caso il
  dispositivo risulta non collegato e va ricollegato.
- Se `GET /pair` risponde 401 (dispositivo revocato o server reinstallato), `server:get-link`
  risponde `paired: false` e cancella il deviceToken locale. L'URL resta, per ricollegare.

Canali IPC, da dichiarare in `apps/desktop/src/shared/ipc.ts`:

| Canale | Input | Output | Comportamento |
|---|---|---|---|
| `server:get-link` | nessuno | `{ serverUrl: string \| null, paired: boolean, fullName?: string }` | se c'è un URL e un deviceToken, chiama `GET /pair`; senza URL o senza deviceToken risponde `paired: false` senza rete |
| `server:link` | `{ serverUrl: string }` | come sopra | avvia il flusso (sezione 4.1); a successo, dopo `POST /pair`, salva URL e deviceToken |
| `server:cancel-link` | nessuno | `void` | annulla il flusso in corso: chiude il listener loopback; non fa nulla se non c'è un flusso |
| `server:unlink` | `{ localOnly?: boolean }` | `void` | senza `localOnly` chiama `DELETE /pair` e rimuove URL e deviceToken locali solo dopo 204 (o 401, vedi sotto). Con `localOnly: true` rimuove solo la configurazione locale, senza rete: la UI lo offre dopo un errore di scollegamento se il server non risponde |

Mappatura degli errori su `IpcError.kind`:

| Risposta del server o errore | `kind` | Messaggio |
|---|---|---|
| 400 | `invalid-input` | `richiesta non valida` |
| 401 su `POST /pair` (`invalid_code`) | `auth` | `collegamento scaduto: riprova` |
| 401 su `DELETE /pair` | nessun errore: il server non riconosce più il dispositivo, il main rimuove la configurazione locale | |
| 422 | `auth` | `sessione WeBeep rifiutata: accedi di nuovo dall'app` |
| 429 | `invalid-input` | `troppi tentativi: riprova tra 15 minuti` |
| 503, errore di rete, timeout di 15 secondi | `network` | `server non raggiungibile` |
| `state` del loopback non coincide, oppure timeout di 5 minuti del flusso | `auth` | `collegamento non valido o scaduto: riprova` |
| altro | `unknown` | `errore imprevisto` |

- In modalità web (`WEBEEP_WEB=1`), `server:link`, `server:cancel-link` e `server:unlink`
  vanno in `WEB_UNAVAILABLE_CHANNELS`: l'accoppiamento usa la sessione del desktop.
  `server:get-link` resta disponibile.
- Il bridge finto (`mock-bridge`) risponde ai quattro canali con dati finti.

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

Endpoint aperto, senza autenticazione: la protezione è il consenso esplicito dato in
`/authorize` (sezioni 5.3 e 5.4). Corpo JSON:

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
3. Tutto valido: il server registra i parametri in un login OIDC pendente e risponde 302
   verso Authentik, con purpose `claude-authorize` (sezione 10.2). Nessuna pagina viene
   mostrata prima del login. Se la discovery OIDC non è disponibile: pagina HTML 503.

**Pagina di consenso.** Il server la mostra in risposta al callback OIDC riuscito con
purpose `claude-authorize` (sezione 10.2). HTML in italiano, senza script né CSS esterni.

- Titolo: "Autorizza <client_name> (<host del redirect_uri>) ad accedere a WeBeep in sola
  lettura". Il nome è escapato. Se manca: "un'app senza nome". L'host è quello del
  `redirect_uri`, con la porta se presente.
- Testo breve: il client potrà leggere corsi, materiali, scadenze e notifiche di WeBeep
  tramite questo server.
- Form `POST /authorize/consent` (sezione 5.4) con il campo nascosto `consent` (token CSRF)
  e due pulsanti: "autorizza" e "annulla". Il form non contiene parametri OAuth: restano
  nel server.
- Il token CSRF è di 32 byte casuali in base64url, legato alla voce di consenso (sezione 3.2),
  valido 5 minuti e monouso.
- Intestazioni: `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; form-action 'self' <origine di redirect_uri>; frame-ancestors 'none'; base-uri 'none'`,
  `X-Frame-Options: DENY`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`.
  L'origine di `redirect_uri` in `form-action` è necessaria: il browser applica la CSP
  anche al redirect che segue l'invio del form.

### 5.4 Risposta al consenso (`POST /authorize/consent`, form-urlencoded)

Campi: `consent` (token CSRF) e `decision` (`allow` oppure `deny`).

1. Il token CSRF deve esistere in memoria e non essere scaduto. In ogni caso la voce viene
   cancellata (monouso). Se manca o è scaduto: pagina HTML 400 "richiesta scaduta: riprova il
   collegamento da Claude".
2. I parametri OAuth sono quelli salvati nella voce di consenso, già validati in 5.3: il
   form non li trasmette e non possono essere alterati dal browser.
3. `decision` diverso da `allow` e `deny`: pagina HTML 400.
4. `allow`: crea il codice di autorizzazione (32 byte casuali in base64url), lo salva per
   60 secondi (sezione 3.2) e risponde 302 verso `redirect_uri` con `code=<codice>` e
   `state` se presente.
5. `deny`: risponde 302 verso `redirect_uri` con `error=access_denied`,
   `error_description` e `state` se presente (RFC 6749 §4.1.2.1).

I parametri si aggiungono a `redirect_uri` con `URL.searchParams`, anche se `redirect_uri`
ha già una query.

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

Un refresh token già ruotato, se riusato, dà `invalid_grant`. La v2 non revoca l'intera
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
  scadenza (limite della v2).

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
- Implementazione: vedi sezione 11, punto 1.

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
  (sezione 11, punto 2).
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
- Le risposte JSON, le pagine HTML e quelle di autenticazione hanno `Cache-Control: no-store`.
- Endpoint JSON (`/pair`): errore `{ "error": "<codice>" }`, con i codici della sezione 4.3
  più `payload_too_large` e `internal`. Endpoint OAuth: formato della RFC.
- Pagine HTML (`/authorize`, `/authorize/consent`, `/pair/start`, `/oidc/callback`): testo in
  italiano, senza dettagli tecnici né valori ricevuti.

**Log.** Una riga per richiesta su stdout, con istante ISO, metodo, percorso senza query,
stato e durata in ms. Esempio: `2026-11-26T10:00:00.000Z POST /pair 401 12ms`. Non si
registrano mai: header `Authorization`, corpi, query string, token, deviceToken, codici di
autorizzazione o di accoppiamento, `state` e `nonce` OIDC, `code_verifier`,
`WEBEEP_OIDC_CLIENT_SECRET`.

**Adattatore Node.**

- `node:http` converte la richiesta in `Request` (corpo letto con il limite di 1 MB) e la
  risposta del nucleo in `ServerResponse`.
- `ctx.clientIp`: con `WEBEEP_TRUST_PROXY=true`, l'ultimo valore di `X-Forwarded-For` se
  presente, altrimenti `socket.remoteAddress`. Con `false` (default) è sempre
  `socket.remoteAddress`. Il valore dell'header è affidabile solo se la porta è raggiungibile
  soltanto dal proxy (sezione 8).
- Il processo ascolta in chiaro su `0.0.0.0:PORT` dentro il container. Il TLS è del proxy.

## 8. Deploy

- **Dockerfile multi-stage** su `node:22-slim`: uno stadio di build (installazione con
  lockfile, build, `pnpm deploy` del pacchetto in produzione) e uno stadio finale che copia
  solo il risultato.
- Utente non root: `USER node` (uid 1000). `/data` deve essere scrivibile da quell'utente.
- `ENV WEBEEP_DATA_DIR=/data PORT=8787`, `VOLUME ["/data"]`, `EXPOSE 8787`.
- I segreti arrivano dall'ambiente del container (file d'ambiente o secret del runtime),
  mai dentro l'immagine. Sono segreti `WEBEEP_SECRET_KEY` e `WEBEEP_OIDC_CLIENT_SECRET`.
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
  Con questo proxy va impostato `WEBEEP_TRUST_PROXY=true`.

- **Backup.** `state.bin` è cifrato, ma senza `WEBEEP_SECRET_KEY` non serve a nulla: la
  chiave va conservata separatamente.

### 8.1 Configurazione Authentik

Il server richiede in Authentik:

- un provider OAuth2/OpenID di tipo **confidenziale** (client type Confidential), con client
  ID e client secret che vanno in `WEBEEP_OIDC_CLIENT_ID` e `WEBEEP_OIDC_CLIENT_SECRET`;
- un redirect URI di tipo strict, esatto: `<WEBEEP_PUBLIC_URL>/oidc/callback`;
- gli scope `openid`, `profile` ed `email`. Con i mapping di default di Authentik lo scope
  `profile` include il claim `groups`, che il server legge da userinfo;
- un'applicazione con slug `webeep`, collegata al provider. Il suo issuer è
  `https://<authentik>/application/o/webeep/`, da indicare in `WEBEEP_OIDC_ISSUER`;
- un gruppo `webeep` (o il nome indicato in `WEBEEP_OIDC_ALLOWED_GROUP`) con l'utente
  autorizzato. Una policy di binding sull'applicazione è facoltativa: il server controlla
  comunque il gruppo.

Migrazione dalla v1: rimuovere `WEBEEP_ADMIN_PASSWORD` e `WEBEEP_PAIRING_KEY`, aggiungere le
variabili OIDC e ricollegare l'app desktop.

Ordine per il primo collegamento:

1. configurare Authentik (sezione 8.1);
2. avviare il server con le variabili obbligatorie (sezione 2);
3. collegare dall'app desktop (sezione 4.4): si inserisce l'URL del server e si completa il
   login Authentik nel browser;
4. in Claude: Impostazioni → Connettori → aggiungi connettore personalizzato, con URL
   `<WEBEEP_PUBLIC_URL>/mcp`;
5. Claude apre la pagina di autorizzazione (sezione 5.3): dopo il login Authentik si
   conferma il consenso con "autorizza".

## 9. Sicurezza

| Rischio | Mitigazione |
|---|---|
| Furto di `state.bin` | Inutile senza `WEBEEP_SECRET_KEY` (AES-256-GCM). I refresh token e il deviceToken sono salvati come hash; gli access token stanno solo in memoria. |
| Furto di `WEBEEP_OIDC_CLIENT_SECRET` | Valore solo in ambiente; mai su disco, nei log o nelle risposte. Il server non salva né i token né l'ID token di Authentik. |
| Segreto condiviso tra app e server | Non esiste. L'accoppiamento usa un codice monouso di 120 secondi con PKCE, il login Authentik e un deviceToken revocabile. |
| Identità dell'utente | Login Authentik (OIDC) e controllo del gruppo `WEBEEP_OIDC_ALLOWED_GROUP`; gli account fuori gruppo ricevono 403 (sezione 10.3). |
| Uso di Claude senza consenso | Pagina di consenso obbligatoria con token CSRF monouso di 5 minuti: un client DCR non ottiene token in silenzio dalla sessione Authentik già aperta (sezione 5.3). |
| Loopback del desktop | `redirect_uri` solo `http://127.0.0.1:<porta>/callback`; listener attivo solo durante il flusso e solo su 127.0.0.1. |
| Revoca del dispositivo | `DELETE /pair` cancella sessione, deviceToken e token OAuth. |
| Forza bruta su `/pair` | 5 codici errati in 15 minuti per IP, poi 429 (sezione 4.3). Codici di 120 secondi e monouso. |
| Intercettazione in transito | HTTPS obbligatorio (`WEBEEP_PUBLIC_URL` e `WEBEEP_OIDC_ISSUER` https); il proxy termina il TLS verso l'esterno; il server parla con Authentik e WeBeep in HTTPS diretto. Il processo ascolta in chiaro solo sulla rete interna. |
| Uso da pagine web (CSRF, CORS) | Nessun CORS. Le pagine HTML hanno CSP restrittiva e `frame-ancestors 'none'`; il consenso richiede il token CSRF. |
| Redirect OAuth verso siti terzi | `redirect_uri` solo per corrispondenza esatta con quelli registrati, e solo `https` o localhost. |
| Intercettazione del codice di autorizzazione | PKCE S256 obbligatorio; codice monouso valido 60 secondi. |
| Registrazione massiva di client | DCR aperto ma limitato a 20 client; nessun token è emesso senza consenso esplicito dell'utente. |
| Scritture su WeBeep | Nessun tool di scrittura; il nucleo usa solo le funzioni di lettura (più `getSiteInfo`). |
| SSRF tramite `read_file` | Solo host `webeep.polimi.it`, segmento `pluginfile.php`, redirect solo verso lo stesso host. |
| Token nell'output | Il token non compare in risposte, tool o log; `fileUrl` è privo di token. |
| Falsificazione dell'IP tramite `X-Forwarded-For` | Con `WEBEEP_TRUST_PROXY=true` la porta è raggiungibile solo dal proxy (sezione 8). |
| Login con ID token non verificato nella firma | Scelta documentata (sezione 10.4): il token arriva dal `token_endpoint` in HTTPS con autenticazione del client; il `nonce` è verificato se presente. |

Rischi residui della v2:

- Chi ottiene insieme il file di stato e la chiave ottiene anche il token WeBeep: va
  protetto l'host del server.
- Il riuso di un refresh token già ruotato dà `invalid_grant` ma non revoca la famiglia:
  un refresh token trafugato resta valido fino a scadenza o revoca.
- Il deviceToken non scade: vale fino a `DELETE /pair` o a un nuovo accoppiamento.
- Il consenso dato a un client non è revocabile dall'utente in v2 (sezione 11, punto 3).
- I contatori di rate limit stanno in memoria: un riavvio li azzera.

## 10. Login con Authentik (OIDC)

Il server è client confidenziale di Authentik e usa Authorization Code con PKCE. Il modulo è
implementato a mano con `fetch` e `crypto.subtle`, senza dipendenze nuove. Il login serve a
due flussi: `claude-authorize` (sezione 5.3) e `desktop-pair` (sezione 4.1).

### 10.1 Discovery

- Documento: `GET <issuer>/.well-known/openid-configuration`, dove `<issuer>` è
  `WEBEEP_OIDC_ISSUER` senza slash finale.
- Normalizzazione: la slash finale dell'issuer configurato è facoltativa e si rimuove prima
  del confronto. Il campo `issuer` del documento, normalizzato allo stesso modo, deve
  coincidere con l'issuer configurato, altrimenti la discovery non è valida.
- Il documento deve contenere `authorization_endpoint`, `token_endpoint` e `userinfo_endpoint`,
  tutti URL `https` assoluti (validazione zod). Campi mancanti o non validi: discovery non valida.
- La discovery valida è in cache in memoria per la vita del processo.
- Se la discovery fallisce (rete, risposta non valida, issuer diverso), il fallimento **non
  deve** essere cachato: la richiesta che l'ha incontrato risponde 503 con la pagina
  "servizio di accesso non disponibile, riprova tra poco", e la richiesta successiva la ritenta.

### 10.2 Login e callback

**Avvio del login.** Il server genera lo stato OIDC, il `nonce` e il `code_verifier` (32 byte
casuali in base64url ciascuno), e salva il login pendente sotto lo stato OIDC, con
`{ purpose, data, nonce, codeVerifier, expiresAt }`, valido 10 minuti e monouso. Poi risponde
302 verso `authorization_endpoint` con:
`response_type=code`, `client_id=<WEBEEP_OIDC_CLIENT_ID>`, `redirect_uri=<WEBEEP_PUBLIC_URL>/oidc/callback`,
`scope=openid profile email`, `state=<stato OIDC>`, `nonce=<nonce>`,
`code_challenge=<base64url(SHA-256(code_verifier))>`, `code_challenge_method=S256`.

- `purpose` è `claude-authorize`, con `data` = i parametri di `/authorize` già validati
  (sezione 5.3), oppure `desktop-pair`, con `data` = `{ redirectUri, state, codeChallenge }`
  di `/pair/start` (sezione 4.2).
- Lo stato OIDC è distinto dal `state` del client OAuth e dal `state` del desktop.

**Callback `GET /oidc/callback`.** Passi in ordine:

1. Il login pendente è cercato per il parametro `state`. Se manca, è sconosciuto o scaduto:
   pagina HTML 400 "accesso scaduto: riprova dall'inizio". Se trovato, viene cancellato subito
   (monouso), anche se i passi seguenti falliscono.
2. Se è presente `error` (Authentik rifiuta o annulla): pagina HTML 400 "accesso non
   completato: riprova dall'inizio". Il valore di `error` non viene mostrato.
3. Se `code` manca: stessa pagina del passo 2.
4. Scambio al `token_endpoint`: `POST` form-urlencoded con `grant_type=authorization_code`,
   `code`, `redirect_uri=<WEBEEP_PUBLIC_URL>/oidc/callback`, `code_verifier` del login pendente.
   Autenticazione `client_secret_basic`: credenziali in `Authorization: Basic`, codificate
   come da RFC 6749 §2.3.1. Errore di rete: pagina 503 come in 10.1. Risposta non 200 o non
   conforme: pagina HTML 400 "accesso non completato: riprova dall'inizio".
5. Se la risposta contiene `id_token`, il payload (JSON in base64url) deve avere `nonce`
   uguale al `nonce` del login pendente, altrimenti pagina 400 come al passo 4. Gli altri
   claim non sono verificati: vedi sezione 10.4.
6. Chiamata a `userinfo_endpoint` con `Authorization: Bearer <access token>`. La risposta deve
   essere JSON con `groups` (array di stringhe). Errori come al passo 4.
7. Controllo di accesso: `groups` deve contenere `WEBEEP_OIDC_ALLOWED_GROUP` (sezione 10.3).
   Altrimenti: pagina HTML 403 "account non autorizzato". Nessun codice e nessuna voce di
   consenso vengono creati.
8. Access token e ID token sono scartati subito: non vengono salvati né scritti nei log.
   Dell'identità non si conserva nulla.
9. Esito in base al purpose:
   - `claude-authorize`: crea la voce di consenso (token CSRF e parametri, sezione 5.4) e
     risponde con la pagina di consenso (sezione 5.3);
   - `desktop-pair`: crea il codice di accoppiamento e risponde 302 verso `redirect_uri`
     (sezione 4.2).

### 10.3 Gruppo di accesso

- Il claim `groups` deve contenere `WEBEEP_OIDC_ALLOWED_GROUP` (default `webeep`). Il
  confronto è esatto, sensibile alle maiuscole.
- Gli utenti fuori dal gruppo ricevono 403 "account non autorizzato" e non ottengono né
  codici di accoppiamento né consensi.

### 10.4 Scelte sulla verifica del token

- La firma dell'ID token **non viene verificata**, e non vengono controllati `iss`, `aud` ed
  `exp`. Motivo: il token arriva direttamente dal `token_endpoint` in HTTPS, in una richiesta
  autenticata con il client secret. È la stessa fiducia del TLS server-server. Il server usa
  l'ID token solo per il `nonce` e poi lo scarta.
- L'identità e l'appartenenza al gruppo derivano da `userinfo`, chiamato con l'access token
  ottenuto nella stessa connessione TLS.
- Il `nonce` è verificato quando l'ID token è presente. Il suo scopo è impedire il riuso di un
  token in un altro login; non è una verifica di autenticità.

## 11. Punti aperti e dipendenze

Punti aperti:

1. **SDK MCP. Decisa.** Il protocollo usa `@modelcontextprotocol/server` 2.4.0, nuova
   dipendenza autorizzata dall'utente (regola 9 di AGENTS.md).
2. **`htmlToText` nel nucleo.** Il desktop lo fa con il DOM, il server non ha DOM: la
   versione del nucleo non usa dipendenze nuove (sezione 6.2).
3. **Revoca del consenso.** In v2 l'utente non può revocare il consenso dato a un client, ma
   solo i suoi token (`/revoke`). Da valutare una pagina per gestire i client autorizzati.
4. **Accoppiamento senza conferma.** Il flusso `desktop-pair` non chiede conferma. Un processo
   locale che apre un listener sul loopback può avviare la richiesta, ma serve comunque il
   login Authentik dell'utente. Da valutare una conferma nell'app.
5. **ID token non verificato nella firma.** Scelta documentata in sezione 10.4. Da riconsiderare
   se il token dovesse arrivare da un canale diverso dal `token_endpoint` diretto.
6. **deviceToken senza scadenza.** Vale fino a `DELETE /pair` o a un nuovo accoppiamento. Da
   valutare una scadenza o una rotazione.

Dipendenze già presenti: `@webeep/moodle-api` e `zod` (versione 4, come nel monorepo). Il
modulo OIDC non aggiunge dipendenze.

Decisioni prese in questa versione che non erano nella richiesta originale, da confermare
o annullare:

- firma `handle(request, ctx: { clientIp })`: l'IP serve ai rate limit e non può arrivare
  in un header controllabile dal client;
- `WEBEEP_TRUST_PROXY` vale `false` di default; con `true`, `clientIp` è l'ULTIMO valore di
  `X-Forwarded-For`: il proxy aggiunge il suo valore in coda, mentre i valori precedenti li
  può scrivere il client;
- errori JSON `{ "error": "<codice>" }` per gli endpoint non OAuth, con `503 webeep_unreachable`;
- ogni nuovo accoppiamento revoca i refresh token e cancella gli access token in memoria;
  anche `DELETE /pair` cancella gli access token;
- `DELETE /pair` non è più idempotente: con il deviceToken già revocato risponde 401;
- il codice di accoppiamento è consumato dal primo `POST /pair` che lo riceve, anche con PKCE errato;
- `state` del loopback di 16–128 caratteri base64url, `code_challenge` di 43 caratteri;
- il consenso conserva i parametri lato server: il form invia solo il token CSRF e la decisione;
- `server:get-link` cancella il deviceToken locale su 401 da `GET /pair`;
- alias `/.well-known/oauth-protected-resource/mcp`;
- nomi dei metadati OAuth con il suffisso RFC `_supported`;
- `image/svg+xml` e gli altri `image/*` diversi da JPEG, PNG, GIF e WebP vanno come risorsa `blob`;
- output MCP solo JSON; `GET` e `DELETE` su `/mcp` rispondono 405;
- `server:link`, `server:cancel-link` e `server:unlink` in `WEB_UNAVAILABLE_CHANNELS`.
