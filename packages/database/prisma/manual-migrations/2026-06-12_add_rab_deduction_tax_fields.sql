-- ============================================================================
-- Manual DB migration — add RA Bill deduction / tax / lifecycle fields
-- Schema: app_quikinfra   Table: Running_account_bills   Model: CnRunningAccountBill
--
-- Reason: the RA Bill module (Phase 0) needs the full deduction waterfall and
-- bill metadata on the header. The table previously had only retentionPercent /
-- retentionAmount, a single lump `deductions`, and netPayable — not enough to
-- store the GST (CGST/SGST/IGST) add-on, TDS, and the per-line statutory
-- deductions that computeRABill() will produce, nor billType / paymentStatus.
--
-- This adds:
--   billType            (default 'ra_bill')   — ra_bill | final_bill | deviation_bill
--   grossBillAmount      (default 0)           — Σ line.currentAmount before tax/deductions
--   tds/cgst/sgst/igst   rate + amount         — GST is ADDED; TDS is a deduction
--   mobilisationRecovery, liquidatedDamages, labourCess, otherDeductions
--   paymentStatus        (default 'unpaid')    — unpaid | partial | paid
--
-- The legacy `deductions` column is left in place for existing rows. All new
-- money/rate columns are nullable (existing rows get NULL), except billType,
-- grossBillAmount and paymentStatus which take safe defaults.
--
-- Run on BOTH local and the central (production) databases. Idempotent.
--
-- NOTE: after deploying the code, `prisma generate` must run (DB-free) so the
-- client knows the new fields. This SQL is the actual DB change.
-- ============================================================================

ALTER TABLE "app_quikinfra"."Running_account_bills"
  ADD COLUMN IF NOT EXISTS "billType"             text           NOT NULL DEFAULT 'ra_bill',
  ADD COLUMN IF NOT EXISTS "grossBillAmount"      numeric(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "tdsRate"              numeric(5, 2),
  ADD COLUMN IF NOT EXISTS "tdsAmount"            numeric(18, 2),
  ADD COLUMN IF NOT EXISTS "cgstRate"             numeric(5, 2),
  ADD COLUMN IF NOT EXISTS "cgstAmount"           numeric(18, 2),
  ADD COLUMN IF NOT EXISTS "sgstRate"             numeric(5, 2),
  ADD COLUMN IF NOT EXISTS "sgstAmount"           numeric(18, 2),
  ADD COLUMN IF NOT EXISTS "igstRate"             numeric(5, 2),
  ADD COLUMN IF NOT EXISTS "igstAmount"           numeric(18, 2),
  ADD COLUMN IF NOT EXISTS "mobilisationRecovery" numeric(18, 2),
  ADD COLUMN IF NOT EXISTS "liquidatedDamages"    numeric(18, 2),
  ADD COLUMN IF NOT EXISTS "labourCess"           numeric(18, 2),
  ADD COLUMN IF NOT EXISTS "otherDeductions"      numeric(18, 2),
  ADD COLUMN IF NOT EXISTS "paymentStatus"        text           NOT NULL DEFAULT 'unpaid';
