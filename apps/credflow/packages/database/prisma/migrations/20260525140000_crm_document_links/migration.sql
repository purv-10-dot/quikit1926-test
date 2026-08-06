-- QuikCRM document links — attach existing files without re-uploading to S3 (app_quikcrm)

CREATE TABLE IF NOT EXISTS "app_quikcrm"."CrmDocumentLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "targetFolderId" TEXT,
    "refType" TEXT,
    "refId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CrmDocumentLink_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CrmDocumentLink_tenantId_targetFolderId_idx"
    ON "app_quikcrm"."CrmDocumentLink"("tenantId", "targetFolderId");
CREATE INDEX IF NOT EXISTS "CrmDocumentLink_tenantId_sourceDocumentId_idx"
    ON "app_quikcrm"."CrmDocumentLink"("tenantId", "sourceDocumentId");
CREATE INDEX IF NOT EXISTS "CrmDocumentLink_tenantId_refType_refId_idx"
    ON "app_quikcrm"."CrmDocumentLink"("tenantId", "refType", "refId");
CREATE INDEX IF NOT EXISTS "CrmDocumentLink_tenantId_deletedAt_idx"
    ON "app_quikcrm"."CrmDocumentLink"("tenantId", "deletedAt");

DO $$ BEGIN
    ALTER TABLE "app_quikcrm"."CrmDocumentLink"
        ADD CONSTRAINT "CrmDocumentLink_sourceDocumentId_fkey"
        FOREIGN KEY ("sourceDocumentId")
        REFERENCES "app_quikcrm"."CrmDocument"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
