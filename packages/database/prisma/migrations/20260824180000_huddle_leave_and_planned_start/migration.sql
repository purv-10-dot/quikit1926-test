-- AI Meeting Rhythm — Phase 3: approved leave, and per-day planned start.
--
-- See docs/17-ai-meeting-rhythm-architecture.md sections E.2, and the client
-- requirement doc's attendance rules.
--
-- FULLY ADDITIVE AND BACKFILL-SAFE.
--   * Three nullable columns. Nothing existing is dropped, renamed or re-typed.
--   * No data migration. Null preserves today's behaviour exactly on every
--     existing row: an absence with no reason reads as UNKNOWN (scored as it is
--     today), and a huddle with no override uses the client's standing schedule
--     (exactly what happens now).
--   * Rollback is a DROP of the three columns.

-- ---------------------------------------------------------------------------
-- 1. ClientDailyHuddleTeamAbsence.absenceReason
--
-- PLANNED_LEAVE | UNPLANNED | UNKNOWN.
--
-- The requirement doc insists in five separate places that approved leave is
-- NOT an attendance-discipline issue, and that a member is evaluated only on
-- the huddles they were actually expected at. Without this column every absence
-- looks identical, so a member on approved leave is scored exactly like one who
-- simply did not turn up.
--
-- lib/ai/weeklyHuddleAggregate.ts already accepts an `onLeave` map and renders
-- an NA_LEAVE cell excluded from the denominator — that parameter was plumbed
-- through computeDeterministicWeek but had NO DATA SOURCE. This is the source.
-- ---------------------------------------------------------------------------
ALTER TABLE "app_quikscale"."ClientDailyHuddleTeamAbsence"
  ADD COLUMN "absenceReason" TEXT;

-- ---------------------------------------------------------------------------
-- 2. ClientDailyHuddle.plannedStartOverride / plannedEndOverride
--
-- Per-occurrence planned times (HH:mm), for the days a huddle's slot differed
-- from the client's standing schedule.
--
-- This answers a question the client asked directly in the requirement doc:
-- "How do we capture meetings that start on time if meeting time is changed for
-- a particular day?"
--
-- Punctuality is actualStartTime measured against the PLANNED start. With only
-- Client.dailyStartTime to compare against, a huddle deliberately moved from
-- 09:30 to 10:30 is scored 60 minutes late — a team that communicated a change
-- well is punished for it, and the "Meeting started on time" figure in section
-- 4.2 of the report becomes least trustworthy exactly when the team is being
-- most organised.
-- ---------------------------------------------------------------------------
ALTER TABLE "app_quikscale"."ClientDailyHuddle"
  ADD COLUMN "plannedStartOverride" TEXT,
  ADD COLUMN "plannedEndOverride"   TEXT;
