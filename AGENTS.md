# AGENTS.md — guida operativa per lo sviluppo

Istruzioni per gli agenti AI (e i contributor) che lavorano su questo
repository. Leggi questa pagina prima di toccare il codice. Il dettaglio tecnico
è in [`docs/`](docs/).

## Cos'è questo progetto

**WeBeep Desktop** è un client desktop per [WeBeep](https://webeep.polimi.it),
il Moodle del Politecnico di Milano. Usa le API web service di Moodle (le stesse
dell'app ufficiale Moodle Mobile) per mostrare corsi, materiali, scadenze e
notifiche in un'app nativa, veloce e con i file a portata di mano.

Niente server intermedio, niente telemetria: l'app parla solo con
`webeep.polimi.it`, con il token dell'utente.

- Stack: monorepo **TypeScript** con **pnpm**:
  - `packages/moodle-api` — client Moodle tipizzato (zod), login SSO. Non
    dipende da Electron né da React.
  - `packages/ui-kit` — design system T3 Code (token + componenti React).
  - `apps/desktop` — app Electron: `src/main` (main process), `src/preload`,
    `src/shared` (contratto IPC), `src/renderer` (React + Tailwind 4 +
    TanStack Query).
- Design system: **T3 Code**
  ([artifact](https://claude.ai/artifact/8tZb4puZkxqf3WNUoitVgr)), riassunto
  operativo in [`docs/DESIGN-SYSTEM.md`](docs/DESIGN-SYSTEM.md).
- Architettura e flussi: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
  Funzioni Moodle usate: [`docs/MOODLE-API.md`](docs/MOODLE-API.md).

## `TODO.md`: la direzione del lavoro

[`TODO.md`](TODO.md) è il **backlog dell'utente**: l'ordine delle voci è la
priorità. Leggilo a inizio sessione, prima di pianificare.

- **Sessione senza compito preciso** ("vai", "continua"): il compito è
  `TODO.md`. Prendi le voci aperte dall'alto, chiudine quante riesci davvero
  (meglio una chiusa e verificata che tre a metà), non inventare lavoro fuori
  lista. Se non ci sono voci aperte, proponi i prossimi passi e aspetta un sì.
- **Sessione con un compito**: fai quello. Se corrisponde a una voce, trattalo
  come quella voce e aggiornala alla chiusura.
- **Aggiornare il file**: spunta (`- [x]`) solo a lavoro "fatto" (vedi sotto),
  nello stesso commit, con una breve nota tra parentesi; per un lavoro parziale
  lascia la voce aperta con `(parziale: …)`. Non riscrivere, riordinare o
  cancellare le voci dell'utente; i seguiti emersi vanno nel riepilogo.
  `TODO.md` lo tocca **un solo sotto-agente alla volta**, e solo se il prompt lo autorizza.

## Regole non negoziabili

1. **Il token Moodle non lascia mai il main process.** Non passa per l'IPC, non
   finisce nel DOM, nei log, negli errori o negli URL mostrati. Il renderer
   vede immagini e file solo tramite `webeep-asset://` (`toAssetUrl` in
   `src/shared/ipc.ts`) o chiedendo al main di scaricare/aprire.
2. **Il token su disco solo cifrato** (`safeStorage`,
   `apps/desktop/src/main/session-store.ts`). Se la cifratura non è
   disponibile, il token resta in memoria. Mai in chiaro.
3. **Il renderer è non fidato.** `contextIsolation`, `sandbox`, niente
   `nodeIntegration`. L'unica porta è `window.webeep` (preload). Ogni canale IPC
   è dichiarato in `src/shared/ipc.ts` e valida i suoi input nel main (URL solo
   `http(s)`, file solo da `webeep.polimi.it`, percorsi sanificati).
4. **L'HTML di Moodle non si inietta.** Niente `dangerouslySetInnerHTML` con
   contenuti di WeBeep: si mostra come testo (`htmlToText` in
   `src/renderer/src/lib/format.ts`). Quando servirà HTML ricco si aggiunge un
   sanitizer (DOMPurify) con una decisione esplicita.
5. **Si valida al confine.** Ogni risposta Moodle passa da uno schema zod in
   `packages/moodle-api/src/schemas.ts`. Niente `any`, niente JSON non validato
   nel resto del codice.
6. **I download non rompono file buoni.** Si scrive in `.part` e si rinomina a
   download completo (`apps/desktop/src/main/files.ts`).
7. **`moodle-api` resta neutrale.** Non importa Electron né React. Ciò che usa
   Node (`node:crypto`) sta in `@webeep/moodle-api/auth`, importato solo dal
   main.
8. **Sola lettura verso WeBeep, salvo azioni esplicite dell'utente.** L'app non
   modifica nulla sul sito (consegne, post, voti) senza un'azione diretta e
   confermata dell'utente.
9. **Niente nuove dipendenze senza necessità.** Prima di aggiungerne una,
   chiediti se la piattaforma o una dipendenza esistente bastano. Le aggiunge
   solo un sotto-agente, con autorizzazione esplicita dell'utente.

## Stile del codice

Un hook (`typescript-patterns-enforcer`) blocca le violazioni meccaniche a ogni
scrittura di file `.ts`/`.tsx`. In pratica:

- niente `any`; `as` solo con un commento che lo giustifica;
- tipi di ritorno espliciti sulle funzioni esportate; `readonly` di default;
- `async/await`, mai catene `.then()`; mai inghiottire errori;
- niente cicli `for`/`while`: `.map`/`.filter`/`.reduce`/`.forEach`;
- niente numeri magici: costanti con nome (i dati di prova vanno in `.json`);
- ogni regex ha sopra un commento con cosa accetta, un esempio che passa, uno
  che non passa e un link a regex101 precompilato;
- `type` invece di `interface`, union di stringhe invece di `enum`;
- niente `switch` (l'hook lo blocca): per scegliere in base a una union usa
  una mappa `Record<Union, …>` (esaustiva per costruzione) o una catena di `if`;
- `lucide-react` 1.x ha rinominato alcune icone (`AlertCircle` → `CircleAlert`):
  se un'icona non esiste, cerca il nome nuovo in `node_modules/lucide-react`;
- componenti come `const` arrow con export nominali; un componente per file;
  logica in hook, viste solo di rendering;
- testi dell'interfaccia in **italiano**, frasi in minuscolo ("Apri nel
  browser"), niente emoji; commenti in italiano che spiegano il *perché*.

## Modalità di lavoro: orchestratore e sotto-agenti

La sessione avviata dall'utente è **sempre e solo l'orchestratore**. Non esegue
lavoro operativo: lo fanno i sotto-agenti. Il motivo è il costo: il modello
principale è il più caro, quindi deve spendere token solo per coordinare.

### Ruolo dell'orchestratore

L'orchestratore:

- capisce la richiesta e pianifica;
- scompone il lavoro in compiti a file disgiunti;
- scrive prompt autosufficienti per i sotto-agenti;
- lancia i sotto-agenti, in parallelo quando sono indipendenti;
- legge i loro riepiloghi, decide i passi successivi e riferisce all'utente.

Non scrive né modifica codice, test, documentazione o configurazione, nemmeno
per modifiche piccole o "veloci". Non rilegge diff interi, non esegue
typecheck, test o build e non fa diagnosi di bug.

### Lavoro dei sotto-agenti

Tutto il lavoro operativo passa ai sotto-agenti, compreso quello che prima
faceva l'orchestratore:

- contratti condivisi: tipi, canali IPC, hook dati, token del design system;
- file caldi (elenco sotto);
- diagnosi dei bug;
- verifica finale;
- commit.

Il contratto condiviso si fissa per primo: un sotto-agente lo scrive, poi gli
altri lo usano senza modificarlo. Solo dopo parte il fan-out.

File caldi: `package.json`, `pnpm-lock.yaml`, `src/shared/ipc.ts`,
`src/renderer/src/lib/*`, `src/renderer/src/App.tsx`, `packages/*/src/index.ts`,
`packages/ui-kit/src/theme.css`, `docs/`, `TODO.md`, `AGENTS.md`. Un solo
sotto-agente alla volta li modifica, in serie, e solo se il prompt lo autorizza
esplicitamente.

### Modello dei sotto-agenti

Regola: modello Claude Haiku (`model: "haiku"`), reasoning `high` come
predefinito. Imposta sempre modello ed effort in modo esplicito quando lanci un
sotto-agente.

| Modello | Reasoning | Quando |
|---|---|---|
| Haiku | `high` (predefinito) | viste, moduli, contratti, bug, diagnosi, verifica UI |
| Haiku | `medium` | solo lavoro puramente meccanico e ben specificato: rinomine, import, barrel, scheletri di test, commit |
| Orchestratore | — | solo coordinamento: piano, scomposizione, prompt, lettura dei riepiloghi, decisioni |

Nessun altro modello senza indicazione esplicita dell'utente. Se un compito è
troppo difficile per Haiku `high`, non si sale di modello e non lo fa
l'orchestratore: lo si scompone in compiti più piccoli.

### Parallelismo e file disgiunti

- Ogni sotto-agente riceve l'elenco esplicito dei file e delle cartelle che può
  toccare.
- Due sotto-agenti in parallelo non toccano mai lo stesso file.
- I compiti indipendenti partono nello stesso turno.

### Verifica

- Finiti i sotto-agenti di scrittura, l'orchestratore lancia un sotto-agente
  verificatore (Haiku, `high`). Esegue `pnpm typecheck`, `pnpm test`,
  `pnpm build` e, quando serve, controlla la UI con `pnpm dev:web` (tema chiaro
  e scuro, stati di caricamento, vuoto ed errore).
- Il verificatore restituisce un riepilogo breve: esiti e problemi.
- L'orchestratore legge solo il riepilogo. Se qualcosa non torna, lancia un
  sotto-agente di correzione con i problemi elencati.
- Il lavoro non è fatto finché il verificatore non riporta esito verde.

### Diagnosi con dati reali

- Per i bug che si vedono solo con WeBeep reale, il sotto-agente usa
  `pnpm diagnose`: modalità diagnostica del main process, usa la sessione salvata
  dell'utente e stampa esiti senza mai mostrare il token.
- Il token non va mai stampato, riportato in un riepilogo o salvato in chiaro.
- Se `pnpm diagnose` non esiste ancora in `package.json`, il sotto-agente lo
  segnala e non lo inventa.

### Commit

- Il commit lo fa un sotto-agente, su indicazione dell'orchestratore, a lavoro
  verificato.
- Messaggio Conventional Commits in italiano, con riga finale:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- Mai push o PR senza richiesta esplicita dell'utente.

### Cosa NON fa un sotto-agente

- aggiungere dipendenze, o toccare `package.json` e il lockfile, senza
  autorizzazione esplicita dell'utente nel prompt;
- modificare i file caldi se il prompt non lo autorizza; se il contratto non
  basta, lo segnala nel riepilogo e si ferma su quel punto;
- fare commit se il prompt non lo autorizza;
- push e PR, in nessun caso senza richiesta esplicita dell'utente;
- chiamare il vero WeBeep o chiedere credenziali: per l'interfaccia si usa il
  bridge finto. Fa eccezione `pnpm diagnose`, quando il prompt lo prevede.

### Modello di prompt per un sotto-agente

```
Obiettivo: <una frase>.
Repository: /home/joel/progetti/webeep-desktop. Leggi prima AGENTS.md (e docs/DESIGN-SYSTEM.md se tocchi la UI).
File che puoi creare/modificare: <elenco>. Nient'altro.
Autorizzazioni: commit <no | sì>; file caldi <nessuno | elenco>; nuove dipendenze <no | sì>. Mai push o PR.
Contratto da usare (non modificarlo): <percorsi>.
Requisiti: <elenco puntato, comportamento e stati: caricamento, vuoto, errore>.
Verifica prima di chiudere: `pnpm typecheck` verde; nessun `any`; testi in italiano.
Riepilogo finale: massimo 5 righe (esito, file toccati, problemi, cosa non hai potuto fare e perché).
```

## Ambiente e comandi

- Node.js 22+ e **pnpm** (`pnpm install` scarica anche il binario di Electron).

```bash
pnpm install
pnpm dev          # app Electron con HMR (login reale su WeBeep)
pnpm dev:web      # solo interfaccia nel browser, http://localhost:5173, dati finti
pnpm diagnose    # diagnosi con WeBeep reale: sessione salvata, mai il token in output
pnpm typecheck    # tsc su tutti i pacchetti
pnpm test         # test di packages/moodle-api (Vitest)
pnpm build        # typecheck + build di produzione in apps/desktop/out
```

`pnpm dev:web` usa il bridge finto (`src/renderer/src/lib/mock-bridge.ts` e
`mock-fixtures.json`): è il modo standard per sviluppare e verificare le viste.
Aggiungi `?mock=signed-out` all'URL per vedere la schermata di login.

### Definizione di "fatto"

La verifica la esegue il sotto-agente verificatore; il punto 4 richiede l'utente.

1. `pnpm typecheck` e `pnpm build` senza errori;
2. `pnpm test` verde (e test nuovi per la logica nuova in `moodle-api`);
3. per la UI: vista controllata in `pnpm dev:web` in tema chiaro e scuro, con
   stati di caricamento, vuoto ed errore;
4. per login, token, download: prova nell'app Electron (`pnpm dev`) con un
   account reale, fatta dall'utente o con l'utente;
5. voce di `TODO.md` spuntata con nota;
6. commit (vedi sotto).

## Git

- Conventional Commits in italiano: `feat(course): elenco file con download`,
  `fix(auth): …`, `docs: …`. Scope tipici: `moodle-api`, `ui-kit`, `main`,
  `ipc`, `renderer`, o il nome della vista.
- Si lavora su branch (`feat/<slug>`, `fix/<slug>`); `main` riceve solo merge.
- Commit li fa un sotto-agente su indicazione dell'orchestratore, a fine task
  verificato. Push e PR solo su richiesta esplicita dell'utente.
