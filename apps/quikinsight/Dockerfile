# syntax=docker/dockerfile:1.6
#
# Multi-stage Docker build for the `quikinsight` Next.js app.
# Pattern: turbo prune --docker (slices monorepo to just this app's deps)
#   → installer (npm install --ignore-scripts + prisma generate + next build)
#   → runner (standalone output + Prisma engines, non-root)
#
# Build (from monorepo root):
#   docker build -f apps/quikinsight/Dockerfile -t quikinsightatest .

FROM node:20-alpine AS base

# ─────────────────────────────────────────────────────────────────────────
# Stage 1 — builder: prune monorepo down to just `quikinsight` + its workspace deps
# ─────────────────────────────────────────────────────────────────────────
FROM base AS builder
RUN apk update && apk add --no-cache libc6-compat
WORKDIR /app
RUN npm install -g turbo
COPY . .
RUN turbo prune quikinsight --docker

# ─────────────────────────────────────────────────────────────────────────
# Stage 2 — installer: install pruned deps + generate Prisma + build
# --ignore-scripts skips packages/database's postinstall (we run prisma
# generate explicitly below so it picks up the right schema path).
# ─────────────────────────────────────────────────────────────────────────
FROM base AS installer
RUN apk update && apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/package-lock.json ./package-lock.json
RUN npm ci --ignore-scripts

COPY --from=builder /app/out/full/ .
COPY turbo.json turbo.json
COPY tsconfig.base.json tsconfig.base.json

ARG DATABASE_URL="postgresql://x:x@localhost:5432/x"
ARG DATABASE_URL_DIRECT="postgresql://x:x@localhost:5432/x"
ARG NEXTAUTH_URL="https://uatauthn.quikit.ai"
ARG NEXT_PUBLIC_LAUNCHER_URL="https://uatapps.quikit.ai"
ARG NEXT_PUBLIC_AUTH_URL="https://uatauthn.quikit.ai"
ARG NEXT_PUBLIC_QUIKIT_URL="https://uatapps.quikit.ai"
ARG NEXT_PUBLIC_QUIKSCALE_URL="https://uatscale.quikit.ai"
ARG NEXT_PUBLIC_ADMIN_URL="https://uatorgadmin.quikit.ai"
ARG NEXT_PUBLIC_LOGIN_URL="https://uatauthn.quikit.ai/login"
ARG NEXT_PUBLIC_APP_URL="https://uatinsights.quikit.ai"
ARG NEXT_PUBLIC_API_BASE_URL="https://uatinsights.quikit.ai"
ARG NEXT_PUBLIC_USE_MOCK_DATA="false"
ARG NEXT_PUBLIC_SENTRY_DSN

ENV DATABASE_URL=$DATABASE_URL
ENV DATABASE_URL_DIRECT=$DATABASE_URL_DIRECT
ENV NEXTAUTH_URL=$NEXTAUTH_URL
ENV NEXT_PUBLIC_LAUNCHER_URL=$NEXT_PUBLIC_LAUNCHER_URL
ENV NEXT_PUBLIC_AUTH_URL=$NEXT_PUBLIC_AUTH_URL
ENV NEXT_PUBLIC_QUIKIT_URL=$NEXT_PUBLIC_QUIKIT_URL
ENV NEXT_PUBLIC_QUIKSCALE_URL=$NEXT_PUBLIC_QUIKSCALE_URL
ENV NEXT_PUBLIC_ADMIN_URL=$NEXT_PUBLIC_ADMIN_URL
ENV NEXT_PUBLIC_LOGIN_URL=$NEXT_PUBLIC_LOGIN_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_USE_MOCK_DATA=$NEXT_PUBLIC_USE_MOCK_DATA
ENV NEXTAUTH_SECRET="build-time-dummy-not-used-at-runtime"
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN echo "[next-env-bake]" \
      "LAUNCHER=$NEXT_PUBLIC_LAUNCHER_URL" \
      "AUTH=$NEXT_PUBLIC_AUTH_URL" \
      "QUIKIT=$NEXT_PUBLIC_QUIKIT_URL" \
      "QUIKSCALE=$NEXT_PUBLIC_QUIKSCALE_URL" \
      "ADMIN=$NEXT_PUBLIC_ADMIN_URL" \
      "LOGIN=$NEXT_PUBLIC_LOGIN_URL" \
      "APP=$NEXT_PUBLIC_APP_URL" \
      "API_BASE=$NEXT_PUBLIC_API_BASE_URL" \
      "USE_MOCK=$NEXT_PUBLIC_USE_MOCK_DATA" \
      "NEXTAUTH=$NEXTAUTH_URL" \
      > /tmp/.next-env-bake.txt && cat /tmp/.next-env-bake.txt

RUN npx prisma generate --schema=packages/database/prisma/schema.prisma
RUN mkdir -p apps/quikinsight/public
RUN mkdir -p apps/quikinsight/.next/static
RUN printf '%s\n' \
  "NEXT_PUBLIC_LAUNCHER_URL=$NEXT_PUBLIC_LAUNCHER_URL" \
  "NEXT_PUBLIC_AUTH_URL=$NEXT_PUBLIC_AUTH_URL" \
  "NEXT_PUBLIC_QUIKIT_URL=$NEXT_PUBLIC_QUIKIT_URL" \
  "NEXT_PUBLIC_QUIKSCALE_URL=$NEXT_PUBLIC_QUIKSCALE_URL" \
  "NEXT_PUBLIC_ADMIN_URL=$NEXT_PUBLIC_ADMIN_URL" \
  "NEXT_PUBLIC_LOGIN_URL=$NEXT_PUBLIC_LOGIN_URL" \
  "NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL" \
  "NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL" \
  "NEXT_PUBLIC_USE_MOCK_DATA=$NEXT_PUBLIC_USE_MOCK_DATA" \
  "NEXTAUTH_URL=$NEXTAUTH_URL" \
  > apps/quikinsight/.env.production && cat apps/quikinsight/.env.production

RUN npx turbo build --filter=quikinsight

# ─────────────────────────────────────────────────────────────────────────
# Stage 3 — runner: minimal image, standalone server + Prisma engines
# ─────────────────────────────────────────────────────────────────────────
FROM base AS runner
RUN apk add --no-cache openssl
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3015
ENV HOSTNAME="0.0.0.0"

COPY --from=installer --chown=nextjs:nodejs /app/apps/quikinsight/.next/standalone ./
COPY --from=installer --chown=nextjs:nodejs /app/apps/quikinsight/.next/static ./apps/quikinsight/.next/static
COPY --from=installer --chown=nextjs:nodejs /app/apps/quikinsight/public ./public
COPY --from=installer --chown=nextjs:nodejs /app/apps/quikinsight/public ./apps/quikinsight/public

COPY --from=installer --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=installer --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma

USER nextjs
EXPOSE 3015

CMD ["node", "apps/quikinsight/server.js"]
