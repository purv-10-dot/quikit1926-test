import { z } from "zod";

// ─── Social Post ────────────────────────────────────────

const mediaItemSchema = z.object({
  type: z.enum(["image", "video"]),
  url: z.string().min(1),
  fileName: z.string().optional(),
  mimeType: z.string().optional(),
});

const pollDataSchema = z.object({
  question: z.string().min(1),
  options: z.array(z.object({
    id: z.string().min(1),
    text: z.string().min(1),
    votes: z.array(z.string()).default([]),
  })).min(2).max(10),
  allowMultiple: z.boolean().optional().default(false),
  closesAt: z.string().optional().nullable(),
});

export const createSocialPostSchema = z.object({
  type: z.enum(["Update", "Announcement", "RecognitionPost", "Birthday", "WorkAnniversary", "NewJoiner", "Poll", "Event"]).default("Update"),
  content: z.string().default(""),
  attachments: z.union([z.array(z.string()), z.array(mediaItemSchema)]).optional(),
  pollData: pollDataSchema.optional(),
  visibility: z.enum(["Organization", "Department", "Team", "Custom"]).default("Organization"),
  scheduledAt: z.string().optional(),
}).refine(
  (d) => d.content.trim().length > 0 || (d.attachments && d.attachments.length > 0) || !!d.pollData,
  { message: "Post must have content, attachment or poll", path: ["content"] },
).superRefine((d, ctx) => {
  if (!d.attachments || d.attachments.length === 0) return;
  if (typeof d.attachments[0] === "string") return;
  const imageCount = d.attachments.filter((item) => (item as { type?: string }).type === "image").length;
  if (imageCount > 5) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A post may contain at most 5 images.", path: ["attachments"] });
  }
});

export const createCommentSchema = z.object({
  content: z.string().min(1, "Comment required"),
});

// ─── Announcement ───────────────────────────────────────

export const createAnnouncementSchema = z.object({
  title: z.string().min(1, "Title required"),
  content: z.string().min(1, "Content required"),
  attachments: z.array(z.string()).optional(),
  visibility: z.enum(["Organization", "Department", "Team", "Custom"]).default("Organization"),
  targetDepartments: z.array(z.string()).optional(),
  targetLocations: z.array(z.string()).optional(),
  isPinned: z.boolean().default(false),
  publishedAt: z.string().optional(),
  expiresAt: z.string().optional(),
});

export const updateAnnouncementSchema = createAnnouncementSchema.partial();

// ─── Survey ─────────────────────────────────────────────

export const createSurveySchema = z.object({
  title: z.string().min(1, "Title required"),
  type: z.enum(["Engagement", "PulseCheck", "Exit", "Onboarding", "Custom", "ENPS"]).default("Engagement"),
  questions: z.array(z.object({
    text: z.string().min(1),
    type: z.enum(["SurveyRating", "SurveyScale", "MultiChoice", "SingleChoice", "FreeText", "NPS", "Matrix"]),
    options: z.array(z.string()).optional(),
    scale: z.object({ min: z.number(), max: z.number(), labels: z.array(z.string()).optional() }).optional(),
    isRequired: z.boolean().default(true),
    category: z.string().optional(),
  })).min(1),
  audience: z.object({
    departments: z.array(z.string()).optional(),
    locations: z.array(z.string()).optional(),
    employmentTypes: z.array(z.string()).optional(),
  }).optional(),
  isAnonymous: z.boolean().default(true),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  recurrence: z.string().optional(),
});

export const updateSurveySchema = z.object({
  status: z.enum(["SurveyDraft", "SurveyActive", "SurveyClosed", "SurveyAnalysed"]).optional(),
  title: z.string().optional(),
});

export const surveyResponseSchema = z.object({
  answers: z.array(z.object({
    questionIndex: z.number().int(),
    value: z.unknown(),
  })).min(1),
});

// ─── Recognition ────────────────────────────────────────

export const createRecognitionSchema = z.object({
  toEmployeeId: z.string().min(1),
  type: z.enum(["Kudos", "Badge", "Award", "Shoutout"]).default("Kudos"),
  message: z.string().min(1, "Message required"),
  badge: z.string().optional(),
  points: z.number().int().default(0),
  isPublic: z.boolean().default(true),
});

// ─── AI ─────────────────────────────────────────────────

export const resumeScreenSchema = z.object({
  candidateId: z.string().min(1),
  requisitionId: z.string().min(1),
});

export const aiInsightSchema = z.object({
  type: z.enum(["attrition_risk", "performance_trend", "team_health", "headcount_forecast"]),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
});
