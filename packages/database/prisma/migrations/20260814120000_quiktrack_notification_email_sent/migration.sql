-- QuikTrack: mark in-app notifications that were also emailed.
--
-- Adds `emailSent` to QtNotification so the notification panel can show an
-- "emailed" indicator on rows that also triggered an email (assign, status
-- change, mention, project invite, overdue reminder). Defaults to false so
-- existing rows (e.g. checklist_due reminders, which are in-app only) render
-- without the indicator.
--
-- Idempotent (IF NOT EXISTS) so it is safe to run on databases where the
-- column was already added out-of-band.

-- AlterTable
ALTER TABLE "app_quiktrack"."QtNotification"
  ADD COLUMN IF NOT EXISTS "emailSent" BOOLEAN NOT NULL DEFAULT false;
