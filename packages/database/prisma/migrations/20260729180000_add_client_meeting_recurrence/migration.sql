-- Client Master meeting recurrence (Teams calendar series).
-- Adds the weekday + until fields that drive the recurring Teams events created
-- by QuikFlow: weeklyDay (weekly meeting day), dailyDays (daily huddle days,
-- empty ⇒ Mon–Fri), meetingUntil (recurrence end). Purely additive, nullable.

-- AlterTable
ALTER TABLE "app_quikscale"."Client" ADD COLUMN     "weeklyDay" TEXT,
ADD COLUMN     "dailyDays" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "meetingUntil" TIMESTAMP(3);
