-- Stock Reconciliation — record the free-typed "Conducted By" name.
--
-- The create form has always asked for a "Conducted By" name, but the table had
-- nowhere to put it: only `conductedById` existed (a user id, and the create
-- route always writes the calling user into it). The typed string was parsed
-- off the request and then dropped, so the list column — which renders
-- `conductedByName` — was permanently blank.
--
--   app_quikinfra."Stock_reconciliations".conductedByName
--     TEXT: the name typed on the create form.
--
-- A text column rather than a second user FK on purpose: the person who runs a
-- physical count is often not a system user (a contractor's storekeeper, a
-- third-party auditor). `conductedById` keeps its current meaning — the user
-- who created the record — and remains what the approval flow and audit trail
-- read.
--
-- Nullable and backfill-free. Rows created before this column stay NULL, and
-- both the list and detail routes fall back to the display name of the user on
-- `conductedById`, so the column is never empty for existing data.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS) — safe to run by hand and to re-run.

ALTER TABLE app_quikinfra."Stock_reconciliations"
  ADD COLUMN IF NOT EXISTS "conductedByName" TEXT;
