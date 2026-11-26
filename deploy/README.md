# Deploy di webeep-server

Questa cartella porta `@webeep/server` (vedi `docs/SERVER.md`) su un server tuo, dietro un
reverse proxy HTTPS. Il proxy è Caddy (certificato automatico) oppure Cloudflare Tunnel
(vedi la sezione [Cloudflare](#cloudflare)).

## Prerequisiti

- Un server Linux con **Docker Engine** e il plugin **Docker Compose v2** (`docker compose version`).
- **Un dominio** (es. `webeep.example.it`) con un record DNS che punta al server.
- Con Caddy: porte **80** e **443** raggiungibili da internet (servono per il certificato).
  Con Cloudflare Tunnel non serve aprire nessuna porta.
- `openssl` per generare la chiave dello stato.
- Un'istanza **Authentik** raggiungibile in **HTTPS** dal container del server, con un utente
  nel gruppo `webeep` (vedi la sezione [Authentik](#authentik)).

## 1. Preparare la configurazione

```sh
cd deploy
cp .env.example .env
chmod 600 .env
```

Genera la chiave dello stato e incollala in `.env`:

```sh
openssl rand -base64 32   # WEBEEP_SECRET_KEY (chiave dello stato, 44 caratteri)
```

Poi compila il dominio, in due forme coerenti:

```ini
WEBEEP_DOMAIN=webeep.example.it
WEBEEP_PUBLIC_URL=https://webeep.example.it
```

`WEBEEP_PUBLIC_URL` non deve avere slash finale. Il connettore Claude sarà `WEBEEP_PUBLIC_URL/mcp`,
il redirect URI verso Authentik `WEBEEP_PUBLIC_URL/oidc/callback`.

Compila anche le variabili di login (`WEBEEP_OIDC_ISSUER`, `WEBEEP_OIDC_CLIENT_ID`,
`WEBEEP_OIDC_CLIENT_SECRET`, `WEBEEP_OIDC_ALLOWED_GROUP`): i valori arrivano da Authentik, vedi
la sezione [Authentik](#authentik) qui sotto.

**Conserva `WEBEEP_SECRET_KEY` anche fuori dal server** (per esempio in un password manager):
senza di lei lo stato cifrato non si legge più, e nemmeno un backup serve a qualcosa.

## Authentik

Il login del server passa da Authentik (OIDC). Chi accede deve essere membro del gruppo
`webeep`. Si configura una sola volta, in Authentik:

1. **Gruppo**: crea il gruppo `webeep` e aggiungici il tuo utente. Chi non è nel gruppo
   non entra, anche se ha un account Authentik.
2. **Provider OAuth2/OpenID**: crea un provider di tipo **OAuth2/OpenID Provider** con
   client type **Confidential** (ha un client secret). Imposta:
   - **Redirect URI** (strict): esattamente `https://<dominio>/oidc/callback`, per esempio
     `https://webeep.example.it/oidc/callback`. Un valore diverso fa fallire il login.
   - **Scope**: `openid`, `profile`, `email` e `groups`, così il token porta i gruppi
     dell'utente.
   - Annota **Client ID** e **Client secret**.
3. **Applicazione**: crea un'applicazione con **slug `webeep`** e collegale il provider del
   punto 2. L'issuer è quello dell'applicazione, per esempio
   `https://auth.example.com/application/o/webeep/`: va in `WEBEEP_OIDC_ISSUER`.

In `.env`:

| Variabile | Valore | Note |
|---|---|---|
| `WEBEEP_OIDC_ISSUER` | issuer dell'applicazione `webeep` | URL `https`, senza query. Lo slash finale è facoltativo. |
| `WEBEEP_OIDC_CLIENT_ID` | Client ID del provider | |
| `WEBEEP_OIDC_CLIENT_SECRET` | Client secret del provider | Segreto: mai in log, pagine o backup in chiaro. |
| `WEBEEP_OIDC_ALLOWED_GROUP` | `webeep` (default) | Gruppo Authentik richiesto per accedere. |

Il container deve raggiungere Authentik **in HTTPS**: il server legge la configurazione OIDC
dall'issuer al primo login. Se Authentik non risponde, il login mostra un errore e il server
resta avviato: l'avvio non contatta Authentik.

## 2. Avvio

```sh
docker compose up -d --build           # build locale; con l'immagine GHCR vedi sotto
docker compose logs -f webeep-server   # Ctrl+C per uscire; deve comparire "in ascolto"
```

**Immagine GHCR (alternativa al build).** Ogni release pubblica l'immagine privata
`ghcr.io/gioelerosana/webeep-server` con il tag di versione e `latest`. Per usarla:

```sh
echo "<token GitHub con read:packages>" | docker login ghcr.io -u <utente GitHub> --password-stdin
```

In `.env` imposta `WEBEEP_VERSION=26.3.1` (o la versione voluta; vuoto = `latest`), poi in
`docker-compose.yml` usa la riga `image: ghcr.io/...` al posto del blocco `build` (è commentata lì).
Poi `docker compose up -d` senza `--build`. Il tag di versione è preferibile a `latest`:
l'aggiornamento diventa una scelta esplicita.

Al primo avvio Caddy ottiene il certificato per `WEBEEP_DOMAIN`: serve che il DNS sia già
puntato al server e che le porte 80/443 siano aperte.

## 3. Verifica

```sh
curl -fsS https://webeep.example.it/healthz    # deve rispondere: ok
docker compose ps                              # webeep-server: healthy
```

Se `/healthz` non risponde, controlla i log di `caddy` (certificato) e di `webeep-server`
(configurazione: il messaggio nomina la variabile sbagliata, mai il suo valore).

## 4. Collegamento dell'app desktop

1. Nell'app WeBeep Desktop vai in **Impostazioni → Server privato**.
2. Inserisci l'URL `https://webeep.example.it`.
3. Premi **collega al server**: si apre il browser sul login Authentik. Accedi con l'utente del
   gruppo `webeep`.

Il server riceve il token WeBeep solo da questo passaggio, e lo tiene cifrato in `state.bin`.
Non serve nessuna chiave da copiare nell'app.

## 5. Collegamento a Claude

1. In Claude vai in **Impostazioni → Connettori → aggiungi connettore personalizzato**.
2. URL: `https://webeep.example.it/mcp`.
3. Claude apre il login Authentik: accedi con l'utente del gruppo `webeep`.
4. Compare la pagina di consenso del server: controlla il client che chiede l'accesso e conferma.

Il connettore espone solo lettura (corsi, materiali, scadenze, notifiche): il server non
scrive mai su WeBeep.

## Backup

Il dato da salvare è il volume `webeep-data` (contiene `state.bin`). Il nome completo è
`<cartella>_webeep-data`; con la cartella `deploy` è `deploy_webeep-data`.

```sh
docker run --rm \
  -v deploy_webeep-data:/data:ro \
  -v "$PWD":/backup \
  alpine tar czf /backup/webeep-data-$(date +%F).tgz -C /data .
```

- Il backup è inutile senza `WEBEEP_SECRET_KEY`: **non** metterla nello stesso posto del
  backup. Conserva le due cose separatamente.
- `state.bin` viene riscritto in modo atomico (file temporaneo, poi rinomina): il backup a
  server acceso è coerente. Il volume `caddy-data` contiene i certificati: si possono
  riottenere, quindi il backup è facoltativo.

## Rotazione dei segreti

- **`WEBEEP_OIDC_CLIENT_SECRET`**: rigenera il client secret nel provider Authentik, cambia il
  valore in `.env`, poi `docker compose up -d webeep-server`.
- **Revocare tutti i collegamenti**: dall'app desktop, in Impostazioni → Server privato,
  scollega il server (`DELETE /pair`): revoca i refresh token e cancella la sessione WeBeep.
  Per togliere l'accesso a Claude senza toccare il desktop, rimuovi l'utente dal gruppo
  `webeep` in Authentik: al login successivo l'accesso è negato.
- **`WEBEEP_SECRET_KEY`**: nella v1 non c'è una rotazione a caldo. Con la chiave nuova
  `state.bin` non si decifra e il server si rifiuta di avviarsi (senza toccare il file).
  La rotazione quindi azzera il collegamento con WeBeep e con Claude, e si fa così:

  ```sh
  docker compose stop webeep-server
  # cambia WEBEEP_SECRET_KEY in .env, poi sposta lo stato vecchio di lato:
  docker compose run --rm --no-deps webeep-server mv /data/state.bin /data/state.bin.vecchio
  docker compose up -d webeep-server
  ```

  Poi ricollega l'app desktop (Impostazioni → Server privato) e riaggiungi il connettore in
  Claude. `state.bin.vecchio` è cifrato con la chiave vecchia: conservalo finché non sei sicuro
  che il nuovo stato funzioni, poi cancellalo con
  `docker compose exec webeep-server rm /data/state.bin.vecchio`.

## Aggiornamento

```sh
git pull                              # nella radice del repository
cd deploy
docker compose up -d --build          # ricostruisce l'immagine, riavvia solo ciò che cambia
# Con l'immagine GHCR: cambia WEBEEP_VERSION in .env, poi `docker compose pull && docker compose up -d`.
docker image prune                    # facoltativo: rimuove le immagini vecchie
```

I dati restano nei volumi, quindi l'aggiornamento non tocca `state.bin`.

## Cloudflare

**Stato.** Il nucleo di `@webeep/server` è scritto solo con API Web standard (`Request`,
`Response`, `crypto.subtle`), quindi può girare anche su altri runtime, per esempio
Cloudflare Workers. La v1, però, gira **solo con l'adattatore Node** (`node:http`) e lo
store su file (`state.bin`): non esiste ancora un adattatore Workers né uno store per il
suo storage. Per ora Cloudflare si usa come **proxy davanti al container**, non come runtime.

**Opzione immediata: Cloudflare Tunnel.** `cloudflared` apre una connessione in uscita dal
server verso Cloudflare, quindi non servono porte 80/443 aperte né Caddy. Il profilo
`tunnel` del compose lo prevede già.

1. Nella dashboard Cloudflare (Zero Trust → Networks → Tunnels) crea un tunnel e copia il
   token in `.env`, nella variabile `CLOUDFLARE_TUNNEL_TOKEN`.
2. Nel tunnel aggiungi un *Public hostname*: il tuo dominio, servizio `HTTP`,
   URL `webeep-server:8787` (il nome del servizio nel compose, risolto sulla rete Docker).
3. In `.env` imposta `WEBEEP_PUBLIC_URL=https://<il tuo dominio>` come sopra.
4. Avvia senza Caddy:

   ```sh
   docker compose up -d webeep-server tunnel
   ```

`docker-compose.yml` ha già `WEBEEP_TRUST_PROXY=true` sul server, come con Caddy. Con Cloudflare
l'IP del client arriva in `X-Forwarded-For` aggiunto dal proxy Cloudflare: prima di affidarti
ai rate limit per IP, verifica che sia l'IP che ti aspetti. Il server non legge
l'header `CF-Connecting-IP`, che è quello più esplicito per Cloudflare: è un'estensione da
valutare.

**Limite noto della v1.** Con Cloudflare Tunnel l'IP reale del client arriva da Cloudflare, e
l'ultimo `X-Forwarded-For` è quello del tunnel, non quello del client. Il rate limit per IP
(sezione 9 di `docs/SERVER.md`) è quindi meno preciso che con Caddy: più client possono
condividere lo stesso contatore. Il server non legge `CF-Connecting-IP`: correggere questo
punto è un lavoro successivo.
