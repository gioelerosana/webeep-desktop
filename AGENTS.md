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
  `TODO.md` lo tocca **solo l'orchestratore**.

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
   solo l'orchestratore.

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
- `type` invece di `interface`, union di stringhe invece di `enum`, `switch`
  esaustivi con `assertNever`;
- componenti come `const` arrow con export nominali; un componente per file;
  logica in hook, viste solo di rendering;
- testi dell'interfaccia in **italiano**, frasi in minuscolo ("Apri nel
  browser"), niente emoji; commenti in italiano che spiegano il *perché*.

## Modalità di lavoro: orchestratore e sotto-agenti

**L'agente principale è un orchestratore, non un esecutore.** Pianifica,
scrive i contratti, delega e integra; il grosso del codice lo scrivono
**sotto-agenti Claude Haiku**.

### Modello dei sotto-agenti

**Regola rigida: l'unico modello ammesso per i sotto-agenti è Claude Haiku**
(`model: "haiku"`), con reasoning `medium` o `high`. Né Sonnet né Opus né altri
provider, salvo indicazione esplicita dell'utente nella sessione.

| Modello | Reasoning | Quando |
|---|---|---|
| Haiku | `medium` | lavoro meccanico e ben specificato: componenti su un modello esistente, restyle, test su pattern esistenti, ricerche nel codice |
| Haiku | `high` | lavoro delimitato ma non banale: una vista intera, un modulo nuovo, un bug circoscritto |
| Orchestratore | — | piano, contratti condivisi, revisione e integrazione |

Se un compito è troppo difficile per Haiku `high`, non si passa a un modello
più grande: lo si scompone o lo fa l'orchestratore. Imposta sempre modello ed
effort in modo esplicito quando lanci un sotto-agente.

### Responsabilità dell'orchestratore

1. **Contratto prima del fan-out.** Tipi, canali IPC, hook dati, token e
   componenti del kit li scrive l'orchestratore e li committa prima di lanciare
   i sotto-agenti.
2. **File disgiunti.** Ogni sotto-agente riceve l'elenco esplicito dei file e
   delle cartelle che può toccare; due agenti in parallelo non toccano mai lo
   stesso file. File "caldi" solo dell'orchestratore: `package.json`,
   `pnpm-lock.yaml`, `src/shared/ipc.ts`, `src/renderer/src/lib/*`,
   `src/renderer/src/App.tsx`, `packages/*/src/index.ts`,
   `packages/ui-kit/src/theme.css`, `docs/`, `TODO.md`, `AGENTS.md`.
3. **Prompt autosufficienti.** Il sotto-agente parte senza contesto: obiettivo,
   file ammessi, contratto (percorsi da leggere), regole non negoziabili
   rilevanti, criteri di accettazione, comando di verifica.
4. **Parallelismo reale.** I compiti indipendenti partono nello stesso turno.
5. **Verifica a freddo.** Al rientro l'orchestratore rilegge i diff, esegue
   `pnpm typecheck`, `pnpm test`, `pnpm build` e controlla la UI (anteprima nel
   browser con il bridge finto, poi l'app Electron). Il lavoro non è fatto
   finché non è verificato.

### Cosa NON fa un sotto-agente

- aggiungere dipendenze o toccare `package.json`/lockfile;
- modificare i file "caldi" elencati sopra (se il contratto non basta, lo
  segnala nel riepilogo e si ferma su quel punto);
- commit, push, PR;
- chiamare il vero WeBeep o chiedere credenziali: per l'interfaccia si usa il
  bridge finto.

### Modello di prompt per un sotto-agente

```
Obiettivo: <una frase>.
Repository: /home/joel/progetti/webeep-desktop. Leggi prima AGENTS.md e docs/DESIGN-SYSTEM.md.
File che puoi creare/modificare: <elenco>. Nient'altro.
Contratto da usare (non modificarlo): <percorsi>.
Requisiti: <elenco puntato, comportamento e stati: caricamento, vuoto, errore>.
Verifica prima di chiudere: `pnpm typecheck` verde; nessun `any`; testi in italiano.
Riepilogo finale: file toccati, scelte fatte, cosa non hai potuto fare e perché.
```

## Ambiente e comandi

- Node.js 22+ e **pnpm** (`pnpm install` scarica anche il binario di Electron).

```bash
pnpm install
pnpm dev          # app Electron con HMR (login reale su WeBeep)
pnpm dev:web      # solo interfaccia nel browser, http://localhost:5173, dati finti
pnpm typecheck    # tsc su tutti i pacchetti
pnpm test         # test di packages/moodle-api (Vitest)
pnpm build        # typecheck + build di produzione in apps/desktop/out
```

`pnpm dev:web` usa il bridge finto (`src/renderer/src/lib/mock-bridge.ts` e
`mock-fixtures.json`): è il modo standard per sviluppare e verificare le viste.
Aggiungi `?mock=signed-out` all'URL per vedere la schermata di login.

### Definizione di "fatto"

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
- Commit e push li fa l'orchestratore a fine task; la PR è una decisione
  dell'utente.
