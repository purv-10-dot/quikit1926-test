-- =============================================================================
-- Automation engine — Phase 3 / Task B2 additive schema (schema: app_quikcrm)
-- Written 2026-07-23. Apply MANUALLY:  psql "<conn>" -f 2026-07-23_automation_phase3_b2_schema.sql
-- NEVER auto-applied, NEVER pasted into pgAdmin.
--
-- Reproduces EXACTLY the additive schema that `prisma db push` created in
-- first_db_crm_autotest for the B2 email suppression flags, so it can be applied
-- to first_db_crm at Phase-3 cutover (Rishabh applies personally — the agent
-- never writes real first_db_crm; Constraint 1.1 / Engineering-Practices B2).
--
-- Scope of B2 schema changes = TWO additive nullable columns on ONE table:
--   * CrmLead.doNotEmail   boolean NULL  (SPEC §5.1 Do-Not-Email suppression)
--   * CrmLead.unsubscribed boolean NULL  (SPEC §5.1 unsubscribed suppression)
-- NULL = not flagged = mailable. No columns dropped/renamed, no type changes,
-- no writes to existing rows. Column type matches Prisma output (boolean).
-- =============================================================================

-- Defensive no-op: app_quikcrm already exists in first_db_crm; additive + safe.
CREATE SCHEMA IF NOT EXISTS app_quikcrm;

BEGIN;

ALTER TABLE app_quikcrm."CrmLead"
    ADD COLUMN IF NOT EXISTS "doNotEmail" boolean;

ALTER TABLE app_quikcrm."CrmLead"
    ADD COLUMN IF NOT EXISTS "unsubscribed" boolean;

COMMIT;
