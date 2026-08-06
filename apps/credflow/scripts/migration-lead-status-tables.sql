-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: CrmLeadStatus / CrmLeadSubStatus / CrmLeadStatusSubStatus
-- Schema:    app_quikcrm
-- Run ONCE against the target database before executing the seed script.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1. Lead Statuses (global lookup — one row per status name)
CREATE TABLE IF NOT EXISTS app_quikcrm."CrmLeadStatus" (
    id   TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    CONSTRAINT "CrmLeadStatus_name_key" UNIQUE (name)
);

-- 2. Lead Sub-Statuses (global lookup — one row per sub-status name)
CREATE TABLE IF NOT EXISTS app_quikcrm."CrmLeadSubStatus" (
    id   TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    CONSTRAINT "CrmLeadSubStatus_name_key" UNIQUE (name)
);

-- 3. Junction table: many-to-many between Status and Sub-Status
CREATE TABLE IF NOT EXISTS app_quikcrm."CrmLeadStatusSubStatus" (
    id                TEXT PRIMARY KEY,
    "leadStatusId"    TEXT NOT NULL
        REFERENCES app_quikcrm."CrmLeadStatus"  (id) ON DELETE CASCADE,
    "leadSubStatusId" TEXT NOT NULL
        REFERENCES app_quikcrm."CrmLeadSubStatus" (id) ON DELETE CASCADE,
    CONSTRAINT "CrmLeadStatusSubStatus_leadStatusId_leadSubStatusId_key"
        UNIQUE ("leadStatusId", "leadSubStatusId")
);

CREATE INDEX IF NOT EXISTS "CrmLeadStatusSubStatus_leadStatusId_idx"
    ON app_quikcrm."CrmLeadStatusSubStatus" ("leadStatusId");

CREATE INDEX IF NOT EXISTS "CrmLeadStatusSubStatus_leadSubStatusId_idx"
    ON app_quikcrm."CrmLeadStatusSubStatus" ("leadSubStatusId");

COMMIT;
