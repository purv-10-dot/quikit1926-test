-- ============================================================================
-- Free-Scope Mode (executionMode = BOQ | FREE_SCOPE) — RUN MANUALLY
-- ----------------------------------------------------------------------------
-- Additive to BOQ mode. Adds the per-project mode switch, the CnActivityItem
-- tree (the FREE_SCOPE anchor in place of BOQ leaves), and nullable
-- scopeType/scopeId columns on the anchored models so a row can point at an
-- activity instead of a BOQ line. boqItemId / boqNo / category are widened to
-- nullable on the ledgers so activity rows can carry boqItemId = NULL.
--
-- Idempotent (IF NOT EXISTS / DROP NOT NULL) — safe to hand-apply / re-run.
-- After applying, run `npx prisma generate` so the client picks up the new
-- model + fields.
-- ============================================================================

-- ── CnProject: mode switch ──────────────────────────────────────────────
ALTER TABLE app_quikinfra."Projects"
  ADD COLUMN IF NOT EXISTS "executionMode" text NOT NULL DEFAULT 'BOQ',
  ADD COLUMN IF NOT EXISTS "freeScopeLocked" boolean NOT NULL DEFAULT false;

-- ── CnActivityItem: FREE_SCOPE anchor (manual BOQ) ──────────────────────
-- Fresh table (dropped + recreated) with the BOQ-style field set:
-- category / uom / tenderQty / scopeQty / rate / schedule. Entered by hand
-- instead of imported from Excel.
DROP TABLE IF EXISTS app_quikinfra."Activity_items" CASCADE;
CREATE TABLE app_quikinfra."Activity_items" (
  "id"           text NOT NULL,
  "orgId"        text NOT NULL,
  "projectId"    text NOT NULL,
  "activityCode" text NOT NULL,
  "description"  text NOT NULL DEFAULT '',
  "category"     text,
  "uomId"        text,
  "tenderQty"    numeric(18,4),
  "scopeQty"     numeric(18,4) NOT NULL DEFAULT 0,
  "rate"         numeric(18,2),
  "startDate"    timestamp(3),
  "endDate"      timestamp(3),
  "parentId"     text,
  "isGroup"      boolean NOT NULL DEFAULT false,
  "depth"        integer NOT NULL DEFAULT 0,
  "sortOrder"    integer NOT NULL DEFAULT 0,
  "status"       text NOT NULL DEFAULT 'active',
  "locked"       boolean NOT NULL DEFAULT false,
  "createdAt"    timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    timestamp(3) NOT NULL,
  "createdBy"    text NOT NULL,
  "updatedBy"    text NOT NULL,
  CONSTRAINT "Activity_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Activity_items_projectId_activityCode_key"
  ON app_quikinfra."Activity_items" ("projectId", "activityCode");
CREATE INDEX "Activity_items_orgId_idx"
  ON app_quikinfra."Activity_items" ("orgId");
CREATE INDEX "Activity_items_projectId_parentId_idx"
  ON app_quikinfra."Activity_items" ("projectId", "parentId");
CREATE INDEX "Activity_items_projectId_isGroup_idx"
  ON app_quikinfra."Activity_items" ("projectId", "isGroup");

-- ── Anchored models: scopeType / scopeId + widen boqItemId nullable ─────
ALTER TABLE app_quikinfra."Work_order_lines"
  ADD COLUMN IF NOT EXISTS "scopeType" text,
  ADD COLUMN IF NOT EXISTS "scopeId"   text,
  ALTER COLUMN "boqItemId" DROP NOT NULL;

ALTER TABLE app_quikinfra."Rab_lines"
  ADD COLUMN IF NOT EXISTS "scopeType" text,
  ADD COLUMN IF NOT EXISTS "scopeId"   text,
  ALTER COLUMN "boqItemId" DROP NOT NULL;

ALTER TABLE app_quikinfra."Material_estimations"
  ADD COLUMN IF NOT EXISTS "scopeType" text,
  ADD COLUMN IF NOT EXISTS "scopeId"   text,
  ALTER COLUMN "boqItemId" DROP NOT NULL;

ALTER TABLE app_quikinfra."Dpr_work_items"
  ADD COLUMN IF NOT EXISTS "scopeType" text,
  ADD COLUMN IF NOT EXISTS "scopeId"   text,
  ALTER COLUMN "boqItemId" DROP NOT NULL;

-- Ledgers also drop NOT NULL on boqNo / category so activity rows can omit them.
ALTER TABLE app_quikinfra."Boq_progress_ledger"
  ADD COLUMN IF NOT EXISTS "scopeType" text,
  ADD COLUMN IF NOT EXISTS "scopeId"   text,
  ALTER COLUMN "boqItemId" DROP NOT NULL,
  ALTER COLUMN "boqNo"     DROP NOT NULL,
  ALTER COLUMN "category"  DROP NOT NULL;

ALTER TABLE app_quikinfra."Boq_billing_ledger"
  ADD COLUMN IF NOT EXISTS "scopeType" text,
  ADD COLUMN IF NOT EXISTS "scopeId"   text,
  ALTER COLUMN "boqItemId" DROP NOT NULL,
  ALTER COLUMN "boqNo"     DROP NOT NULL,
  ALTER COLUMN "category"  DROP NOT NULL;

-- ── Purchase Requisition: optional FREE_SCOPE activity tag ──────────────
ALTER TABLE app_quikinfra."Purchase_requisitions"
  ADD COLUMN IF NOT EXISTS "scopeType" text,
  ADD COLUMN IF NOT EXISTS "scopeId"   text;
