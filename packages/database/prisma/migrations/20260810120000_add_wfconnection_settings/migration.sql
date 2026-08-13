-- Per-connection provider config (app_quikflow schema). First use: an
-- optional notetakerEmail on a Teams calendar connection, invited as an
-- attendee on every online meeting so Fathom's bot auto-joins and records.
--
-- Additive only: one nullable column on an existing table. No backfill
-- needed — existing rows default to settings = NULL.

-- AlterTable
ALTER TABLE "app_quikflow"."WfConnection" ADD COLUMN "settings" JSONB;
