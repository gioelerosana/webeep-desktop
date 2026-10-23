# Architettura

```
packages/moodle-api      client Moodle (Node/browser) + login SSO (solo Node)
packages/ui-kit          token T3 Code + componenti React
apps/desktop
  src/main               main process: sessione, chiamate Moodle, file, protocollo asset
  src/preload            espone window.webeep (WebeepBridge)
  src/shared/ipc.ts      contratto IPC: canali, tipi, eventi
  src/renderer           React: lib/ (dati, navigazione), layout/, views/
```

## Flusso dei dati

```
Vista React ──hook (lib/queries.ts)──▶ invoke(canale) ──preload──▶ ipcMain (main/handlers.ts)
                                                                     │
                                       withClient(...) ◀─────────────┘
                                             │
                                  @webeep/moodle-api ──HTTPS──▶ webeep.polimi.it/webservice/rest
```

- Il renderer legge dati **solo** con gli hook di `lib/queries.ts` (TanStack
  Query: cache, retry, invalidazioni).
- Ogni handler risponde con `IpcResult`; `invoke` lo trasforma in dati o in
  `IpcError` con `kind` (`auth`, `network`, `moodle`, `invalid-input`,
  `unknown`).
- Se Moodle risponde `invalidtoken`, `withClient` chiude la sessione e il main
  emette `auth:changed`: l'interfaccia torna al login da sola.

## Login (SSO Polimi)

WeBeep ha `typeoflogin = 2` (login nel browser) e il servizio mobile attivo
(`tool_mobile_get_public_config`). Non c'è login con password: si usa il flusso
di Moodle Mobile.

1. `main/login-window.ts` apre una finestra con sessione dedicata
   (`persist:webeep-login`) su
   `/admin/tool/mobile/launch.php?service=moodle_mobile_app&passport=<casuale>&urlscheme=moodlemobile`.
2. L'utente fa il login Polimi (Shibboleth, eventuale 2FA).
3. Moodle reindirizza a `moodlemobile://token=<base64>`. La finestra intercetta
   il redirect (`will-redirect`, `will-navigate` o handler dello schema).
4. `parseLaunchCallback` decodifica `md5(siteurl + passport):::token:::privatetoken`
   e verifica la firma contro il nostro passport.
5. `core_webservice_get_site_info` conferma il token; la sessione si salva
   cifrata (`session-store.ts`).

Logout: cancella la sessione salvata e i cookie della finestra di login.

## File e immagini

- **Immagini** (copertine, avatar): il renderer usa
  `window.webeep.assetUrl(fileurl)` (in Electron è `toAssetUrl` →
  `webeep-asset://file/?url=…`); il main
  (`asset-protocol.ts`) aggiunge il token e scarica. Solo URL di WeBeep.
- **Apri**: `files:open` scarica nella cache (`userData/file-cache/…`) e apre
  con l'app predefinita.
- **Scarica**: `files:download` salva in
  `<downloadDir>/<corso>/<sezione>/<file>`, saltando i file già aggiornati
  (confronto con `timemodified`).

## Barra del titolo

La finestra principale non ha la cornice nativa: su Linux e Windows
`frame: false`, su macOS `titleBarStyle: 'hiddenInset'` (restano i semafori).
I controlli (minimizza, massimizza, chiudi) li disegna l'app e chiama i canali
`window:minimize`, `window:toggle-maximize`, `window:close`, mentre
`window:is-maximized` dà lo stato iniziale. Il main inoltra gli eventi
`maximize`/`unmaximize` con `window:maximized-changed`, così il pulsante
massimizza resta allineato anche se la finestra cambia da sola. La finestra di
login (`main/login-window.ts`) resta con la cornice nativa.

## Modalità web

Con `WEBEEP_WEB=1` il main non apre alcuna finestra: serve renderer e API via
HTTP in rete locale (`main/web-server.ts`), con i dati reali. Il token resta nel
main, come in Electron: il browser riceve solo risultati `IpcResult` e URL di
immagini. Le chiamate usano `runChannel` (`main/handlers.ts`), la stessa logica
dei canali IPC, senza una finestra nel contesto.

**Canali bloccati.** Il server non esegue mai i canali in
`WEB_UNAVAILABLE_CHANNELS` (`shared/ipc.ts`): `auth:login`, `auth:logout`,
`files:download`, `files:open`, `files:reveal`, `settings:update`,
`settings:choose-download-dir`, `shell:open-external` e i `window:*`. Ognuno
agirebbe sul computer che serve la pagina (sessione, file, browser, impostazioni,
finestra) o non avrebbe una finestra a cui riferirsi; la risposta è
`invalid-input` e non succede nulla. `window.webeep.kind` dice dove gira
l'interfaccia (`electron`, `web`, `mock`).

**Avvio.** `pnpm web` builda il renderer e lancia Electron con `WEBEEP_WEB=1`.
Serve la sessione già salvata dall'app desktop: se non c'è, la pagina mostra il
login con il messaggio "Accedi dall'app desktop". La porta è `WEBEEP_WEB_PORT`
(predefinita 4173), in ascolto su tutte le interfacce. Ctrl+C chiude il server.

**Chiave d'accesso.** A ogni avvio il main genera una chiave casuale di 24 byte
(base64url) e stampa gli URL di rete locale nella forma
`http://<ip>:<porta>/?key=<chiave>`. La prima richiesta con la chiave giusta
imposta un cookie `HttpOnly; SameSite=Strict` e reindirizza a `/` senza query;
il confronto avviene con `crypto.timingSafeEqual` su hash SHA-256. Ogni altra
richiesta senza cookie valido riceve 401. La chiave non è salvata: un nuovo
avvio ne genera una nuova e i link vecchi smettono di funzionare. Chi ha il link
vede i dati WeBeep: va condiviso solo sulla rete di fiducia.

**Endpoint** (`main/web-routes.ts`, `main/web-static.ts`):
- `POST /api/ipc/<canale>` con `{ "args": [...] }`: canale del contratto non
  presente in `WEB_UNAVAILABLE_CHANNELS`, risposta `IpcResult`; corpo max 64 KB.
- `GET /api/asset?url=` e `GET /api/file?url=&name=&disposition=`: solo URL di
  WeBeep, in streaming. Il token si aggiunge nel main (`openWebeepFile` in
  `files.ts`) e non compare in header, risposte o log. I file di WeBeep hanno
  `Content-Security-Policy: sandbox` quando sono HTML, SVG o XML.
- Ogni altro percorso è l'interfaccia di `out/renderer`; un percorso inesistente
  ricade su `index.html`.

**Bridge nel browser** (`renderer/src/lib/http-bridge.ts`): `invoke` fa
`POST /api/ipc/<canale>`, tranne questi canali, gestiti nel browser:
`files:download` (download con `<a download>`), `files:open` e
`shell:open-external` (nuova scheda), `auth:logout` (rifiutato con "Per uscire
usa l'app desktop", senza chiamare il server), `settings:update` e
`settings:get`. Il tema scelto dal web si salva in `localStorage`
(`webeep:theme`) e ha la precedenza su quello del server, così non cambia il
desktop; la cartella dei download non si cambia dal web. Non ci sono eventi
spinti dal server.

## Sviluppo dell'interfaccia senza login

In `pnpm dev:web` il renderer gira nel browser e `main.tsx` installa il bridge
finto (`lib/mock-bridge.ts`, dati in `lib/mock-fixtures.json`) con la stessa
forma di `WebeepBridge`. Il bridge finto non esiste nella build di produzione.

## Aggiornamenti

Windows si aggiorna dentro l'app (`electron-updater`). Linux mostra un avviso in app e
si aggiorna con un manager zsync, grazie alle update information e al `.zsync` che la
CI aggiunge all'AppImage. Dettagli e procedura di release in [UPDATES.md](UPDATES.md).
