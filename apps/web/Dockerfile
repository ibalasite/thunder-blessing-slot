# Thunder Blessing Slot — Fastify API Server
# S-18: non-root user

FROM node:22-alpine AS builder
WORKDIR /app

RUN npm install -g pnpm

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/

# Install ALL deps (dev + prod) for TypeScript build
RUN pnpm install --filter @thunder/web --frozen-lockfile

COPY apps/web/src ./apps/web/src
COPY apps/web/tsconfig.json ./apps/web/

WORKDIR /app/apps/web
RUN pnpm build

# Copy pre-compiled game engine JS to the absolute path resolved by the dynamic require:
# dist/shared/engine/slotEngine.js → require('../../../../../assets/scripts/SlotEngine')
# resolves to /assets/scripts/SlotEngine (5 levels up from /app/dist/shared/engine/)
# Pre-compiled via: npx tsc assets/scripts/SlotEngine.ts --outDir assets/scripts/dist/
WORKDIR /app
COPY assets/scripts/dist/SlotEngine.js assets/scripts/dist/GameConfig.js /assets/scripts/

# Re-install PROD ONLY, hoisted flat into /app/node_modules (no symlinks)
WORKDIR /app
RUN CI=true pnpm install --filter @thunder/web --prod --frozen-lockfile --shamefully-hoist

# ───────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

# S-18: Run as non-root
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 fastify

ENV NODE_ENV=production
ENV PORT=3001

# Flat node_modules from builder (no pnpm symlink issues)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/web/dist ./dist
# Game engine pre-compiled JS at the absolute path used by the dynamic require in slotEngine.js:
# require('../../../../../assets/scripts/SlotEngine') from /app/dist/shared/engine/ → /assets/scripts/
COPY --from=builder /assets/scripts/ /assets/scripts/

USER fastify

EXPOSE 3001

CMD ["node", "dist/infrastructure/fastify/server.js"]
