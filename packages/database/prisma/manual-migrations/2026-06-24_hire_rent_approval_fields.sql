-- ============================================================================
-- Manual DB migration — add approval-workflow fields to hire/rent records
-- Schema: app_quikinfra   Table: Hire_rent_records   Model: CnHireRentRecord
--
-- Reason: Hire-In Verifications now run through the configured Hire & Rent
-- approval workflow (Submit → Pending → Approve/Reject/Return), mirroring the
-- Equipment Log Book. Status is driven by the workflow and gated by RBAC
-- (workflow steps). These columns persist the link to the approval instance
-- and the submit/approve/reject/return audit stamps.
--
-- This adds (all nullable — existing rows keep NULL):
--   approvalId    — FK (logical) to CnApprovalInstance.id
--   submittedAt / submittedBy
--   approvedAt  / approvedBy
--   rejectedAt  / rejectedBy / rejectReason
--   returnedAt  / returnedBy / returnReason
--
-- Run on BOTH local and the central (production) databases. Idempotent.
--
-- NOTE: after deploying the code, `prisma generate` must run (DB-free) so the
-- client knows the new fields. This SQL is the actual DB change.
-- ============================================================================

ALTER TABLE "app_quikinfra"."Hire_rent_records"
  ADD COLUMN IF NOT EXISTS "approvalId"   TEXT,
  ADD COLUMN IF NOT EXISTS "submittedAt"  TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "submittedBy"  TEXT,
  ADD COLUMN IF NOT EXISTS "approvedAt"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "approvedBy"   TEXT,
  ADD COLUMN IF NOT EXISTS "rejectedAt"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rejectedBy"   TEXT,
  ADD COLUMN IF NOT EXISTS "rejectReason" TEXT,
  ADD COLUMN IF NOT EXISTS "returnedAt"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "returnedBy"   TEXT,
  ADD COLUMN IF NOT EXISTS "returnReason" TEXT;
