-- Per-RFQ Terms & Conditions snapshot, plus per-vendor overrides.
--
-- The RFQ create drawer seeds `Rfqs.termsAndConditions` from the picked
-- T&C template and lets the raiser edit it — that edit is stamped on the
-- RFQ only, never written back to the master template
-- (app_quikinfra.cn_terms_conditions).
--
-- Each vendor row on `Rfq_vendors` can additionally override that RFQ
-- default with vendor-specific terms (e.g. a different payment term for
-- one supplier); null/empty means "use the RFQ default". Purchase orders
-- already carry the equivalent header-level column.

ALTER TABLE app_quikinfra."Rfqs"
  ADD COLUMN IF NOT EXISTS "termsAndConditions" TEXT;

ALTER TABLE app_quikinfra."Rfq_vendors"
  ADD COLUMN IF NOT EXISTS "termsAndConditions" TEXT,
  ADD COLUMN IF NOT EXISTS "termsTemplateId" TEXT;
