-- Soft-orphan flag: parent (Lead/Opp/Contact/Account) delete sets this; restore clears it.
ALTER TABLE "app_quikcrm"."CrmActivity" ADD COLUMN "relatedOrphanedAt" TIMESTAMP(3);

CREATE INDEX "CrmActivity_tenantId_relatedOrphanedAt_idx" ON "app_quikcrm"."CrmActivity"("tenantId", "relatedOrphanedAt");
