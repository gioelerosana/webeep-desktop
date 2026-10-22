# WeBeep Desktop

Client desktop per [WeBeep](https://webeep.polimi.it), il Moodle del
Politecnico di Milano: corsi, materiali, scadenze e notifiche in un'app nativa.

Si accede con il login Polimi, come nell'app ufficiale Moodle. Il token resta
sul tuo computer, cifrato con il portachiavi di sistema. Nessun server
intermedio, nessuna telemetria.

> Stato: prototipo in sviluppo.

## Sviluppo

```bash
pnpm install
pnpm dev        # app Electron
pnpm dev:web    # solo interfaccia nel browser, con dati finti
```

Guida per contributor e agenti: [AGENTS.md](AGENTS.md). Architettura:
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

Progetto non ufficiale, non affiliato al Politecnico di Milano.
