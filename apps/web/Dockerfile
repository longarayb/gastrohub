# syntax=docker/dockerfile:1
# Imagem de produção do frontend (arquivos estáticos + proxy para a API).
# Contexto de build: raiz do repositório.
#   docker compose --profile app build web

ARG NODE_IMAGE=node:24.21.0-alpine3.24
ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:1.30.5-alpine

FROM ${NODE_IMAGE} AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
RUN pnpm install --frozen-lockfile --filter "@gastrohub/web..."

COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY apps/web apps/web
RUN pnpm --filter @gastrohub/contracts build \
 && pnpm --filter @gastrohub/web build

# nginx sem root (uid 101), escutando na porta 8080.
FROM ${NGINX_IMAGE} AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
