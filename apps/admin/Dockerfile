# syntax=docker/dockerfile:1.6
#
# Multi-stage Docker build for the `admin` portal.
# Build:  docker build -f apps/admin/Dockerfile -t admin:latest .
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
COPY --from=deps /repo/apps/admin/node_modules ./apps/admin/node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build-time placeholders — `next build` instantiates Prisma at "Collect page
# data" time. They are never used to connect to a real DB (build does not
# execute queries); they just satisfy the PrismaClient constructor.
ENV DATABASE_URL="postgresql://x:x@localhost:5432/x"
ENV DATABASE_URL_DIRECT="postgresql://x:x@localhost:5432/x"
ENV NEXTAUTH_SECRET="build-time-dummy-not-used-at-runtime"
ENV NEXTAUTH_URL="http://localhost:3000"

RUN npx prisma generate --schema=packages/database/prisma/schema.prisma
RUN npx turbo run build --filter=admin

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

COPY --from=builder --chown=nextjs:nodejs /repo/apps/admin/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/admin/.next/static ./apps/admin/.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/apps/admin/public ./apps/admin/public

USER nextjs
EXPOSE 8080
CMD ["node", "apps/admin/server.js"]
