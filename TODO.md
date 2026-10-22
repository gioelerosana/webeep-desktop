# TODO

Backlog di WeBeep Desktop. L'ordine è la priorità. Vedi AGENTS.md §"`TODO.md`".

## Prototipo

- [x] Schermata di login ("Accedi con il Polimi") (views/login; login annullato non mostrato come errore)
- [x] Shell dell'app: sidebar con i corsi in corso, navigazione, utente e logout (layout/; ricerca corsi, badge notifiche non lette)
- [x] Home: prossime scadenze e notifiche recenti (views/home; scadenze per giorno con urgenza)
- [x] Pagina corso: sezioni, moduli, file con apri e scarica (views/course; filtro materiali, stato per file)
- [x] Notifiche: elenco, segna come letta, apri su WeBeep (views/notifications; filtro non lette)
- [x] Impostazioni: cartella download, tema, account (views/settings)
- [x] Test di `packages/moodle-api` (parametri, client, parsing del token) (48 test; trovato e corretto il caso di risposta non JSON)
- [ ] Primo login reale su WeBeep verificato nell'app Electron (parziale: flusso implementato, da provare con un account vero)

## Dopo il prototipo

- [ ] Sincronizzazione dei file dei corsi in una cartella locale
- [ ] Badge "novità" per corso (`core_course_get_updates_since`)
- [ ] Forum e avvisi
- [ ] Stato delle consegne e voti
- [ ] Notifiche di sistema e icona nella tray
- [ ] Ricerca globale (corsi, file) con scorciatoia da tastiera
- [ ] Pacchetti per Linux (AppImage, Arch) e Windows con electron-builder
