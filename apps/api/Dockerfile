# syntax=docker/dockerfile:1
# Imagem de produção da API. Contexto de build: raiz do repositório.
#   docker compose --profile app build api

ARG NODE_IMAGE=node:24.21.0-alpine3.24

FROM ${NODE_IMAGE} AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

# Dependências primeiro (camada reaproveitada enquanto o lockfile não muda)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/contracts/package.json packages/contracts/
RUN pnpm install --frozen-lockfile --filter "@gastrohub/api..."

COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY apps/api apps/api
RUN pnpm --filter @gastrohub/contracts build \
 && pnpm --filter @gastrohub/api build \
 && pnpm --filter @gastrohub/api deploy --prod /out

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    API_HOST=0.0.0.0 \
    API_PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /out/package.json ./package.json
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/apps/api/dist ./dist

# Sem privilégios de root em runtime.
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/health/live || exit 1
CMD ["node", "dist/main.js"]
