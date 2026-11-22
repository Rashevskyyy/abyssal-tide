# syntax=docker/dockerfile:1
# Один Dockerfile для двох образів: ігровий сервер (target: server) і статична гра за nginx (target: web).

# ── залежності воркспейсів ──────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/board/package.json packages/board/
COPY packages/controls/package.json packages/controls/
COPY packages/paytable/package.json packages/paytable/
COPY packages/symbols-cyanotype/package.json packages/symbols-cyanotype/
COPY server/package.json server/
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci --no-audit --no-fund

# ── сервер: той самий рушій із src/engine за HTTP API ───────────────────
FROM node:22-alpine AS server
WORKDIR /app
ENV NODE_ENV=production PORT=8787
COPY --from=deps /app/node_modules node_modules
COPY package.json tsconfig.json ./
COPY src src
COPY server server
USER node
EXPOSE 8787
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD wget -qO- http://127.0.0.1:8787/health || exit 1
CMD ["node_modules/.bin/tsx", "server/src/main.ts"]

# ── збірка гри з адресою сервера ────────────────────────────────────────
FROM deps AS web-build
COPY . .
ARG VITE_SERVER_URL=http://localhost:8787
ENV VITE_SERVER_URL=$VITE_SERVER_URL
RUN npx vite build

FROM nginx:1.27-alpine AS web
COPY --from=web-build /app/dist /usr/share/nginx/html
EXPOSE 80
