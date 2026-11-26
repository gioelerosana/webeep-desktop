# Release

Come si numera una release, come si lancia e cosa succede dopo. Gli aggiornamenti
arrivano agli utenti dalle GitHub Release: come li usa l'app è in
[UPDATES.md](UPDATES.md).

## Versioni

Le versioni hanno la forma **`AA.MAJOR.MINOR`** (SemVer `X.Y.Z`), per esempio `26.3.0`. Il tag
Git è la stessa versione con la `v` davanti: `v26.3.0`.

| Parte | Significato |
|---|---|
| `AA` | anno del rilascio a due cifre (data UTC del lancio) |
| `MAJOR` | cambi grossi o incompatibili; si incrementa solo su richiesta esplicita o per cambi incompatibili, e il terzo numero riparte da 0 |
| `MINOR` | ogni release normale (funzionalità e correzioni): si incrementa sempre l'ultimo numero |

Esempi: `26.3.0` + una `feat` → `26.3.1`. Con un cambio incompatibile (`bump` = `major`) → `26.4.0`.
Alla prima release di un anno nuovo la versione è `AA.0.0` (per esempio `27.0.0`), di qualunque tipo sia.

La sintassi SemVer permette a electron-builder e electron-updater di leggerla senza adattamenti.

Il numero è scritto nel campo `version` di quattro `package.json`: la radice,
`apps/desktop`, `packages/moodle-api` e `packages/ui-kit`. Li aggiorna solo
`node scripts/release-version.mjs set <versione>`, chiamato dal workflow. Nei branch di
lavoro non si tocca `version`.

## Quale release esce

Il tipo si ricava dai subject dei commit su `main` dall'ultimo tag `v*`, in
[Conventional Commits](https://www.conventionalcommits.org/) (`tipo(ambito): descrizione`).
Con lo squash merge il subject è il titolo della PR.

| Commit dall'ultimo tag | `bump` = `auto` o `minor` | `bump` = `major` |
|---|---|---|
| almeno un `feat(...)` o `fix`, `perf`, `refactor`, `style`, `revert`, `build` | `MINOR` +1: `26.3.0` → `26.3.1` | `MAJOR` +1, `MINOR` a 0: `26.3.1` → `26.4.0` |
| solo `docs`, `ci`, `chore`, `test`, o nessun commit | niente da rilasciare | rilascia comunque |

Un commit con `!` (`fix(core)!: …`) è un cambio incompatibile: anche in `auto` alza il secondo
numero e riporta il terzo a 0 (`26.3.1` → `26.4.0`). Basta un solo commit con `!` nel periodo perché
la release sia `major`; non serve scegliere `bump` = `major` a mano.

Non contano i merge commit (`Merge pull request …`, `Merge branch …`) e i
`chore(release): …`. I subject che non sono in Conventional Commits vengono ignorati,
ma il riepilogo del run li elenca. Il controllo "Titolo PR" verifica il titolo di ogni PR
verso `main`, perché è quello che il calcolo leggerà.

Il merge in `main` non rilascia nulla. La release è una decisione separata e si lancia a mano.

## Lanciare una release

Da GitHub: **Actions → Release manuale → Run workflow**, con branch `main` e `bump` su
`auto` (default), `minor` o `major`. `minor` incrementa l'ultimo numero; `major` incrementa il
secondo e riporta il terzo a 0 (cambi incompatibili). `auto` sceglie tra i due in base ai commit:
incrementa il secondo se c'è un commit con `!`, altrimenti l'ultimo. Il workflow rifiuta
qualunque altro branch.

Da terminale:

```bash
gh workflow run release-manual.yml --ref main -f bump=auto
gh run list --workflow release-manual.yml --limit 1
gh run watch <id>
```

Con `bump` = `auto` e solo commit `docs`/`ci`/`chore`/`test` il run termina con
"Niente da rilasciare", senza errore. Per forzare una release, `bump` = `minor` o `major`.

Il riepilogo del run mostra la versione calcolata e i commit che contano per la release. In una
sezione a parte elenca i subject non in Conventional Commits, che la release ignora. Merge commit
e `chore(release)` non compaiono.

## Checklist

Prima di lanciare:

1. `main` locale allineato (`git fetch origin`, poi `git pull` su `main`), con `pnpm typecheck`,
   `pnpm test` e `pnpm build` verdi in locale su `main` aggiornato.
2. Ogni PR unita ha un titolo Conventional Commits con il tipo giusto, e il check "Titolo PR" era verde.

Durante il lancio:

3. Controlla nel riepilogo che versione e commit inclusi siano quelli attesi.
4. Attendi i job `verify`, `build` (Linux e Windows), `docker` e `release`.

Dopo la release:

5. Controlla la Release: devono esserci `*.AppImage`, `*.AppImage.zsync`, `*.exe`,
   `*.exe.blockmap` e `latest*.yml`. In `latest-linux.yml` deve comparire l'AppImage nuova.
6. `git pull` su `main` in locale: il commit di release è del bot.

## Cosa fa il workflow

Il workflow [`release-manual.yml`](../.github/workflows/release-manual.yml) ha due job,
e il secondo richiama [`release.yml`](../.github/workflows/release.yml).

1. **`tag`**: calcola tipo e versione (`scripts/release-version.mjs commits` e `next`).
   Poi scrive le versioni nei manifest, crea il commit `chore(release): vX.Y.Z` su `main`
   (il corpo elenca i commit inclusi), crea il tag annotato e pusha commit e tag insieme.
   Il push è atomico: se `main` è avanzato nel frattempo, il push è rifiutato e non parte
   nessuna release.
2. **`release`** (`release.yml`, richiamato con il tag):
   - `verify`: il tag deve puntare a un commit già unito in `main`, e tutti i manifest devono
     avere la versione del tag (`scripts/check-release-version.mjs`). Poi `pnpm typecheck` e `pnpm test`.
   - `build`: AppImage Linux con update information e `.zsync` (`apps/desktop/scripts/appimage-zsync.sh`),
     installer Windows NSIS. Nessuna firma del codice.
   - `release`: crea la GitHub Release con titolo `WeBeep Desktop vX.Y.Z`, note generate
     dai commit e gli artefatti.
   - `docker`: dopo `verify`, in parallelo a `build`. Costruisce l'immagine di `apps/server/Dockerfile`
     (solo `linux/amd64`) e la pubblica su GHCR come
     `ghcr.io/gioelerosana/webeep-server:<versione>` e `ghcr.io/gioelerosana/webeep-server:latest`.
     Parte solo con un tag (richiamo da `release-manual` o push di un tag `v*`), non con un lancio
     manuale su un branch. Il pacchetto è privato e il workflow non ne cambia la visibilità: chi lo
     usa fa `docker login ghcr.io` (vedi [deploy/README.md](../deploy/README.md)).

Il `release.yml` è richiamato direttamente e non parte dal push del tag. Il motivo: un push
fatto con il `GITHUB_TOKEN` non fa partire altri workflow. Le release sono serializzate:
un solo `release-manual` alla volta.

## Release di emergenza (tag da admin)

Serve solo quando il workflow manuale non può essere usato. Il tag lo crea un admin, sul
commit di `main`:

```bash
git switch main && git pull
node scripts/release-version.mjs next --bump minor   # stampa la versione, es. 26.3.1
node scripts/release-version.mjs set 26.3.1
git commit -am "chore(release): v26.3.1"
git tag -a v26.3.1 -m "v26.3.1"
git push origin HEAD v26.3.1                         # il push del tag avvia release.yml
```

Un push fatto da una persona avvia `release.yml` da solo. Il job `verify` controlla che il tag
punti a un commit già unito in `main`: un tag su un altro commit si ferma prima della build.

Se la build fallisce dopo che il tag è stato creato, il tag resta: non si cancella e non si sposta.
Se il problema è passeggero (rete, runner), si possono rilanciare i job falliti dalla pagina del
run: il tag c'è già e il workflow lo usa così com'è. Se invece serve correggere il codice, il
fix va su `main` con una PR e si rilancia la release: esce la versione successiva.

## Prerequisiti sul repository

I tag `v*` sono protetti da due ruleset:

- **creazione solo admin**: solo gli admin creano un tag `v*`;
- **tag di rilascio: immutabili**: un tag non si sposta né si cancella, nemmeno dall'admin.

**Serve una modifica a Settings → Rules.** Nel ruleset «creazione solo admin» aggiungi
alla bypass list l'app **GitHub Actions**. Senza, il workflow non riesce a creare il tag,
perché il `GITHUB_TOKEN` non è un admin. Se `main` ha una regola che vieta i push diretti,
serve la stessa bypass per GitHub Actions anche su quella regola, perché il workflow pusha
il commit di release su `main`.

Per correggere un tag sbagliato bisogna disattivare temporaneamente il ruleset
«tag di rilascio: immutabili», correggere, e riattivarlo subito dopo.

## Permessi e azioni fissate

- Il workflow ha `contents: read` a livello generale. `contents: write` solo dove serve:
  il job `tag` (push del commit e del tag) e il job `release` (creazione della Release).
- Ogni `uses:` di terze parti punta a un commit completo di 40 caratteri, con la versione in
  commento (`# v4.4.0`). Un tag come `v4` può essere spostato da chi mantiene l'azione, un
  commit no. Per aggiornare un'azione si risolve il nuovo tag, si sostituisce l'hash e si
  aggiorna il commento con la stessa versione.
- Le azioni nuove usano gli stessi hash già presenti in `release.yml`
  (checkout, setup-node, pnpm). I passi comuni di pnpm sono nell'azione locale
  [`.github/actions/setup`](../.github/actions/setup/action.yml).

## Titolo delle PR

[`pr-title.yml`](../.github/workflows/pr-title.yml) controlla il titolo di ogni PR verso `main`
con `scripts/release-version.mjs check-title`. Il titolo deve avere la forma `tipo(ambito): descrizione`,
con un tipo ammesso (quelli della tabella sopra). Il check non rilascia nulla: mostra solo
quanto pesa il titolo in una release.

## Prove in locale

```bash
node --test scripts/*.test.mjs                 # o: pnpm test:release
node scripts/release-version.mjs commits       # commit dall'ultimo tag, con il tipo calcolato
node scripts/release-version.mjs next          # versione successiva, con il tipo dai commit
node scripts/check-release-version.mjs v26.1.0 # tag contro i manifest
```

`set` scrive i manifest del repository in cui gira. Per provarlo senza toccare il lavoro in corso,
lancia lo script su una copia temporanea del repository.
