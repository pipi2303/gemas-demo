# ── Stage 1: Build frontend ──────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Stage 2: Production image ─────────────────────────────────────
FROM node:22-alpine

WORKDIR /app

# Non-root user untuk keamanan
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    mkdir -p /app/backups && \
    chown -R nodejs:nodejs /app

COPY package*.json ./
RUN npm ci --omit=dev && npm install tsx pg

COPY --from=builder /app/dist ./dist
COPY server ./server
COPY scripts ./scripts

RUN chown -R nodejs:nodejs /app
USER nodejs

ENV NODE_ENV=production

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node_modules/.bin/tsx", "server/index.ts"]
