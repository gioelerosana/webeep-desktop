# Immagine di @webeep/server (docs/SERVER.md §8).
# Il contesto di build è la radice del monorepo:
#   docker build -f apps/server/Dockerfile .

ARG NODE_IMAGE=node:22-slim

# ---- Stadio di build: installa le dipendenze del server e produce dist/server.mjs ----
FROM ${NODE_IMAGE} AS build
WORKDIR /repo

# corepack legge il campo `packageManager` di package.json e usa la stessa versione di pnpm.
RUN corepack enable
# Electron è una devDependency del desktop: il server non lo usa, quindi non lo si scarica.
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1 \
    CI=true \
    npm_config_store_dir=/pnpm/store

# Prima i soli manifest: il layer delle dipendenze resta in cache finché non cambiano.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/moodle-api/package.json packages/moodle-api/
COPY packages/ui-kit/package.json packages/ui-kit/
COPY apps/desktop/package.json apps/desktop/
COPY apps/server/package.json apps/server/

RUN --mount=type=cache,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @webeep/server...

COPY packages/moodle-api packages/moodle-api
COPY apps/server apps/server
RUN pnpm --filter @webeep/server build

# ---- Stadio finale: solo il bundle, senza node_modules né sorgenti ----
FROM ${NODE_IMAGE} AS runtime

ENV NODE_ENV=production \
    PORT=8787 \
    WEBEEP_DATA_DIR=/data

WORKDIR /app
COPY --from=build /repo/apps/server/dist/server.mjs /app/server.mjs

# /data è scritta dall'utente `node` (uid 1000); il volume nominato eredita questi permessi.
RUN mkdir -p /data && chown node:node /data && chmod 0700 /data

USER node
VOLUME ["/data"]
EXPOSE 8787

# Nessun curl nello stadio finale: il controllo usa Node (fetch globale, Node 22).
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/healthz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

CMD ["node", "/app/server.mjs"]
