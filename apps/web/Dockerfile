# Thunder Blessing Slot — Next.js API Server
# EDD §9-K Dockerfile (S-18: non-root user)

FROM node:22-alpine AS deps
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/

# Install only production dependencies for web
RUN pnpm install --filter @thunder/web --prod --frozen-lockfile

# ───────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

RUN npm install -g pnpm

COPY package.json pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/

# Install all dependencies (including dev for build)
RUN pnpm install --filter @thunder/web --frozen-lockfile

# Copy source
COPY apps/web ./apps/web

# Build Next.js
WORKDIR /app/apps/web
RUN pnpm build

# ───────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

# S-18: Run as non-root
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

ENV NODE_ENV=production
ENV PORT=3001

# Copy built artifacts
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./.next/static
COPY --from=builder /app/apps/web/public ./public

USER nextjs

EXPOSE 3001

CMD ["node", "server.js"]
