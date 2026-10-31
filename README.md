<p align="center">
  <img src="apps/desktop/build/icon.png" width="160" alt="Icona di WeBeep Desktop">
</p>

<h1 align="center">WeBeep Desktop</h1>

<p align="center">
  <strong>Corsi, materiali, scadenze e notifiche di WeBeep in un'app desktop.</strong>
</p>

<p align="center">
  <a href="https://github.com/gioelerosana/webeep-desktop/releases"><img src="https://img.shields.io/github/v/release/gioelerosana/webeep-desktop" alt="Ultima release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/licenza-MIT-3b6cf6" alt="Licenza MIT"></a>
  <img src="https://img.shields.io/badge/piattaforme-Windows%20%C2%B7%20Linux-24252b" alt="Windows, Linux">
</p>

---

WeBeep Desktop è un client desktop per [WeBeep](https://webeep.polimi.it), il
Moodle del Politecnico di Milano. Usa le stesse API web service dell'app Moodle
Mobile per mostrare corsi, file, scadenze e notifiche, con i file a portata di
mano.

Progetto non ufficiale, non affiliato al Politecnico di Milano. Niente server
intermedio, niente telemetria: l'app parla solo con `webeep.polimi.it`, con il
token dell'utente.

> Stato: prototipo in sviluppo. Le voci ancora aperte sono in [TODO.md](TODO.md).

- **Corsi.** Sidebar con i corsi in corso e ricerca. I corsi si mettono nei
  preferiti, che compaiono come card nella home. La pagina di ogni corso mostra
  sezioni, moduli e file, con filtro sui materiali e stato per file.
- **File.** Apri un file con l'app predefinita, oppure scaricalo in una cartella
  a scelta, dentro `<corso>/<sezione>/<file>`. I file già aggiornati non vengono
  riscaricati.
- **Home.** Prossime scadenze, raggruppate per giorno con l'urgenza, e notifiche
  recenti.
- **Notifiche.** Elenco con filtro sulle non lette, segna come letta, apri la
  pagina su WeBeep. Un badge mostra le non lette.
- **Impostazioni.** Cartella di download, tema chiaro o scuro, account.
- **Segnalazione dei crash.** Se l'app si chiude per un errore, al riavvio un
  banner propone di segnalarlo. La segnalazione si apre nel browser come issue
  precompilata: l'invio lo fai tu. Prima di salvare, il testo viene ripulito da
  token e dal percorso della home.

## Installa

Scarica l'ultima versione dalla pagina delle
[Release](https://github.com/gioelerosana/webeep-desktop/releases):

- **Windows**: l'installer `WeBeep-Desktop-Setup-<versione>-x64.exe`. Il
  progetto non è firmato, quindi alla prima esecuzione SmartScreen mostra un
  avviso: "Ulteriori informazioni", poi "Esegui comunque".
- **Linux**: l'AppImage `WeBeep-Desktop-<versione>-x86_64.AppImage`. Rendila
  eseguibile e avviala.

Al primo avvio si accede con il login Polimi (SSO), in una finestra dedicata,
come nell'app ufficiale Moodle Mobile. L'app non chiede la password di WeBeep.

## Aggiornamenti

- **Windows**: l'app controlla le Release su GitHub e avvisa se c'è una versione
  nuova. Il download parte solo quando lo chiedi tu con "Scarica aggiornamento",
  e l'installazione con "Riavvia e aggiorna".
- **Linux (AppImage)**: l'app avvisa quando esce una versione nuova. L'aggiornamento
  si fa con un manager zsync (AppImageUpdate, Gear Lever, AppImageLauncher), che
  scarica solo i blocchi cambiati.

Dettagli e procedura di release in [docs/UPDATES.md](docs/UPDATES.md).

## Privacy

- L'app parla solo con `webeep.polimi.it`, usando il tuo token.
- Il token viene salvato solo cifrato con `safeStorage` di Electron, che usa il
  portachiavi del sistema. Se la cifratura non è disponibile, il token resta in
  memoria e non viene scritto su disco.
- Su Windows e con l'AppImage, il controllo degli aggiornamenti legge le Release
  su `github.com`. Le pagine di segnalazione di bug e crash si aprono nel browser
  solo quando lo chiedi tu.
- L'app non scrive su WeBeep se non per un'azione diretta, come segnare una
  notifica come letta.

## Sviluppo

Servono Node.js 22 o successivo e [pnpm](https://pnpm.io). `pnpm install` scarica
anche il binario di Electron.

```bash
pnpm install
pnpm dev          # app Electron con ricaricamento a caldo, login reale su WeBeep
pnpm dev:web      # solo interfaccia nel browser, con dati finti
pnpm web          # interfaccia servita in rete locale, con la sessione salvata dall'app
pnpm typecheck    # controllo dei tipi su tutti i pacchetti
pnpm test         # test di packages/moodle-api
pnpm build        # typecheck e build di produzione in apps/desktop/out
pnpm dist:linux   # AppImage in apps/desktop/release
```

Il monorepo è diviso in tre parti:

| Percorso | Contenuto |
| --- | --- |
| `apps/desktop` | App Electron: processo principale, preload, interfaccia React |
| `packages/moodle-api` | Client Moodle tipizzato e login SSO. Non dipende da Electron né da React |
| `packages/ui-kit` | Design system T3 Code: token e componenti React |

Lo stack è TypeScript, Electron, React, Tailwind CSS e TanStack Query, con
validazione delle risposte Moodle tramite zod.

Documentazione tecnica:

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): architettura, flussi dei dati,
  login, file, modalità web.
- [docs/MOODLE-API.md](docs/MOODLE-API.md): funzioni Moodle usate.
- [docs/DESIGN-SYSTEM.md](docs/DESIGN-SYSTEM.md): design system e token.
- [docs/UPDATES.md](docs/UPDATES.md): aggiornamenti e procedura di release.
- [AGENTS.md](AGENTS.md): regole per chi contribuisce, umani e agenti.

## Licenza

Il progetto è distribuito con licenza MIT. Il testo completo è in [LICENSE](LICENSE).
