-- Attachments on platform support tickets (public schema).
--
-- Additive only: one new table, its indexes and one FK. No existing table,
-- column, index or enum is touched, so this is safe to apply to a live
-- database and needs no backfill or downtime.
--
-- In particular `SupportTicket.subject` is deliberately LEFT NOT NULL. The
-- Raise-a-request form no longer asks for a subject, but the triage queue
-- still needs a scannable one-line summary, so the server now derives it from
-- the first line of the description. Relaxing the column would have forced
-- every existing reader to handle nulls for no gain.
--
-- Hand-authored rather than generated, matching
-- 20260731120000_add_platform_support_tickets: the shared Neon database has
-- pre-existing drift from schema.prisma, so a generated `migrate diff` would
-- include destructive DROPs unrelated to this feature.

-- CreateTable
CREATE TABLE "public"."SupportTicketAttachment" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportTicketAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicketAttachment_objectKey_key" ON "public"."SupportTicketAttachment"("objectKey");

-- CreateIndex
CREATE INDEX "SupportTicketAttachment_ticketId_createdAt_idx" ON "public"."SupportTicketAttachment"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportTicketAttachment_orgId_idx" ON "public"."SupportTicketAttachment"("orgId");

-- AddForeignKey
ALTER TABLE "public"."SupportTicketAttachment" ADD CONSTRAINT "SupportTicketAttachment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "public"."SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
