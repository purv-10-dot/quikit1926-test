-- AI meeting-report columns on ClientMeetingTranscript.
-- Stores the report a user generates + edits + saves from the Export Transcript
-- modal (sections + extracted KPI/Priority/WWW candidates with confidence).
-- Purely additive; all columns nullable so existing rows are untouched.

-- AlterTable
ALTER TABLE "app_quikscale"."ClientMeetingTranscript"
    ADD COLUMN "report" JSONB,
    ADD COLUMN "reportConfidence" DOUBLE PRECISION,
    ADD COLUMN "reportGeneratedAt" TIMESTAMP(3),
    ADD COLUMN "reportGeneratedBy" TEXT,
    ADD COLUMN "reportUpdatedAt" TIMESTAMP(3),
    ADD COLUMN "reportUpdatedBy" TEXT;
