import { z } from "zod";

// Minimum loggable duration = 1 minute (1/60 h). Matches what
// parseClockToHours("00:01") yields exactly, so a 1-minute entry validates
// cleanly. Previously this was 0.25 h (15 min), which silently blocked short
// entries like "00:10" on the Log time form while the edit path let them
// through — an inconsistency. Any positive sub-15-minute duration is now valid.
export const MIN_TIMESHEET_HOURS = 1 / 60;

export const createTimesheetSchema = z.object({
  issueId: z.string().min(1),
  entryDate: z.string().datetime(),
  hours: z
    .number()
    .min(MIN_TIMESHEET_HOURS, "Time must be at least 1 minute (00:01).")
    .max(24, "Time can't exceed 24 hours (24:00)."),
  description: z.string().max(2000).optional(),
});

export const updateTimesheetSchema = createTimesheetSchema.partial();
