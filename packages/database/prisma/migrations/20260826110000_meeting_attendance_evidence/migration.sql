-- Attendance evidence: Teams join times, and where an attendee list came from.
--
-- WHY THIS EXISTS
-- ---------------
-- The Daily Huddle / Weekly Meeting reports have to name who was absent. Today
-- they cannot, for two reasons this migration removes.
--
-- 1. NO JOIN-TIME SOURCE. Doc 15 §4.3-4.5 specifies an attendance tier built on
--    Microsoft Graph's attendance report — join/leave times per participant.
--    That is the only signal that can prove ABSENCE (Graph returns a COMPLETE
--    list of who joined, so a required invitee missing from it was genuinely
--    not there) and the only one with a duration, which is what separates
--    "attended" from "dialled in for ninety seconds". Every other signal can
--    only ever prove presence.
--
--    `ClientMeetingAttendance` caches one report per occurrence. Cached, not
--    re-queried, because Microsoft's retention of these reports is limited: a
--    report we do not keep is gone for good. The `kind` + `meetingDate` unique
--    key is load-bearing — a recurring huddle stacks EVERY occurrence's report
--    under one `onlineMeeting` id, so "the latest report" would attach today's
--    attendance to an old week and mark that week's attendees absent.
--
-- 2. AN ATTENDEE LIST THAT CANNOT SAY WHAT IT PROVES.
--    `ClientMeetingTranscript.attendees` holds a participant list, but nothing
--    records where it came from, and the two sources prove different things. A
--    human ticking the list on upload is authoritative in BOTH directions —
--    anyone not on it was absent — exactly like a human-logged huddle. A
--    recorder-derived list only proves presence, and must clear a coverage gate
--    before absence may be inferred from it. Without the discriminator both
--    collapse to the weaker reading, and a manual upload can never produce an
--    ABSENT verdict: everyone who did not speak reads "—" instead.
--
--    NULL means "fathom" — that is what every existing row is.
--
-- Additive only. Safe to apply while the app is running.

ALTER TABLE "app_quikscale"."ClientMeetingTranscript"
  ADD COLUMN IF NOT EXISTS "attendeesSource" TEXT;

CREATE TABLE IF NOT EXISTS "app_quikscale"."ClientMeetingAttendance" (
  "id"           TEXT         NOT NULL,
  "orgId"        TEXT         NOT NULL,
  "clientId"     TEXT         NOT NULL,
  "meetingDate"  TIMESTAMP(3) NOT NULL,
  "kind"         TEXT         NOT NULL,
  "source"       TEXT         NOT NULL DEFAULT 'teams',
  "meetingStart" TIMESTAMP(3),
  "meetingEnd"   TIMESTAMP(3),
  "records"      JSONB        NOT NULL,
  "fetchedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ClientMeetingAttendance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ClientMeetingAttendance_orgId_clientId_meetingDate_kind_key"
  ON "app_quikscale"."ClientMeetingAttendance" ("orgId", "clientId", "meetingDate", "kind");

CREATE INDEX IF NOT EXISTS "ClientMeetingAttendance_orgId_clientId_idx"
  ON "app_quikscale"."ClientMeetingAttendance" ("orgId", "clientId");

ALTER TABLE "app_quikscale"."ClientMeetingAttendance"
  DROP CONSTRAINT IF EXISTS "ClientMeetingAttendance_clientId_fkey";

ALTER TABLE "app_quikscale"."ClientMeetingAttendance"
  ADD CONSTRAINT "ClientMeetingAttendance_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "app_quikscale"."Client"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
