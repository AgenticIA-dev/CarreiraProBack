# syntax=docker/dockerfile:1
#
# CarreiraPro — backend (API Hono).
#
#   docker build -t carreirapro-backend .
#   docker run --env-file .env -p 3001:3001 carreirapro-backend
#
# As variáveis de ambiente (DATABASE_URL, JWT_SECRET, SMTP_*, MERCADOPAGO_*...)
# são passadas em tempo de execução — nunca entram na imagem.
#
# Scripts de banco, com o container já configurado:
#   docker run --rm --env-file .env carreirapro-backend node dist/migrate.js
#   docker run --rm --env-file .env carreirapro-backend node dist/seed.js
#   docker run --rm --env-file .env carreirapro-backend node dist/create-user.js --email admin@exemplo.com --password "senha-forte" --admin

ARG NODE_VERSION=22

# --- Dependências de produção --------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# --- Build ----------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsup.config.ts ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build

# --- Runtime --------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3001

COPY --chown=node:node package.json ./
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist

USER node
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" > /dev/null || exit 1

CMD ["node", "--enable-source-maps", "dist/server.js"]
