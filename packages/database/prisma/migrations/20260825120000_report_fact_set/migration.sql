-- The persisted Meeting Fact Set (doc 17 §R2).
--
-- WHY THIS EXISTS
-- ---------------
-- `metrics` already gives a rollup a bounded NUMERIC snapshot, and it is why a
-- monthly report costs ~5k tokens instead of 1.4M. But numbers alone cannot
-- answer "which blocker recurred all month" or "who keeps reporting No Stuck",
-- so the monthly path went back to the raw fact tables and pulled a month of
-- rows into memory to find out.
--
-- That works at four weeks and does not scale: it is the same unbounded
-- collection that chunked extraction exists to avoid, one level up. A quarterly
-- or annual view over the same code would read a year of facts.
--
-- So each report also stores a bounded QUALITATIVE digest — recurrence keys,
-- per-member rates, topics, and what the digest itself left out. A week, month,
-- quarter and year then all consume the same compact shape, and a rollup's cost
-- grows with the number of REPORTS rather than the number of facts.
--
-- Nullable with no default, deliberately. A report generated before this column
-- existed has no digest, and NULL is the honest representation of that: readers
-- fall back to the fact tables rather than reporting an empty period.
--
-- Derived data. The fact tables remain the audit trail and the evidence
-- drawer's source; regenerating a report rebuilds its digest from them.
--
-- Additive only. Safe to apply while the app is running.

ALTER TABLE "app_quikscale"."ClientWeeklyMeetingReport"
  ADD COLUMN IF NOT EXISTS "factSet" JSONB;

ALTER TABLE "app_quikscale"."ClientDailyHuddleWeeklyReport"
  ADD COLUMN IF NOT EXISTS "factSet" JSONB;
