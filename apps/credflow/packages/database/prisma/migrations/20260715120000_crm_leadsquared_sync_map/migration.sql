-- QuikCRM <-> LeadSquared two-way sync mapping "diary" (app_quikcrm).
-- One row per synced lead: links crmLeadId <-> lsqProspectId and stores the
-- loop-guard state (syncOrigin + lastPayloadHash). Delete-sync is out of scope
-- for now; this table leaves room to add a delete-tracking column later.

CREATE TABLE IF NOT EXISTS "app_quikcrm"."LeadSquaredSyncMap" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "crmLeadId" TEXT NOT NULL,
    "lsqProspectId" TEXT,
    "syncOrigin" TEXT NOT NULL,
    "lastPayloadHash" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadSquaredSyncMap_pkey" PRIMARY KEY ("id")
);

-- One mapping row per lead.
CREATE UNIQUE INDEX IF NOT EXISTS "LeadSquaredSyncMap_crmLeadId_key"
    ON "app_quikcrm"."LeadSquaredSyncMap"("crmLeadId");

-- Tenant-scoped uniqueness on the LeadSquared ProspectId. Postgres treats
-- NULLs as distinct, so rows without a ProspectId yet do not collide.
CREATE UNIQUE INDEX IF NOT EXISTS "LeadSquaredSyncMap_tenantId_lsqProspectId_key"
    ON "app_quikcrm"."LeadSquaredSyncMap"("tenantId", "lsqProspectId");

CREATE INDEX IF NOT EXISTS "LeadSquaredSyncMap_tenantId_idx"
    ON "app_quikcrm"."LeadSquaredSyncMap"("tenantId");

DO $$ BEGIN
    ALTER TABLE "app_quikcrm"."LeadSquaredSyncMap"
        ADD CONSTRAINT "LeadSquaredSyncMap_crmLeadId_fkey"
        FOREIGN KEY ("crmLeadId")
        REFERENCES "app_quikcrm"."CrmLead"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
