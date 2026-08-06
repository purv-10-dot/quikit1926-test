-- FR-D3: Flat trigger→action automation rules (lifecycle spec Section 8).
-- One row per rule. trigger and action are JSON objects whose shapes are
-- validated at the service layer, not the DB layer, so the schema stays
-- forward-compatible as new trigger/action types are added.

-- CreateTable
CREATE TABLE "CrmAutomationRule" (
    "id"        TEXT        NOT NULL,
    "tenantId"  TEXT        NOT NULL,
    "name"      TEXT        NOT NULL,
    "trigger"   JSONB       NOT NULL,
    "action"    JSONB       NOT NULL,
    "sortOrder" INTEGER     NOT NULL DEFAULT 0,
    "isActive"  BOOLEAN     NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmAutomationRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: primary query path — active rules for a tenant, ordered
CREATE INDEX "CrmAutomationRule_tenantId_isActive_sortOrder_idx"
    ON "CrmAutomationRule"("tenantId", "isActive", "sortOrder");
