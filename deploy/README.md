# Deploy di webeep-server

Questa cartella porta `@webeep/server` (vedi `docs/SERVER.md`) su un server tuo, dietro un
reverse proxy HTTPS. Il proxy è Caddy (certificato automatico) oppure Cloudflare Tunnel
(vedi la sezione [Cloudflare](#cloudflare)).

## Prerequisiti

- Un server Linux con **Docker Engine** e il plugin **Docker Compose v2** (`docker compose version`).
- **Un dominio** (es. `webeep.example.it`) con un record DNS che punta al server.
- Con Caddy: porte **80** e **443** raggiungibili da internet (servono per il certificato).
  Con Cloudflare Tunnel non serve aprire nessuna porta.
- `openssl` per generare i segreti.

## 1. Preparare la configurazione

```sh
cd deploy
cp .env.example .env
chmod 600 .env
```

Genera i tre segreti e incollali in `.env`:

```sh
openssl rand -base64 32   # WEBEEP_SECRET_KEY (chiave dello stato, 44 caratteri)
openssl rand -base64 18   # WEBEEP_ADMIN_PASSWORD (la password di /authorize, almeno 12 caratteri)
openssl rand -hex 32      # WEBEEP_PAIRING_KEY (chiave dell'app desktop, almeno 32 caratteri)
```

Poi compila il dominio, in due forme coerenti:

```ini
WEBEEP_DOMAIN=webeep.example.it
WEBEEP_PUBLIC_URL=https://webeep.example.it
```

`WEBEEP_PUBLIC_URL` non deve avere slash finale. Il connettore Claude sarà `WEBEEP_PUBLIC_URL/mcp`.

**Conserva `WEBEEP_SECRET_KEY` anche fuori dal server** (per esempio in un password manager):
senza di lei lo stato cifrato non si legge più, e nemmeno un backup serve a qualcosa.

## 2. Avvio

```sh
docker compose up -d --build
docker compose logs -f webeep-server   # Ctrl+C per uscire; deve comparire "in ascolto"
```

Al primo avvio Caddy ottiene il certificato per `WEBEEP_DOMAIN`: serve che il DNS sia già
puntato al server e che le porte 80/443 siano aperte.

## 3. Verifica

```sh
curl -fsS https://webeep.example.it/healthz    # deve rispondere: ok
docker compose ps                              # webeep-server: healthy
```

Se `/healthz` non risponde, controlla i log di `caddy` (certificato) e di `webeep-server`
(configurazione: il messaggio nomina la variabile sbagliata, mai il suo valore).

## 4. Accoppiamento dall'app desktop

1. Nell'app WeBeep Desktop accedi al tuo account WeBeep (il token resta nel desktop).
2. Vai in **Impostazioni → Server privato**.
3. Inserisci l'URL `https://webeep.example.it` e la chiave di accoppiamento (`WEBEEP_PAIRING_KEY`).
4. Premi **collega al server**.

Il server riceve il token WeBeep solo da questo passaggio, e lo tiene cifrato in `state.bin`.

## 5. Collegamento a Claude

1. In Claude vai in **Impostazioni → Connettori → aggiungi connettore personalizzato**.
2. URL: `https://webeep.example.it/mcp`.
3. Claude apre la pagina di autorizzazione del server: inserisci `WEBEEP_ADMIN_PASSWORD`.

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

- **`WEBEEP_ADMIN_PASSWORD`**: cambia il valore in `.env`, poi `docker compose up -d webeep-server`.
  Le sessioni già collegate restano valide fino alla scadenza dei token.
- **`WEBEEP_PAIRING_KEY`**: cambia il valore in `.env`, riavvia `webeep-server`, poi ricollega
  dall'app desktop con la nuova chiave.
- **Revocare tutti i collegamenti Claude**: dall'app desktop, in Impostazioni → Server privato,
  scollega il server (`DELETE /pair`). Revoca tutti i refresh token; poi ricollega se serve.
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
