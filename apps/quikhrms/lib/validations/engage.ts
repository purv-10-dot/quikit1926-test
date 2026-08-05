import { z } from "zod";

// The UI/API use the visibility value "Team", but the Prisma `PostVisibility`
// enum stores it as "HrmsTeam" (renamed to avoid a cross-app clash). Translate
// at the route boundary so "Team" never reaches Prisma (enum error → 500) and
// DB reads surface "Team" back to the UI.
type VisibilityApi = "Organization" | "Department" | "Team" | "Custom";
type VisibilityDb = "Organization" | "Department" | "HrmsTeam" | "Custom";
export function visibilityToDb(v: VisibilityApi): VisibilityDb {
  return v === "Team" ? "HrmsTeam" : v;
}

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

const announcementBase = z.object({
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

const announcementChecks = (d: { publishedAt?: string; expiresAt?: string }, ctx: z.RefinementCtx) => {
  if (d.publishedAt && d.expiresAt && d.expiresAt < d.publishedAt) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Expiry must be on or after the publish date", path: ["expiresAt"] });
  }
};

export const createAnnouncementSchema = announcementBase.superRefine(announcementChecks);

export const updateAnnouncementSchema = announcementBase.partial().superRefine(announcementChecks);

// ─── Survey ─────────────────────────────────────────────

export const createSurveySchema = z.object({
  title: z.string().min(1, "Title required"),
  type: z.enum(["Engagement", "PulseCheck", "Exit", "Onboarding", "Custom", "ENPS"]).default("Engagement"),
  questions: z.array(z.object({
    text: z.string().min(1),
    type: z.enum(["SurveyRating", "SurveyScale", "MultiChoice", "SingleChoice", "FreeText", "NPS", "Matrix"]),
    options: z.array(z.string()).optional(),
    scale: z.object({ min: z.number(), max: z.number(), labels: z.array(z.string()).optional() })
      .refine((s) => s.max > s.min, { message: "Scale max must be greater than min", path: ["max"] })
      .optional(),
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
}).refine(
  (d) => d.endDate >= d.startDate,
  { message: "End date must be on or after the start date", path: ["endDate"] },
);

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
  // points is NOT client-supplied — it's derived server-side from the type.
  isPublic: z.boolean().default(true),
});
