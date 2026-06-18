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

const optionalDateString = z.string().optional().transform((v, ctx) => {
  if (!v) return undefined;
  const d = toDate(v);
  if (isNaN(d.getTime())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid date" });
    return z.NEVER;
  }
  return d;
});

// Returns shift duration in minutes, accounting for night shifts that wrap midnight.
// Returns null if either time is malformed.
function shiftDurationMinutes(start: string, end: string, isNightShift: boolean): number | null {
  const m = /^(\d{1,2}):(\d{2})$/;
  const s = m.exec(start);
  const e = m.exec(end);
  if (!s || !e) return null;
  const sMin = Number(s[1]) * 60 + Number(s[2]);
  let eMin = Number(e[1]) * 60 + Number(e[2]);
  if (isNightShift && eMin <= sMin) eMin += 24 * 60;
  return eMin - sMin;
}

const MIN_SHIFT_MINUTES = 4 * 60;

export const createShiftPolicySchema = z.object({
  name: z.string().min(1, "Name required"),
  code: z.string().min(1, "Code required"),
  color: z.string().optional(),
  startTime: z.string().min(1, "Start time required"),
  endTime: z.string().min(1, "End time required"),
  breakDuration: z.number().int().nullish().transform((v) => v ?? 60),
  breakStartTime: z.string().optional(),
  breakEndTime: z.string().optional(),
  graceMinutes: z.number().int().nullish().transform((v) => v ?? 15),
  minHoursRequired: z.number().nullish().transform((v) => v ?? 8),
  isFlexible: z.boolean().default(false),
  flexibleWindowStart: z.string().optional(),
  flexibleWindowEnd: z.string().optional(),
  isNightShift: z.boolean().default(false),
  weekOffs: z.array(z.enum(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"])).optional(),
  effectiveFrom: dateString,
  effectiveTo: optionalDateString,
  isDefault: z.boolean().default(false),
})
  .refine((v) => v.startTime !== v.endTime, {
    path: ["endTime"],
    message: "Start time and end time cannot be the same",
  })
  .refine(
    (v) => {
      const dur = shiftDurationMinutes(v.startTime, v.endTime, v.isNightShift);
      return dur != null && dur >= MIN_SHIFT_MINUTES;
    },
    {
      path: ["endTime"],
      message: "Shift must be at least 4 hours. For night shifts, enable the 'Night Shift' flag.",
    },
  );

export const updateShiftPolicySchema = z.object({
  name: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
  color: z.string().optional(),
  startTime: z.string().min(1).optional(),
  endTime: z.string().min(1).optional(),
  breakDuration: z.number().int().nullish().transform((v) => v ?? undefined),
  breakStartTime: z.string().optional(),
  breakEndTime: z.string().optional(),
  graceMinutes: z.number().int().nullish().transform((v) => v ?? undefined),
  minHoursRequired: z.number().nullish().transform((v) => v ?? undefined),
  isFlexible: z.boolean().optional(),
  flexibleWindowStart: z.string().optional(),
  flexibleWindowEnd: z.string().optional(),
  isNightShift: z.boolean().optional(),
  weekOffs: z.array(z.enum(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"])).optional(),
  effectiveFrom: optionalDateString,
  effectiveTo: optionalDateString,
  isDefault: z.boolean().optional(),
})
  .refine((v) => !(v.startTime && v.endTime) || v.startTime !== v.endTime, {
    path: ["endTime"],
    message: "Start time and end time cannot be the same",
  })
  .refine(
    (v) => {
      if (!v.startTime || !v.endTime) return true;
      const dur = shiftDurationMinutes(v.startTime, v.endTime, v.isNightShift ?? false);
      return dur != null && dur >= MIN_SHIFT_MINUTES;
    },
    {
      path: ["endTime"],
      message: "Shift must be at least 4 hours. For night shifts, enable the 'Night Shift' flag.",
    },
  );

export const createShiftAssignmentSchema = z.object({
  employeeId: z.string().min(1, "Employee required"),
  shiftId: z.string().min(1, "Shift required"),
  effectiveFrom: dateString,
  effectiveTo: optionalDateString,
  isRotating: z.boolean().default(false),
  rotationPattern: z.unknown().optional(),
});

/**
 * Assign a shift to one or many employees. `employeeIds` is preferred (bulk);
 * `employeeId` kept for backward compatibility. When neither is given, the API
 * assigns to the caller themselves.
 */
export const bulkShiftAssignmentSchema = z.object({
  employeeIds: z.array(z.string().min(1)).optional(),
  employeeId: z.string().min(1).optional(),
  shiftId: z.string().min(1, "Shift required"),
  effectiveFrom: dateString,
  effectiveTo: optionalDateString,
  isRotating: z.boolean().default(false),
  rotationPattern: z.unknown().optional(),
});

export const updateShiftAssignmentSchema = z.object({
  employeeId: z.string().min(1).optional(),
  shiftId: z.string().min(1).optional(),
  effectiveFrom: optionalDateString,
  effectiveTo: optionalDateString,
  isRotating: z.boolean().optional(),
  rotationPattern: z.unknown().optional(),
});

export type CreateShiftPolicyInput = z.infer<typeof createShiftPolicySchema>;
export type CreateShiftAssignmentInput = z.infer<typeof createShiftAssignmentSchema>;
