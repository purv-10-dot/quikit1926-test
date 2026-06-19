import { z } from "zod";

// ─── Attendance Record ──────────────────────────────────

export const checkInSchema = z.object({
  location: z.object({
    lat: z.number(),
    lng: z.number(),
    address: z.string().optional(),
  }).optional(),
  ipAddress: z.string().optional(),
  source: z.enum(["Web", "Mobile", "Biometric", "Manual"]).default("Web"),
  remarks: z.string().optional(),
});

export const checkOutSchema = z.object({
  location: z.object({
    lat: z.number(),
    lng: z.number(),
    address: z.string().optional(),
  }).optional(),
  remarks: z.string().optional(),
});

export const regularizationSchema = z.object({
  date: z.string().min(1, "Date required"),
  checkIn: z.string().optional(),
  checkOut: z.string().optional(),
  reason: z.string().min(1, "Reason required"),
});

export const regularizationActionSchema = z.object({
  status: z.enum(["Approved", "Rejected"]),
  comment: z.string().optional(),
});

// ─── Attendance Policy ──────────────────────────────────

export const createAttendancePolicySchema = z.object({
  name: z.string().min(1, "Name required"),
  applicableTo: z.object({
    departments: z.array(z.string()).optional(),
    locations: z.array(z.string()).optional(),
    employmentTypes: z.array(z.string()).optional(),
  }).optional(),
  graceMinutes: z.number().int().default(15),
  halfDayThresholdHours: z.number().default(4),
  fullDayThresholdHours: z.number().default(8),
  minHoursForOvertime: z.number().default(9),
  ipWhitelist: z.array(z.string()).optional(),
  geoFenceRadius: z.number().int().optional(),
  geoFenceCoordinates: z.array(z.object({ lat: z.number(), lng: z.number() })).optional(),
  allowWebCheckin: z.boolean().default(true),
  allowMobileCheckin: z.boolean().default(true),
  requireLocationForMobile: z.boolean().default(false),
  latePenalization: z.object({
    occurrences: z.number().int(),
    period: z.enum(["Month", "Quarter"]),
    action: z.enum(["DeductLeave", "HalfDaySalary", "Warning"]),
  }).optional(),
  absentPenalization: z.object({
    consecutiveDays: z.number().int(),
    action: z.enum(["DeductSalary", "AutoLeave", "Notification"]),
  }).optional(),
  allowRegularization: z.boolean().default(true),
  regularizationApprovalLevels: z.number().int().default(1),
  maxRegularizationsPerMonth: z.number().int().default(3),
  isDefault: z.boolean().default(false),
});

export const updateAttendancePolicySchema = createAttendancePolicySchema.partial();

export type CheckInInput = z.infer<typeof checkInSchema>;
export type CheckOutInput = z.infer<typeof checkOutSchema>;
export type CreateAttendancePolicyInput = z.infer<typeof createAttendancePolicySchema>;
