# syntax=docker/dockerfile:1.6
#
# Multi-stage Docker build for the `quikinfra` Next.js app
# Pattern:
#   turbo prune --docker
#   → install deps (ignore scripts)
#   → prisma generate (explicit)
#   → turbo build
#   → minimal runtime image
#
# Build from repo root:
# docker build -f apps/quikinfra/Dockerfile -t quikinfra:latest .

FROM node:20-alpine AS base

# ─────────────────────────────────────────────────────────────
# Stage 1 — builder: prune monorepo to quikinfra + deps
# ─────────────────────────────────────────────────────────────
FROM base AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app

RUN npm install -g turbo
COPY . .
RUN turbo prune quikinfra --docker

# ─────────────────────────────────────────────────────────────
# Stage 2 — installer: install deps, prisma generate, build
# ─────────────────────────────────────────────────────────────
FROM base AS installer
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# Install pruned dependencies (skip postinstall!)
COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/package-lock.json ./package-lock.json
RUN npm install --ignore-scripts

# Copy full pruned source
COPY --from=builder /app/out/full/ .
COPY turbo.json turbo.json
COPY tsconfig.base.json tsconfig.base.json

# ── Build-time placeholders (NOT real secrets)
# Required for Prisma + Next.js build only
ARG DATABASE_URL="postgresql://x:x@localhost:5432/x"
ARG DATABASE_URL_DIRECT="postgresql://x:x@localhost:5432/x"

ENV DATABASE_URL=$DATABASE_URL
ENV DATABASE_URL_DIRECT=$DATABASE_URL_DIRECT
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Explicit Prisma client generation (multiSchema-safe)
RUN npx prisma generate --schema=packages/database/prisma/schema.prisma

# Ensure Next.js expected dirs exist
RUN mkdir -p apps/quikinfra/public
RUN mkdir -p apps/quikinfra/.next/static

# Build only quikinfra
RUN npx turbo build --filter=quikinfra

# ─────────────────────────────────────────────────────────────
# Stage 3 — runner: minimal production image
# ─────────────────────────────────────────────────────────────
FROM base AS runner
RUN apk add --no-cache openssl
WORKDIR /app

# Non-root user
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3007
ENV HOSTNAME="0.0.0.0"

# Standalone Next.js output
COPY --from=installer --chown=nextjs:nodejs /app/apps/quikinfra/.next/standalone ./
COPY --from=installer --chown=nextjs:nodejs /app/apps/quikinfra/.next/static ./apps/quikinfra/.next/static
COPY --from=installer --chown=nextjs:nodejs /app/apps/quikinfra/public ./apps/quikinfra/public

# Prisma engines (standalone does not always trace these)
COPY --from=installer --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=installer --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma

USER nextjs
EXPOSE 3007
CMD ["node", "apps/quikinfra/server.js"]
