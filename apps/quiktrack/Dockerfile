# syntax=docker/dockerfile:1.6
#
# Multi-stage Docker build for the `quiktrack` app.
# Build:  docker build -f apps/quiktrack/Dockerfile -t quiktrack:latest .
# Target: Google Cloud Run.

FROM node:22-slim AS deps
WORKDIR /repo
RUN apt-get update -y && apt-get install -y --no-install-recommends \
      openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json turbo.json ./
COPY apps/quikit/package.json apps/quikit/
COPY apps/auth/package.json apps/auth/
COPY apps/admin/package.json apps/admin/
COPY apps/quikscale/package.json apps/quikscale/
COPY apps/quiktrack/package.json apps/quiktrack/
COPY apps/quikvc/package.json apps/quikvc/
COPY apps/quiksocial/package.json apps/quiksocial/
COPY apps/quikconstruction/package.json apps/quikconstruction/
COPY apps/_template/package.json apps/_template/
COPY packages/auth/package.json packages/auth/
COPY packages/database/package.json packages/database/
COPY packages/redis/package.json packages/redis/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/

# packages/database has a postinstall that runs `prisma generate` — the
# schema must exist before `npm ci` triggers it. Copy the schema dir up-front.
COPY packages/database/prisma packages/database/prisma

RUN npm ci --no-audit --no-fund

FROM node:22-slim AS builder
WORKDIR /repo
RUN apt-get update -y && apt-get install -y --no-install-recommends \
      openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/quiktrack/node_modules ./apps/quiktrack/node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npx prisma generate --schema=packages/database/prisma/schema.prisma
RUN npx turbo run build --filter=quiktrack

FROM node:22-slim AS runner
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends \
      openssl ca-certificates && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 1001 nodejs \
    && useradd  --uid 1001 --gid nodejs --shell /bin/bash --create-home nextjs

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080
ENV HOSTNAME=0.0.0.0

COPY --from=builder --chown=nextjs:nodejs /repo/apps/quiktrack/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/quiktrack/.next/static ./apps/quiktrack/.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/apps/quiktrack/public ./apps/quiktrack/public

USER nextjs
EXPOSE 8080
CMD ["node", "apps/quiktrack/server.js"]
