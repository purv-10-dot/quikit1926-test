-- Fathom.ai meeting-transcript integration.
-- Adds: WfProvider.fathom (QuikFlow connector), the ClientMeetingTranscript
-- table + its two enums (QuikScale Meeting Rhythm). Purely additive.

-- CreateEnum
CREATE TYPE "app_quikscale"."MeetingTranscriptType" AS ENUM ('DAILY', 'WEEKLY');

-- CreateEnum
CREATE TYPE "app_quikscale"."MeetingTranscriptMatch" AS ENUM ('MATCHED', 'AMBIGUOUS', 'UNMATCHED');

-- AlterEnum
ALTER TYPE "app_quikflow"."WfProvider" ADD VALUE 'fathom';

-- CreateTable
CREATE TABLE "app_quikscale"."ClientMeetingTranscript" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "clientId" TEXT,
    "type" "app_quikscale"."MeetingTranscriptType",
    "meetingDate" TIMESTAMP(3),
    "dailyHuddleId" TEXT,
    "weeklyMeetingId" TEXT,
    "fathomRecordingId" TEXT NOT NULL,
    "title" TEXT,
    "recordingUrl" TEXT,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "durationMinutes" INTEGER,
    "attendees" JSONB,
    "rawText" TEXT,
    "summary" TEXT,
    "actionItems" JSONB,
    "matchStatus" "app_quikscale"."MeetingTranscriptMatch" NOT NULL DEFAULT 'MATCHED',
    "source" TEXT NOT NULL DEFAULT 'fathom',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ClientMeetingTranscript_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientMeetingTranscript_orgId_idx" ON "app_quikscale"."ClientMeetingTranscript"("orgId");

-- CreateIndex
CREATE INDEX "ClientMeetingTranscript_orgId_clientId_type_meetingDate_idx" ON "app_quikscale"."ClientMeetingTranscript"("orgId", "clientId", "type", "meetingDate");

-- CreateIndex
CREATE INDEX "ClientMeetingTranscript_orgId_matchStatus_idx" ON "app_quikscale"."ClientMeetingTranscript"("orgId", "matchStatus");

-- CreateIndex
CREATE INDEX "ClientMeetingTranscript_clientId_idx" ON "app_quikscale"."ClientMeetingTranscript"("clientId");

-- CreateIndex
CREATE INDEX "ClientMeetingTranscript_deletedAt_idx" ON "app_quikscale"."ClientMeetingTranscript"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClientMeetingTranscript_orgId_fathomRecordingId_key" ON "app_quikscale"."ClientMeetingTranscript"("orgId", "fathomRecordingId");

-- AddForeignKey
ALTER TABLE "app_quikscale"."ClientMeetingTranscript" ADD CONSTRAINT "ClientMeetingTranscript_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikscale"."ClientMeetingTranscript" ADD CONSTRAINT "ClientMeetingTranscript_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "app_quikscale"."Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikscale"."ClientMeetingTranscript" ADD CONSTRAINT "ClientMeetingTranscript_dailyHuddleId_fkey" FOREIGN KEY ("dailyHuddleId") REFERENCES "app_quikscale"."ClientDailyHuddle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikscale"."ClientMeetingTranscript" ADD CONSTRAINT "ClientMeetingTranscript_weeklyMeetingId_fkey" FOREIGN KEY ("weeklyMeetingId") REFERENCES "app_quikscale"."ClientWeeklyMeeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;
