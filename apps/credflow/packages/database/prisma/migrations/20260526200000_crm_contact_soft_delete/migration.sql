-- Soft-delete support for contacts (app_quikcrm)

ALTER TABLE "app_quikcrm"."CrmContact"
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "CrmContact_tenantId_deletedAt_idx"
  ON "app_quikcrm"."CrmContact"("tenantId", "deletedAt");
