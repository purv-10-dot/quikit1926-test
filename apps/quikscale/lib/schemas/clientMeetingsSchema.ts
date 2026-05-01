import { z } from "zod";

/**
 * Shared Zod schemas for the Client Meetings module (Meeting Rhythm rewrite).
 *
 * Conventions:
 *   - HH:mm strings use a strict 24-hour regex — both backend validation and
 *     frontend `<input type="time">` round-trip correctly.
 *   - Date inputs accept ISO timestamps OR plain YYYY-MM-DD (HTML date picker);
 *     routes reparse server-side to kill timezone drift.
 */

const TIME_24H = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_ISO_OR_YMD = /^\d{4}-\d{2}-\d{2}(T.*)?$/;

export const CLIENT_MEETING_FLAGS = ["YES", "NO", "NA"] as const;
export const CLIENT_MEETING_STATUSES = [
  "HELD",
  "NOT_HELD",
  "CALL_CANCELLED_BY_CLIENT",
  "HOLIDAY_FOR_CLIENT",
  "HOLIDAY_FOR_SUCCESS_ALCHEMIST",
] as const;

export const flagSchema = z.enum(CLIENT_MEETING_FLAGS);
export const statusSchema = z.enum(CLIENT_MEETING_STATUSES);

/* ─── Client (master) ───────────────────────────────────────────────────────── */

export const createClientSchema = z.object({
  name: z.string().trim().min(1, "Client name is required").max(200),
  description: z.string().max(5000).optional().nullable(),
  isActive: z.boolean().default(true),
  startDate: z.string().regex(DATE_ISO_OR_YMD).optional().nullable(),
  weeklyStartTime: z.string().regex(TIME_24H).optional().nullable(),
  weeklyEndTime: z.string().regex(TIME_24H).optional().nullable(),
  dailyStartTime: z.string().regex(TIME_24H).optional().nullable(),
  dailyEndTime: z.string().regex(TIME_24H).optional().nullable(),
  /// IDs of ClientMember rows that should be on this client's roster.
  teamMemberIds: z.array(z.string()).default([]),
});

export const updateClientSchema = createClientSchema.partial();

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;

/* ─── Client Member (flat entity) ───────────────────────────────────────────── */

export const createClientMemberSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  email: z.string().trim().toLowerCase().email("Invalid email").max(200),
});

export const updateClientMemberSchema = createClientMemberSchema.partial();

export type CreateClientMemberInput = z.infer<typeof createClientMemberSchema>;
export type UpdateClientMemberInput = z.infer<typeof updateClientMemberSchema>;

/* ─── Client Membership (tenant-user ↔ client) ──────────────────────────────── */

export const createMembershipSchema = z.object({
  userId: z.string().min(1),
  clientRole: z.string().max(100).optional().nullable(),
});

export const updateMembershipSchema = z.object({
  clientRole: z.string().max(100).optional().nullable(),
});

export type CreateMembershipInput = z.infer<typeof createMembershipSchema>;

/* ─── Daily Huddle ──────────────────────────────────────────────────────────── */

export const createDailyHuddleSchema = z.object({
  clientId: z.string().min(1),
  meetingDate: z.string().regex(DATE_ISO_OR_YMD),
  callStatus: statusSchema.default("HELD"),
  actualStartTime: z.string().regex(TIME_24H).optional().nullable(),
  actualEndTime: z.string().regex(TIME_24H).optional().nullable(),
  /// Three YES/NO radios from image 1. Persisted via existing YES/NO/NA enum:
  /// YES == true, NO == false, unset/default NA. Dashboard math already
  /// counts NA the same as YES (see clientMeetingsMath.ts).
  format1Status: flagSchema.default("NA"), // Yesterday's Achievements
  format2Status: flagSchema.default("NA"), // Today's Priority
  stuckCallStatus: flagSchema.default("NA"), // Stuck Issues
  punctualityOverride: flagSchema.default("NA"),
  totalMembers: z.number().int().min(0).default(0),
  notes: z.string().max(5000).optional().nullable(),
  notesKPDashboard: z.string().max(10000).optional().nullable(),
  otherNotes: z.string().max(10000).optional().nullable(),
  /// Legacy tenant-user absences (dashboard math still reads these).
  absentUserIds: z.array(z.string()).default([]),
  /// New external-roster absences (ClientMember ids).
  absentClientMemberIds: z.array(z.string()).default([]),
});

// `partial()` omits defaults, but the fields are still present with
// `undefined` — the route handler branches on that sentinel when deciding
// whether to replace the absentees / notes fields.
export const updateDailyHuddleSchema = createDailyHuddleSchema.partial();

export type CreateDailyHuddleInput = z.infer<typeof createDailyHuddleSchema>;
export type UpdateDailyHuddleInput = z.infer<typeof updateDailyHuddleSchema>;

/* ─── Weekly Meeting ────────────────────────────────────────────────────────── */

export const createWeeklyMeetingSchema = z.object({
  clientId: z.string().min(1),
  meetingDate: z.string().regex(DATE_ISO_OR_YMD),
  callStatus: statusSchema.default("HELD"),
  actualStartTime: z.string().regex(TIME_24H).optional().nullable(),
  actualEndTime: z.string().regex(TIME_24H).optional().nullable(),
  segmentTime1: z.string().regex(TIME_24H).optional().nullable(),
  segmentTime2: z.string().regex(TIME_24H).optional().nullable(),
  segmentTime3: z.string().regex(TIME_24H).optional().nullable(),
  segmentTime4: z.string().regex(TIME_24H).optional().nullable(),
  segmentTime5: z.string().regex(TIME_24H).optional().nullable(),
  segmentTime6: z.string().regex(TIME_24H).optional().nullable(),
  segmentTime7: z.string().regex(TIME_24H).optional().nullable(),
  goodNewsSharing: flagSchema.default("NA"),
  kpDashboard: flagSchema.default("NA"),
  gaps: flagSchema.default("NA"),
  www: flagSchema.default("NA"),
  feedback: flagSchema.default("NA"),
  collectiveIntelligence: flagSchema.default("NA"),
  opspReview: flagSchema.default("NA"),
  notesKPDashboard: z.string().max(20000).optional().nullable(),
  otherNotes: z.string().max(20000).optional().nullable(),
  /// Tenant-user absences (legacy). Empty in most modern tenants.
  absentUserIds: z.array(z.string()).default([]),
  dashboardNAUserIds: z.array(z.string()).default([]),
  /// External-roster absences (ClientMember ids). This is what the new
  /// Absent Members + Weekly Dashboard NA pickers send.
  absentClientMemberIds: z.array(z.string()).default([]),
  dashboardNAClientMemberIds: z.array(z.string()).default([]),
});

export const updateWeeklyMeetingSchema = createWeeklyMeetingSchema.partial();

/// Per-member KPI scores (Update tab grid in image 1).
export const weeklyMemberScoreSchema = z.object({
  userId: z.string().min(1),
  kpiWeeklyQTD: z.number().min(0).max(100).default(0),
  kpiCoding: z.number().min(0).max(100).default(0),
  priorityNotes: z.number().min(0).max(100).default(0),
  priorityStartEndDate: z.number().min(0).max(100).default(0),
  priorityColor: z.number().min(0).max(100).default(0),
});

/// PATCH body for a single member's scores. userId comes from URL, not body.
export const updateMemberScoreSchema = weeklyMemberScoreSchema.omit({ userId: true }).partial();

export type WeeklyMemberScoreInput = z.infer<typeof weeklyMemberScoreSchema>;
export type UpdateMemberScoreInput = z.infer<typeof updateMemberScoreSchema>;

export type CreateWeeklyMeetingInput = z.infer<
  typeof createWeeklyMeetingSchema
>;
export type UpdateWeeklyMeetingInput = z.infer<
  typeof updateWeeklyMeetingSchema
>;
