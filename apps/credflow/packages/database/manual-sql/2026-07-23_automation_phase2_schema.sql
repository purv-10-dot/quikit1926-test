-- =============================================================================
-- Automation engine — Phase 1–2 additive schema (schema: app_quikcrm)
-- Written 2026-07-23. Apply MANUALLY:  psql "<conn>" -f 2026-07-23_automation_phase2_schema.sql
-- NEVER auto-applied, NEVER pasted into pgAdmin.
--
-- This reproduces EXACTLY the additive schema that `prisma db push` created in
-- first_db_crm_autotest during Phases 1–2, so it can be applied to first_db_crm
-- at cutover.
--
-- Scope of Phase 1–2 schema changes = TWO NEW TABLES, nothing else:
--   * CrmAutomationLeadDayCount   (Task 2.1 — per-lead/day loop-guard counter)
--   * CrmAutomationAttribution    (Task 2.2 — per-write attribution)
-- No columns were added to, and no changes made to, any existing table. There
-- are therefore NO ALTER TABLE statements below. Phase 1 (update_lead_field,
-- if_else IN/AND) and Phase 2.3 (create-record trigger) required no schema.
--
-- Additive-only + idempotent: CREATE TABLE/INDEX IF NOT EXISTS. Safe to re-run;
-- performs no drops, renames, type changes, or writes to existing rows.
-- Column types / defaults / index names match what Prisma generated verbatim
-- (timestamp(3) without time zone; @updatedAt is app-managed => no DB default).
-- =============================================================================

BEGIN;

-- Defensive no-op: app_quikcrm already exists in first_db_crm; additive + safe.
CREATE SCHEMA IF NOT EXISTS app_quikcrm;

-- ---------------------------------------------------------------------------
-- Task 2.1 — CrmAutomationLeadDayCount
-- Per-lead/UTC-day counter of automated lead-mutating writes, shared by BOTH
-- the workflow engine and the legacy disposition engine. When `count` exceeds
-- the cap the run is terminated and `terminated` is set (observable).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_quikcrm."CrmAutomationLeadDayCount" (
    id           text                          NOT NULL,
    "tenantId"   text                          NOT NULL,
    "leadId"     text                          NOT NULL,
    day          text                          NOT NULL,
    count        integer                       NOT NULL DEFAULT 0,
    terminated   boolean                       NOT NULL DEFAULT false,
    "createdAt"  timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  timestamp(3) without time zone NOT NULL,
    CONSTRAINT "CrmAutomationLeadDayCount_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS "CrmAutomationLeadDayCount_tenantId_leadId_day_key"
    ON app_quikcrm."CrmAutomationLeadDayCount" USING btree ("tenantId", "leadId", day);

CREATE INDEX IF NOT EXISTS "CrmAutomationLeadDayCount_tenantId_terminated_idx"
    ON app_quikcrm."CrmAutomationLeadDayCount" USING btree ("tenantId", terminated);

-- ---------------------------------------------------------------------------
-- Task 2.2 — CrmAutomationAttribution
-- One row per automated lead write: engine source, automation + rule/node,
-- trigger event, before/after value, and the trigger-time field snapshot.
-- `engineSource` discriminates "automation" vs "legacy-disposition".
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_quikcrm."CrmAutomationAttribution" (
    id                text                          NOT NULL,
    "tenantId"        text                          NOT NULL,
    "leadId"          text                          NOT NULL,
    "engineSource"    text                          NOT NULL,
    "workflowId"      text,
    "nodeId"          text,
    "ruleId"          text,
    "triggerEventId"  text,
    "triggerType"     text,
    field             text                          NOT NULL,
    "beforeValue"     text,
    "afterValue"      text,
    "triggerSnapshot" jsonb,
    "createdAt"       timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrmAutomationAttribution_pkey" PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS "CrmAutomationAttribution_tenantId_leadId_createdAt_idx"
    ON app_quikcrm."CrmAutomationAttribution" USING btree ("tenantId", "leadId", "createdAt");

CREATE INDEX IF NOT EXISTS "CrmAutomationAttribution_tenantId_engineSource_idx"
    ON app_quikcrm."CrmAutomationAttribution" USING btree ("tenantId", "engineSource");

COMMIT;
