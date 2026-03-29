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

# Copy game engine files (required by slotEngine.ts via dynamic require at runtime)
COPY assets/scripts/SlotEngine.ts assets/scripts/GameConfig.ts ./assets/scripts/
COPY assets/scripts/contracts/ ./assets/scripts/contracts/

WORKDIR /app/apps/web
RUN pnpm build

# Compile game engine separately (no Cocos deps, plain TypeScript)
WORKDIR /app
RUN npx --yes tsc assets/scripts/SlotEngine.ts assets/scripts/GameConfig.ts \
    --target ES2022 --module commonjs --moduleResolution node \
    --outDir /compiled-engine/ --skipLibCheck 2>&1 || true
# Copy to the absolute path the compiled slotEngine.js resolves at runtime:
# dist/shared/engine/slotEngine.js → require('../../../../../assets/scripts/SlotEngine')
# resolves to /assets/scripts/SlotEngine (5 levels up from /app/dist/shared/engine/)
# Note: tsc strips the common input prefix (assets/scripts/) → output is /compiled-engine/*.js directly
RUN mkdir -p /assets/scripts && cp /compiled-engine/*.js /assets/scripts/ 2>/dev/null || true

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
# Game engine compiled to the absolute path used by the dynamic require in slotEngine.js:
# require('../../../../../assets/scripts/SlotEngine') from /app/dist/shared/engine/ → /assets/scripts/
COPY --from=builder /assets/scripts/ /assets/scripts/

USER fastify

EXPOSE 3001

CMD ["node", "dist/infrastructure/fastify/server.js"]
