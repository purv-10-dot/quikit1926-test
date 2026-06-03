import { z } from "zod";
import { filterPayloadSchema } from "@/lib/validators/lead-filter";
import { pageSchema, pageSizeSchema } from "@/lib/validators/pagination";
import { ACTIVITY_PRIMARY_KINDS } from "@/lib/services/activities/target-existence";
import {
  LEAD_LOG_ACTIVITY_CODES,
  LEAD_LOG_OUTCOMES,
} from "@/lib/services/activities/lead-log-meta";
import {
  SMB_OUTREACH_CHANNELS,
  SMB_OUTREACH_COMPETITORS,
  SMB_OUTREACH_COUNTRIES,
  SMB_OUTREACH_PRIORITIES,
} from "@/lib/services/activities/smb-outreach-meta";

const relatedKindEnum = z.enum(ACTIVITY_PRIMARY_KINDS);

const isoDate = z.string().datetime();

export const createActivitySchema = z.object({
  type: z.string().trim().min(1).max(80),
  relatedKind: relatedKindEnum,
  relatedObjectId: z.string().trim().min(1),
  subject: z.string().trim().max(500).optional().nullable(),
  outcome: z.string().trim().max(500).optional().nullable(),
  occurredAt: isoDate.optional().nullable(),
  detailNotes: z.string().trim().max(5000).optional().nullable(),
  followUpAt: isoDate.optional().nullable(),
  leadId: z.string().trim().min(1).optional().nullable(),
  opportunityId: z.string().trim().min(1).optional().nullable(),
  ownerId: z.string().trim().min(1).optional().nullable(),
  outreach: z.record(z.unknown()).optional(),
  externalId: z.string().trim().max(200).optional().nullable(),
  sourceSystem: z.string().trim().max(80).optional().nullable(),
});

export const updateActivitySchema = z.object({
  type: z.string().trim().min(1).max(80).optional(),
  relatedKind: relatedKindEnum.optional(),
  relatedObjectId: z.string().trim().min(1).optional(),
  subject: z.string().trim().max(500).optional().nullable(),
  outcome: z.string().trim().max(500).optional().nullable(),
  occurredAt: isoDate.optional().nullable(),
  detailNotes: z.string().trim().max(5000).optional().nullable(),
  followUpAt: isoDate.optional().nullable(),
  ownerId: z.string().trim().min(1).optional().nullable(),
  outreach: z.record(z.unknown()).optional(),
});

export const leadLogSchema = z.object({
  leadId: z.string().trim().min(1),
  activityCode: z.enum(LEAD_LOG_ACTIVITY_CODES),
  logOutcome: z.enum(LEAD_LOG_OUTCOMES),
  detailNotes: z.string().trim().max(5000).optional(),
  followUpAt: isoDate.optional(),
  opportunityId: z.string().trim().min(1).optional(),
  ownerId: z.string().trim().min(1).optional(),
});

export const smbOutreachSchema = z.object({
  leadId: z.string().trim().min(1),
  country: z.enum(SMB_OUTREACH_COUNTRIES),
  followupPriority: z.enum(SMB_OUTREACH_PRIORITIES),
  channel: z.enum(SMB_OUTREACH_CHANNELS),
  competitor: z.enum(SMB_OUTREACH_COMPETITORS),
  competitorDetails: z.string().trim().max(500).optional(),
  currentSystemDetails: z.string().trim().max(500).optional(),
  disposition: z.string().trim().min(1),
  subDisposition: z.string().trim().min(1),
  subSubDisposition: z.string().trim().min(1),
  detailNotes: z.string().trim().max(5000),
  scheduledAt: isoDate.optional().nullable(),
  ownerId: z.string().trim().min(1).optional(),
});

export const activityFilterRequestSchema = z.object({
  filter: filterPayloadSchema,
  page: pageSchema,
  pageSize: pageSizeSchema,
  sortBy: z.string().default("occurredAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export type CreateActivityInput = z.infer<typeof createActivitySchema>;
export type UpdateActivityInput = z.infer<typeof updateActivitySchema>;
export type LeadLogInput = z.infer<typeof leadLogSchema>;
export type SmbOutreachInput = z.infer<typeof smbOutreachSchema>;
export type ActivityFilterRequest = z.infer<typeof activityFilterRequestSchema>;

export const SORTABLE_ACTIVITY_KEYS = new Set([
  "occurredAt",
  "createdAt",
  "updatedAt",
  "type",
  "ownerName",
  "subject",
]);
