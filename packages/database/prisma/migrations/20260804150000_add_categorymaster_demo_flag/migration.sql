-- Gap fix: Category Mgmt (OPSP category master) was never included in demo
-- seeding — a genuine omission, not a display bug like the quarter-default
-- issues fixed in this same round. Adds the isDemoData flag so it can be
-- seeded and cleared consistently with every other module.

ALTER TABLE "app_quikscale"."CategoryMaster" ADD COLUMN IF NOT EXISTS "isDemoData" BOOLEAN NOT NULL DEFAULT false;
