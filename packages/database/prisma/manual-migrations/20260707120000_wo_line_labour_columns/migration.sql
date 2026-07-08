-- AlterTable: first-class labour-scope columns on work order lines.
-- Labour Only work orders previously encoded these fields into boqItemId /
-- description strings; they now get real columns. Purely additive — existing
-- BOQ lines default to lineType 'boq' with null labour fields.
ALTER TABLE "app_quikinfra"."Work_order_lines" ADD COLUMN "lineType" TEXT NOT NULL DEFAULT 'boq';
ALTER TABLE "app_quikinfra"."Work_order_lines" ADD COLUMN "lineDate" TIMESTAMP(3);
ALTER TABLE "app_quikinfra"."Work_order_lines" ADD COLUMN "activityName" TEXT;
ALTER TABLE "app_quikinfra"."Work_order_lines" ADD COLUMN "workCategoryId" TEXT;

-- Per-trade manpower counts for labour-only lines: JSON array of { type, count }.
-- JSON (not one column per trade) so adding a new labour type never needs a migration.
ALTER TABLE "app_quikinfra"."Work_order_lines" ADD COLUMN "labourCounts" JSONB;
