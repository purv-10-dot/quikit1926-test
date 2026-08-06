-- Root-cause fix: demo seeding never created Quarter Settings, so every
-- module gated on "quarters configured" (KPI, Priority, WWW, etc.) stayed
-- empty even though demo rows existed underneath. Quarters are now seeded
-- too; this flag just tracks that they were auto-generated (informational —
-- Clear All Demo Data never deletes quarters).

ALTER TABLE "app_quikscale"."QuarterSetting" ADD COLUMN IF NOT EXISTS "isDemoData" BOOLEAN NOT NULL DEFAULT false;
