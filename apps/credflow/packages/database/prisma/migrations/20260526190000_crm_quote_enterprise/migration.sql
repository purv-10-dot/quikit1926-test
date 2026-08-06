-- Enterprise quotes: approvals, portal, PDF snapshots, templates, invoices, engagement

DO $$ BEGIN
  CREATE TYPE "app_quikcrm"."CrmQuoteApprovalStatus" AS ENUM (
    'None',
    'Pending',
    'Approved',
    'Rejected'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikcrm"."CrmQuoteEngagementStatus" AS ENUM (
    'NotSent',
    'Sent',
    'Viewed',
    'Signed',
    'Accepted',
    'Rejected'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikcrm"."CrmInvoiceStatus" AS ENUM (
    'Draft',
    'Sent',
    'Paid',
    'Void'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "app_quikcrm"."CrmQuote"
  ADD COLUMN IF NOT EXISTS "templateKey" TEXT NOT NULL DEFAULT 'b2b-standard',
  ADD COLUMN IF NOT EXISTS "approvalStatus" "app_quikcrm"."CrmQuoteApprovalStatus" NOT NULL DEFAULT 'None',
  ADD COLUMN IF NOT EXISTS "engagementStatus" "app_quikcrm"."CrmQuoteEngagementStatus" NOT NULL DEFAULT 'NotSent',
  ADD COLUMN IF NOT EXISTS "portalTokenHash" TEXT,
  ADD COLUMN IF NOT EXISTS "portalExpiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "firstViewedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastViewedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastViewedIp" TEXT,
  ADD COLUMN IF NOT EXISTS "acceptedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rejectedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rejectedReason" TEXT,
  ADD COLUMN IF NOT EXISTS "customerComment" TEXT,
  ADD COLUMN IF NOT EXISTS "signedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "signatureJson" JSONB,
  ADD COLUMN IF NOT EXISTS "signatureOtpVerified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "watermarkText" TEXT,
  ADD COLUMN IF NOT EXISTS "bankDetailsJson" JSONB,
  ADD COLUMN IF NOT EXISTS "lockedSnapshotAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "CrmQuote_tenantId_portalTokenHash_key"
  ON "app_quikcrm"."CrmQuote"("tenantId", "portalTokenHash");

CREATE INDEX IF NOT EXISTS "CrmQuote_tenantId_approvalStatus_idx"
  ON "app_quikcrm"."CrmQuote"("tenantId", "approvalStatus");

CREATE TABLE IF NOT EXISTS "app_quikcrm"."CrmQuoteTemplate" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "layout" TEXT NOT NULL DEFAULT 'b2b',
  "themeColor" TEXT NOT NULL DEFAULT '#1d4ed8',
  "headerHtml" TEXT,
  "footerHtml" TEXT,
  "termsDefault" TEXT,
  "bankDetailsJson" JSONB,
  "watermarkText" TEXT,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmQuoteTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CrmQuoteTemplate_tenantId_key_key"
  ON "app_quikcrm"."CrmQuoteTemplate"("tenantId", "key");

CREATE INDEX IF NOT EXISTS "CrmQuoteTemplate_tenantId_isActive_idx"
  ON "app_quikcrm"."CrmQuoteTemplate"("tenantId", "isActive");

CREATE TABLE IF NOT EXISTS "app_quikcrm"."CrmQuoteApproval" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "quoteId" TEXT NOT NULL,
  "status" "app_quikcrm"."CrmQuoteApprovalStatus" NOT NULL DEFAULT 'Pending',
  "triggerReason" TEXT NOT NULL,
  "requestedById" TEXT,
  "requestedByName" TEXT,
  "decidedById" TEXT,
  "decidedByName" TEXT,
  "decisionNotes" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt" TIMESTAMP(3),
  CONSTRAINT "CrmQuoteApproval_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CrmQuoteApproval_tenantId_quoteId_idx"
  ON "app_quikcrm"."CrmQuoteApproval"("tenantId", "quoteId");

CREATE INDEX IF NOT EXISTS "CrmQuoteApproval_tenantId_status_idx"
  ON "app_quikcrm"."CrmQuoteApproval"("tenantId", "status");

CREATE TABLE IF NOT EXISTS "app_quikcrm"."CrmQuotePdfSnapshot" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "quoteId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "templateKey" TEXT NOT NULL,
  "documentId" TEXT,
  "storageKey" TEXT,
  "contentHash" TEXT,
  "fileName" TEXT NOT NULL,
  "contentType" TEXT NOT NULL DEFAULT 'application/pdf',
  "size" INTEGER NOT NULL DEFAULT 0,
  "isLocked" BOOLEAN NOT NULL DEFAULT true,
  "generatedById" TEXT,
  "generatedByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmQuotePdfSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CrmQuotePdfSnapshot_tenantId_quoteId_createdAt_idx"
  ON "app_quikcrm"."CrmQuotePdfSnapshot"("tenantId", "quoteId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "app_quikcrm"."CrmQuoteComment" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "quoteId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "mentions" JSONB,
  "authorId" TEXT,
  "authorName" TEXT,
  "isInternal" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmQuoteComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CrmQuoteComment_tenantId_quoteId_createdAt_idx"
  ON "app_quikcrm"."CrmQuoteComment"("tenantId", "quoteId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "app_quikcrm"."CrmQuoteEngagementEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "quoteId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmQuoteEngagementEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CrmQuoteEngagementEvent_tenantId_quoteId_createdAt_idx"
  ON "app_quikcrm"."CrmQuoteEngagementEvent"("tenantId", "quoteId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "CrmQuoteEngagementEvent_tenantId_eventType_idx"
  ON "app_quikcrm"."CrmQuoteEngagementEvent"("tenantId", "eventType");

CREATE TABLE IF NOT EXISTS "app_quikcrm"."CrmQuotePortalAccess" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "quoteId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3),
  CONSTRAINT "CrmQuotePortalAccess_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CrmQuotePortalAccess_tokenHash_key"
  ON "app_quikcrm"."CrmQuotePortalAccess"("tokenHash");

CREATE INDEX IF NOT EXISTS "CrmQuotePortalAccess_tenantId_quoteId_idx"
  ON "app_quikcrm"."CrmQuotePortalAccess"("tenantId", "quoteId");

CREATE TABLE IF NOT EXISTS "app_quikcrm"."CrmInvoice" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "invoiceNumber" TEXT NOT NULL,
  "quoteId" TEXT,
  "orderId" TEXT,
  "accountId" TEXT,
  "contactId" TEXT,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "status" "app_quikcrm"."CrmInvoiceStatus" NOT NULL DEFAULT 'Draft',
  "subtotal" DECIMAL(18, 2) NOT NULL DEFAULT 0,
  "totalDiscount" DECIMAL(18, 2) NOT NULL DEFAULT 0,
  "taxableAmount" DECIMAL(18, 2) NOT NULL DEFAULT 0,
  "cgstAmount" DECIMAL(18, 2) NOT NULL DEFAULT 0,
  "sgstAmount" DECIMAL(18, 2) NOT NULL DEFAULT 0,
  "igstAmount" DECIMAL(18, 2) NOT NULL DEFAULT 0,
  "freightAmount" DECIMAL(18, 2) NOT NULL DEFAULT 0,
  "grandTotal" DECIMAL(18, 2) NOT NULL DEFAULT 0,
  "grandTotalInWords" TEXT,
  "dueDate" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "termsText" TEXT,
  "ownerId" TEXT,
  "ownerName" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmInvoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CrmInvoice_quoteId_key"
  ON "app_quikcrm"."CrmInvoice"("quoteId");

CREATE UNIQUE INDEX IF NOT EXISTS "CrmInvoice_tenantId_invoiceNumber_key"
  ON "app_quikcrm"."CrmInvoice"("tenantId", "invoiceNumber");

CREATE INDEX IF NOT EXISTS "CrmInvoice_tenantId_status_idx"
  ON "app_quikcrm"."CrmInvoice"("tenantId", "status");

CREATE INDEX IF NOT EXISTS "CrmInvoice_tenantId_accountId_idx"
  ON "app_quikcrm"."CrmInvoice"("tenantId", "accountId");

-- Foreign keys (idempotent via DO blocks)
DO $$ BEGIN
  ALTER TABLE "app_quikcrm"."CrmQuoteApproval"
    ADD CONSTRAINT "CrmQuoteApproval_quoteId_fkey"
    FOREIGN KEY ("quoteId") REFERENCES "app_quikcrm"."CrmQuote"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikcrm"."CrmQuotePdfSnapshot"
    ADD CONSTRAINT "CrmQuotePdfSnapshot_quoteId_fkey"
    FOREIGN KEY ("quoteId") REFERENCES "app_quikcrm"."CrmQuote"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikcrm"."CrmQuoteComment"
    ADD CONSTRAINT "CrmQuoteComment_quoteId_fkey"
    FOREIGN KEY ("quoteId") REFERENCES "app_quikcrm"."CrmQuote"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikcrm"."CrmQuoteEngagementEvent"
    ADD CONSTRAINT "CrmQuoteEngagementEvent_quoteId_fkey"
    FOREIGN KEY ("quoteId") REFERENCES "app_quikcrm"."CrmQuote"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikcrm"."CrmQuotePortalAccess"
    ADD CONSTRAINT "CrmQuotePortalAccess_quoteId_fkey"
    FOREIGN KEY ("quoteId") REFERENCES "app_quikcrm"."CrmQuote"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikcrm"."CrmInvoice"
    ADD CONSTRAINT "CrmInvoice_quoteId_fkey"
    FOREIGN KEY ("quoteId") REFERENCES "app_quikcrm"."CrmQuote"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
