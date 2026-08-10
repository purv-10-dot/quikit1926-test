-- Platform support tickets (public schema).
--
-- Additive only: two new tables + one sequence. No existing table, column,
-- index or enum is touched, so this is safe to apply to a live database and
-- needs no backfill or downtime.
--
-- Hand-authored rather than generated: the shared Neon database currently has
-- pre-existing drift from schema.prisma (several app_quikcrm / app_quikhrms
-- migrations are unapplied), so a generated `migrate diff` would have included
-- destructive DROPs unrelated to this feature. This file is scoped to exactly
-- the SupportTicket feature.

-- CreateSequence
-- Backs SupportTicket.ticketNo. Declared in schema.prisma as
--   @default(dbgenerated("nextval('\"public\".\"SupportTicket_ticketNo_seq\"')"))
-- Prisma emits the column default but never the sequence itself, so it is
-- created explicitly here and must exist before the table.
CREATE SEQUENCE IF NOT EXISTS "public"."SupportTicket_ticketNo_seq";

-- CreateTable
CREATE TABLE "public"."SupportTicket" (
    "id" TEXT NOT NULL,
    "ticketNo" INTEGER NOT NULL DEFAULT nextval('"public"."SupportTicket_ticketNo_seq"'),
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "appSlug" TEXT NOT NULL,
    "roleName" TEXT,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requestType" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'open',
    "adminResponse" TEXT,
    "respondedById" TEXT,
    "respondedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SupportTicketMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorRole" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "statusFrom" TEXT,
    "statusTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportTicketMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicket_ticketNo_key" ON "public"."SupportTicket"("ticketNo");

-- CreateIndex
CREATE INDEX "SupportTicket_orgId_idx" ON "public"."SupportTicket"("orgId");

-- CreateIndex
CREATE INDEX "SupportTicket_orgId_userId_createdAt_idx" ON "public"."SupportTicket"("orgId", "userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "SupportTicket_status_createdAt_idx" ON "public"."SupportTicket"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "SupportTicket_appSlug_status_idx" ON "public"."SupportTicket"("appSlug", "status");

-- CreateIndex
CREATE INDEX "SupportTicket_appId_idx" ON "public"."SupportTicket"("appId");

-- CreateIndex
CREATE INDEX "SupportTicket_orgId_status_idx" ON "public"."SupportTicket"("orgId", "status");

-- CreateIndex
CREATE INDEX "SupportTicketMessage_ticketId_createdAt_idx" ON "public"."SupportTicketMessage"("ticketId", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."SupportTicket" ADD CONSTRAINT "SupportTicket_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SupportTicketMessage" ADD CONSTRAINT "SupportTicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "public"."SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
