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
  `toAssetUrl(fileurl)` → `webeep-asset://file/?url=…`; il main
  (`asset-protocol.ts`) aggiunge il token e scarica. Solo URL di WeBeep.
- **Apri**: `files:open` scarica nella cache (`userData/file-cache/…`) e apre
  con l'app predefinita.
- **Scarica**: `files:download` salva in
  `<downloadDir>/<corso>/<sezione>/<file>`, saltando i file già aggiornati
  (confronto con `timemodified`).

## Sviluppo dell'interfaccia senza login

In `pnpm dev:web` il renderer gira nel browser e `main.tsx` installa il bridge
finto (`lib/mock-bridge.ts`, dati in `lib/mock-fixtures.json`) con la stessa
forma di `WebeepBridge`. Il bridge finto non esiste nella build di produzione.
