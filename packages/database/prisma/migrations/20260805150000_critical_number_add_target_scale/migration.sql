-- Critical Numbers — add the K/L/Cr/M display-scale selector for Currency
-- metrics. Same shape as KPI.targetScale, currency-aware list
-- (lib/utils/currency.ts getScales), no separate scaledDisplay toggle —
-- display-scaling is always applied here once a scale is chosen.
--
-- Nullable with no default: safe to add to a table with existing rows,
-- nothing to backfill.
ALTER TABLE "app_quikscale"."CriticalNumber" ADD COLUMN "targetScale" TEXT;
