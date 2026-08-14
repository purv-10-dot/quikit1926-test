-- Critical Numbers — add a Currency selector for measurementUnit = "Currency".
--
-- Adds: currency (optional) — same shape as KPI.currency, same fixed
-- ISO-4217-code list (lib/utils/currency.ts), no FK/enum (KPI's isn't one
-- either). Deliberately NOT paired with KPI's targetScale — out of scope.
--
-- Nullable with no default: safe to add to a table with existing rows,
-- nothing to backfill.
ALTER TABLE "app_quikscale"."CriticalNumber" ADD COLUMN "currency" TEXT;
