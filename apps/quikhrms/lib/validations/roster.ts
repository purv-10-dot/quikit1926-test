import { z } from "zod";

const toDate = (v: string): Date => new Date(v.length === 10 ? `${v}T00:00:00.000Z` : v);

const dateString = z.string().min(1).transform((v, ctx) => {
  const d = toDate(v);
  if (isNaN(d.getTime())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid date" });
    return z.NEVER;
  }
  return d;
});

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

export const createRosterSchema = z
  .object({
    name: z.string().min(1, "Name required"),
    departmentId: z.string().optional(),
    periodStart: dateString,
    periodEnd: dateString,
  })
  .refine((v) => v.periodEnd >= v.periodStart, {
    path: ["periodEnd"],
    message: "End date must be on or after the start date",
  });

/**
 * One cell change. `clear: true` removes the cell; otherwise it is upserted.
 * Only Duty / WeekOff are manually assignable — Leave and Holiday are derived
 * (from approved leave + the holiday calendar) and must never be written here.
 * A Duty requires a shift; a WeekOff must not carry one.
 */
const rosterEntryInput = z.object({
  employeeId: z.string().min(1),
  date: dateString,
  shiftId: z.string().nullish(),
  type: z.enum(["Duty", "WeekOff"]).default("Duty"),
  note: z.string().optional(),
  clear: z.boolean().optional(),
}).superRefine((v, ctx) => {
  if (v.clear) return; // clearing ignores type/shift
  if (v.type === "Duty" && !v.shiftId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["shiftId"], message: "A shift is required for a duty." });
  }
  if (v.type !== "Duty" && v.shiftId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["shiftId"], message: "Only duty entries can have a shift." });
  }
});

export const rosterEntriesSchema = z.object({
  entries: z.array(rosterEntryInput).min(1, "At least one entry required"),
});

export const weeklyOffsSchema = z.object({
  employeeIds: z.array(z.string().min(1)).min(1, "Select at least one employee"),
  days: z.array(z.enum(WEEKDAYS)),
});

export type CreateRosterInput = z.infer<typeof createRosterSchema>;
export type RosterEntriesInput = z.infer<typeof rosterEntriesSchema>;
