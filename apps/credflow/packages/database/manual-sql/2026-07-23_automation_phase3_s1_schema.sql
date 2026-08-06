-- =============================================================================
-- Automation engine — Phase 3 / Task S1 additive schema (schema: app_quikcrm)
-- Written 2026-07-23. Apply MANUALLY:  psql "<conn>" -f 2026-07-23_automation_phase3_s1_schema.sql
-- NEVER auto-applied, NEVER pasted into pgAdmin.
--
-- Reproduces EXACTLY the additive schema that `prisma db push` created in
-- first_db_crm_autotest for the S1 publish state machine, so it can be applied
-- to first_db_crm at Phase-3 cutover (Rishabh applies personally — the agent
-- never writes real first_db_crm; Constraint 1.1 / Engineering-Practices B2).
--
-- Scope of S1 schema changes = TWO additive changes on ONE existing table:
--   * CrmWorkflowStatus enum  → 3 new values (Draining, Stopped, Deleted)
--   * CrmWorkflowDefinition    → new nullable "deletedAt" column + its index
-- No columns dropped/renamed, no type changes, no writes to existing rows.
-- Column type / index name match what Prisma generated verbatim
-- (timestamp(3) without time zone; index "..._tenantId_deletedAt_idx").
--
-- NOTE on ALTER TYPE ADD VALUE: Postgres does not allow a newly-added enum
-- value to be *used* in the same transaction that adds it. These ADD VALUE
-- statements are therefore run OUTSIDE a transaction (each auto-commits).
-- `IF NOT EXISTS` makes them idempotent / safe to re-run.
-- =============================================================================

-- Defensive no-op: app_quikcrm already exists in first_db_crm; additive + safe.
CREATE SCHEMA IF NOT EXISTS app_quikcrm;

-- ---------------------------------------------------------------------------
-- S1 — CrmWorkflowStatus: additive publish-lifecycle states.
--   Draining = unpublish "Delayed" (no new leads; in-flight finish; non-deletable)
--   Stopped  = unpublish "Immediate" (halt in-flight at once)
--   Deleted  = soft-delete (recoverable; paired with "deletedAt")
-- Pre-existing values (Draft/Active/Paused/Archived) are left untouched.
-- ---------------------------------------------------------------------------
ALTER TYPE app_quikcrm."CrmWorkflowStatus" ADD VALUE IF NOT EXISTS 'Draining';
ALTER TYPE app_quikcrm."CrmWorkflowStatus" ADD VALUE IF NOT EXISTS 'Stopped';
ALTER TYPE app_quikcrm."CrmWorkflowStatus" ADD VALUE IF NOT EXISTS 'Deleted';

-- ---------------------------------------------------------------------------
-- S1 — CrmWorkflowDefinition.deletedAt: soft-delete marker (never hard-delete;
-- SPEC §7). Set on softDelete(), cleared on restore(). Additive + nullable, so
-- existing rows default to NULL (= not deleted). Index matches Prisma output.
-- ---------------------------------------------------------------------------
BEGIN;

ALTER TABLE app_quikcrm."CrmWorkflowDefinition"
    ADD COLUMN IF NOT EXISTS "deletedAt" timestamp(3) without time zone;

CREATE INDEX IF NOT EXISTS "CrmWorkflowDefinition_tenantId_deletedAt_idx"
    ON app_quikcrm."CrmWorkflowDefinition" USING btree ("tenantId", "deletedAt");

COMMIT;
