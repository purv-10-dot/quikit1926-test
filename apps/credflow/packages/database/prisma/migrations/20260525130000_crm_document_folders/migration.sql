-- QuikCRM document folders (app_quikcrm)

CREATE TABLE IF NOT EXISTS "app_quikcrm"."CrmDocumentFolder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentFolderId" TEXT,
    "refType" TEXT,
    "refId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CrmDocumentFolder_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CrmDocumentFolder_tenantId_idx"
    ON "app_quikcrm"."CrmDocumentFolder"("tenantId");
CREATE INDEX IF NOT EXISTS "CrmDocumentFolder_tenantId_parentFolderId_idx"
    ON "app_quikcrm"."CrmDocumentFolder"("tenantId", "parentFolderId");
CREATE INDEX IF NOT EXISTS "CrmDocumentFolder_tenantId_refType_refId_idx"
    ON "app_quikcrm"."CrmDocumentFolder"("tenantId", "refType", "refId");
CREATE INDEX IF NOT EXISTS "CrmDocumentFolder_tenantId_deletedAt_idx"
    ON "app_quikcrm"."CrmDocumentFolder"("tenantId", "deletedAt");

DO $$ BEGIN
    ALTER TABLE "app_quikcrm"."CrmDocumentFolder"
        ADD CONSTRAINT "CrmDocumentFolder_parentFolderId_fkey"
        FOREIGN KEY ("parentFolderId")
        REFERENCES "app_quikcrm"."CrmDocumentFolder"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "app_quikcrm"."CrmDocument"
    ADD COLUMN IF NOT EXISTS "folderId" TEXT;

CREATE INDEX IF NOT EXISTS "CrmDocument_folderId_idx"
    ON "app_quikcrm"."CrmDocument"("folderId");

DO $$ BEGIN
    ALTER TABLE "app_quikcrm"."CrmDocument"
        ADD CONSTRAINT "CrmDocument_folderId_fkey"
        FOREIGN KEY ("folderId")
        REFERENCES "app_quikcrm"."CrmDocumentFolder"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
