-- Tested-status badge on the QuikFlow template gallery (app_quikflow schema).
--
-- Additive only: two nullable/defaulted columns on an existing table. No
-- backfill needed — existing rows default to isTested = false.

-- AlterTable
ALTER TABLE "app_quikflow"."WfTemplate" ADD COLUMN "isTested" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "app_quikflow"."WfTemplate" ADD COLUMN "lastTestedAt" TIMESTAMP(3);
