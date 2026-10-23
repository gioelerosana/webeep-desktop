# Aggiornamenti

Come si aggiorna WeBeep Desktop su Windows e Linux, e come si pubblica una release.
Gli aggiornamenti arrivano dalle GitHub Release di `gioelerosana/webeep-desktop`.

## Quando si controlla

- Il primo controllo parte 10 secondi dopo l'avvio, poi ogni 4 ore
  (`FIRST_CHECK_DELAY_SECONDS` e `HOURS_BETWEEN_CHECKS` in `apps/desktop/src/main/updater.ts`).
  In sviluppo, o fuori da Windows e dall'AppImage, non c'è nessun controllo.
- Un controllo richiesto a mano è ignorato mentre è in corso, mentre scarica o quando la
  versione è pronta. Da "disponibile" si ricontrolla solo su Linux: lì è un avviso, e una
  release ancora più nuova può essere uscita nel frattempo. Su Windows "disponibile"
  aspetta il clic su "Scarica aggiornamento": non si ricontrolla, così non si perde la
  versione trovata.

## Windows (dentro l'app)

Né il download né l'installazione partono da soli: `autoDownload` e
`autoInstallOnAppQuit` sono `false` su tutte le piattaforme aggiornabili. Senza il clic
dell'utente l'app non si aggiorna, nemmeno alla chiusura.

1. Il controllo periodico legge `latest.yml` dalla Release. Se c'è una versione nuova,
   stato "disponibile": la sidebar e le Impostazioni mostrano "Scarica aggiornamento".
2. Il clic chiama `updates:download` e avvia il download. Le Impostazioni mostrano
   "download della versione X in corso" con l'avanzamento in percentuale.
3. A download completo lo stato è "pronto". "Riavvia e aggiorna" chiama `updates:install`,
   chiude l'app e installa la versione scaricata.

- Per i download differenziali serve `WeBeep-Desktop-Setup-<versione>-x64.exe.blockmap`,
  che electron-builder genera accanto all'installer.
- Senza firma del codice, Windows mostra SmartScreen ("Windows ha protetto il PC") alla
  prima esecuzione: "Ulteriori informazioni", poi "Esegui comunque". Non c'è verifica
  dell'editore: ci si fida di HTTPS e della Release GitHub.

## Linux (AppImage)

L'AppImage non si può sostituire dall'app mentre è in esecuzione, quindi sono due parti:

- **Avviso in app.** L'app legge `latest-linux.yml` dalla Release e, se esiste una
  versione più nuova, mostra un avviso con il link alla pagina della release. Non scarica
  nulla.
- **Aggiornamento vero, via zsync.** L'AppImage porta con sé le sue update information:

  ```
  gh-releases-zsync|gioelerosana|webeep-desktop|latest|WeBeep-Desktop-*-x86_64.AppImage.zsync
  ```

  Un manager zsync (AppImageUpdate, Gear Lever, AppImageLauncher) legge questa stringa,
  scarica il `.zsync` pubblicato accanto all'AppImage dell'ultima release e recupera solo
  i blocchi cambiati. L'AppImage in esecuzione viene sostituita dal manager.

Le update information e il `.zsync` non li produce electron-builder 26: li aggiunge lo
script `apps/desktop/scripts/appimage-zsync.sh`, che il workflow lancia dopo la build
Linux. Lo script estrae l'AppImage, la reimpacchetta con appimagetool (versione e
checksum fissati nel workflow), genera il `.zsync` e riscrive `latest-linux.yml` con
sha512 e size del nuovo file.

Il glob della stringa va tenuto allineato al nome dell'AppImage in
`apps/desktop/electron-builder.yml` (`artifactName`). Se cambia il nome, cambiano
anche la stringa nello script e lo stesso glob.

## Pubblicare una release

1. Alza `version` in `apps/desktop/package.json` (per esempio `0.2.0`). È il numero che
   electron-builder mette nei nomi dei file e in `latest*.yml`, ed è quello che il workflow
   verifica. Alza anche `version` nel `package.json` della radice, così restano uguali.
2. Porta la modifica su `main` con il flusso del repo.
3. Crea il tag con lo stesso numero, `vX.Y.Z`, sul commit di `main`, e fai il push del tag:
   `git tag vX.Y.Z && git push origin vX.Y.Z`. Il push del tag avvia
   `.github/workflows/release.yml`.
4. Il job `version-check` confronta il tag con `apps/desktop/package.json`. Se non
   coincidono, il workflow si ferma prima della build: nessun artefatto, nessuna Release.
   Lo stesso job verifica che il commit del tag sia contenuto in `main`: un tag su un
   commit che non è in `main` si ferma con l'errore «il tag deve puntare a un commit già
   unito in main».
5. Il workflow builda l'AppImage (con update information e `.zsync`) e l'installer
   Windows, poi crea la Release con: `*.AppImage`, `*.AppImage.zsync`, `*.exe`,
   `*.exe.blockmap`, `latest*.yml`.
6. Controlla la Release: devono esserci tutti e cinque i tipi di file, e `latest-linux.yml`
   deve indicare l'AppImage nuova.

Il dispatch manuale del workflow costruisce solo gli artefatti, senza creare la Release.
Su dispatch il controllo di versione è saltato.

**Permessi del workflow.** Il workflow ha `contents: read` a livello generale. Solo il job
`release`, che crea la Release, ha `contents: write`. Il build e il controllo di versione
girano con i permessi minimi.

**Azioni fissate a hash.** Ogni `uses:` di un'azione di terze parti punta a un commit
completo di 40 caratteri, con la versione in commento (`# v4.4.0`). Un tag come `v4` può
essere spostato da chi mantiene l'azione, un commit no. Per aggiornare un'azione si
risolve il nuovo tag, si sostituisce l'hash e si aggiorna il commento con la stessa versione.

**Protezione dei tag.** I tag `v*` sono protetti da una regola del repository: si possono
creare solo da un admin e non si possono né spostare né cancellare, così il tag che il
workflow costruisce resta quello pubblicato. La regola va creata dopo il merge su `main`
(impostazioni del repository, Rules, ruleset sul target tag `v*`): fino ad allora la
protezione non è attiva.

Non caricare file a mano: senza `.zsync` il manager zsync non trova l'aggiornamento, e
senza `latest*.yml` l'app non vede la versione nuova.

## Provare lo script in locale

`pnpm dist:linux` non genera il `.zsync`. Per provare il repack serve appimagetool
(https://github.com/AppImage/appimagetool/releases, versione 1.9.1 nel workflow):

```bash
pnpm --filter @webeep/desktop dist:linux
APPIMAGETOOL=/percorso/appimagetool bash apps/desktop/scripts/appimage-zsync.sh apps/desktop/release
```

Lo script legge una sola AppImage nella cartella indicata. Dopo il repack, `latest-linux.yml`
non ha più `blockMapSize`: il blockmap incorporato da electron-builder non sopravvive al repack,
quindi gli aggiornamenti via zsync usano il `.zsync`, non un download differenziale dell'app.
