import { z } from "zod";
import { zPhoneOptional } from "./identifiers";

// ─── Hiring Pipeline ────────────────────────────────────

export const pipelineStageConfigSchema = z.object({
  name: z.string().min(1),
  sendMail: z.boolean().default(false),
  mailTemplate: z.enum(["interview", "offer-branded", "offer-default", "welcome", "joining-letter"]).nullable().optional(),
});

export const createPipelineSchema = z.object({
  name: z.string().min(1),
  stages: z.array(z.union([z.string().min(1), pipelineStageConfigSchema])).min(2),
  isDefault: z.boolean().optional(),
});

export const updatePipelineSchema = z.object({
  name: z.string().min(1).optional(),
  stages: z.array(z.union([z.string().min(1), pipelineStageConfigSchema])).min(2).optional(),
  isDefault: z.boolean().optional(),
});

// ─── Job Requisition ────────────────────────────────────

const requisitionBaseObject = z.object({
  title: z.string().min(1, "Title required"),
  pipelineId: z.string().min(1, "Pipeline required"),
  departmentId: z.string().min(1, "Department required"),
  reportingToId: z.string().optional(),
  positions: z.number().int().min(1).default(1),
  type: z.enum(["NewPosition", "Replacement", "Expansion"]).default("NewPosition"),
  employmentType: z.enum(["FullTime", "PartTime", "Contract", "Intern", "Freelancer", "Consultant"]).default("FullTime"),
  workLocation: z.enum(["Office", "Remote", "Hybrid"]).default("Office"),
  experienceMin: z.number().int().optional(),
  experienceMax: z.number().int().optional(),
  salaryMin: z.number().optional(),
  salaryMax: z.number().optional(),
  salaryCurrency: z.string().default("INR"),
  jobDescription: z.string().optional(),
  responsibilities: z.array(z.string()).optional(),
  requirements: z.array(z.string()).optional(),
  niceToHave: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
  skillWeights: z.array(z.object({
    skill: z.string().min(1, "Skill required"),
    weight: z.number().int().min(1).max(10),
  })).optional(),
  education: z.string().optional(),
  benefits: z.array(z.string()).optional(),

  // Role scorecard — optional. Captures the JD-Scorecard pattern at hiring time.
  rolePurpose: z.string().max(500).optional(),
  firstDays30: z.array(z.string().max(300)).optional(),
  firstDays60: z.array(z.string().max(300)).optional(),
  firstDays90: z.array(z.string().max(300)).optional(),
  topKpis: z.array(z.object({
    metric: z.string().min(1).max(200),
    target: z.string().min(1).max(200),
  })).optional(),

  priority: z.enum(["Low", "Medium", "High", "Urgent"]).default("Medium"),
  careerPageVisible: z.boolean().default(true),
  internalPostingOnly: z.boolean().default(false),
  postToJobPortal: z.boolean().default(false),
  referralBonusAmount: z.number().optional(),
  hiringManagerId: z.string().optional(),
  recruiterId: z.string().optional(),

  // 5-step requisition wizard — planning & posting extras
  jobOpeningName: z.string().optional(),
  interviewPanelIds: z.array(z.string()).optional(),
  budget: z.number().optional(),
  targetJoiningDate: z.string().optional(),
  closedDate: z.string().optional(), // "Timeline to Close"
  etaToFillDays: z.number().int().optional(),
  jobGrade: z.string().optional(),
  costCenter: z.string().optional(),
  // Job Requisition Form parity
  jobLocation: z.string().optional(),
  jobDuration: z.string().optional(),
  workTimings: z.string().optional(),
  interviewMode: z.enum(["Video", "InPerson", "Either", "NotRequired"]).optional(),
});

// Cross-field logical checks shared by create + update. Each guard is null-safe
// so partial/edit payloads that omit a field don't trip it.
function requisitionCrossFieldChecks(
  d: {
    experienceMin?: number | null; experienceMax?: number | null;
    salaryMin?: number | null; salaryMax?: number | null; budget?: number | null;
    targetJoiningDate?: string; closedDate?: string;
  },
  ctx: z.RefinementCtx,
) {
  if (d.experienceMin != null && d.experienceMax != null && d.experienceMin > d.experienceMax) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Min experience can’t be greater than max experience", path: ["experienceMax"] });
  }
  if (d.salaryMin != null && d.salaryMax != null && d.salaryMin > d.salaryMax) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Min salary can’t be greater than max salary", path: ["salaryMax"] });
  }
  if (d.budget != null && d.salaryMax != null && d.budget < d.salaryMax) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Budget should be at least the maximum salary", path: ["budget"] });
  }
  // YYYY-MM-DD strings compare correctly lexicographically.
  if (d.targetJoiningDate && d.closedDate && d.targetJoiningDate < d.closedDate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Target joining date should be on or after the close timeline", path: ["targetJoiningDate"] });
  }
}

export const createRequisitionSchema = requisitionBaseObject.superRefine(requisitionCrossFieldChecks);

export const updateRequisitionSchema = requisitionBaseObject.partial().extend({
  status: z.enum(["ReqDraft", "PendingApproval", "ReqApproved", "ReqOpen", "ReqOnHold", "ReqClosed", "ReqCancelled"]).optional(),
  closureReason: z.string().optional(),
}).superRefine(requisitionCrossFieldChecks);

// ─── Candidate ──────────────────────────────────────────

export const createCandidateSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: zPhoneOptional,
  resumeUrl: z.string().optional(),
  currentCompany: z.string().optional(),
  currentDesignation: z.string().optional(),
  currentCTC: z.number().optional(),
  expectedCTC: z.number().optional(),
  noticePeriod: z.number().int().optional(),
  totalExperience: z.number().int().optional(),
  skills: z.array(z.string()).optional(),
  education: z.array(z.object({ degree: z.string(), institution: z.string(), year: z.number().optional() })).optional(),
  linkedinUrl: z.string().optional(),
  portfolioUrl: z.string().optional(),
  source: z.enum(["CandJobPortal", "CandLinkedIn", "CandReferral", "CandAgency", "CandCareerPage", "CandCampus", "CandDirect", "CandInbound", "CandNaukri", "CandIndeed"]).default("CandDirect"),
  referredById: z.string().optional(),
  location: z.string().optional(),
  willingToRelocate: z.boolean().default(false),
  tags: z.array(z.string()).optional(),
});

export const updateCandidateSchema = createCandidateSchema.partial().extend({
  status: z.enum(["New", "InPipeline", "Hired", "CandRejected", "CandOnHold", "Withdrawn", "Blacklisted"]).optional(),
  rating: z.number().min(1).max(5).optional(),
});

// ─── Job Application ────────────────────────────────────

export const createApplicationSchema = z.object({
  candidateId: z.string().min(1),
  requisitionId: z.string().min(1),
  currentStage: z.string().optional(),
});

export const updateApplicationSchema = z.object({
  currentStage: z.string().optional(),
  status: z.enum(["AppActive", "AppHired", "AppRejected", "AppOnHold", "AppWithdrawn", "AppOffered", "AppDeclined"]).optional(),
  rejectionReason: z.string().optional(),
});

// ─── Interview ──────────────────────────────────────────

export const createInterviewSchema = z.object({
  applicationId: z.string().min(1),
  round: z.number().int().default(1),
  type: z.enum(["Phone", "Video", "InPerson", "Panel", "TakeHome", "GroupDiscussion"]).default("Video"),
  interviewerId: z.string().min(1),
  scheduledAt: z.string().min(1).refine((v) => new Date(v).getTime() > Date.now() - 60_000, {
    message: "Scheduled date/time cannot be in the past",
  }),
  duration: z.number().int().default(60),
  location: z.string().optional(),
  meetingLink: z.string().optional(),
});

export const updateInterviewSchema = z.object({
  status: z.enum(["IntScheduled", "IntCompleted", "IntCancelled", "IntNoShow", "IntRescheduled"]).optional(),
  scheduledAt: z.string().optional().refine((v) => !v || new Date(v).getTime() > Date.now() - 60_000, {
    message: "Scheduled date/time cannot be in the past",
  }),
  location: z.string().optional(),
  meetingLink: z.string().optional(),
  candidateFeedback: z.string().optional(),
});

// ─── Scorecard ──────────────────────────────────────────

export const createScorecardSchema = z.object({
  interviewId: z.string().min(1),
  applicationId: z.string().min(1),
  overallRating: z.number().int().min(1).max(10),
  recommendation: z.enum(["StrongHire", "Hire", "MaybeHire", "NoHire", "StrongNoHire"]),
  criteria: z.array(z.object({ name: z.string(), rating: z.number().int().min(1).max(5), comments: z.string().optional() })).optional(),
  strengths: z.string().optional(),
  concerns: z.string().optional(),
  overallComments: z.string().optional(),
});

// ─── Offer ──────────────────────────────────────────────

// Extra fields captured by the multi-step "Send Offer" wizard. Everything here
// is stored in JobApplication.offeredComponents (JSON) — no dedicated columns.
const offerWizardFields = {
  employmentType: z.string().max(50).optional(),
  compensationType: z.string().max(50).optional(),
  salaryStructureId: z.string().optional(),
  salaryTemplateName: z.string().max(120).optional(),
  components: z.array(z.object({ name: z.string(), annual: z.number() })).optional(),
  probationPeriod: z.string().max(50).optional(),
  workMode: z.string().max(50).optional(),
  workLocation: z.string().max(160).optional(),
  // Legacy single-doc fields (kept for back-compat with older clients).
  supportingDocKey: z.string().max(300).optional(),
  supportingDocName: z.string().max(260).optional(),
  // Current: multiple supporting documents attached to the offer email.
  supportingDocs: z.array(z.object({ key: z.string().max(300), name: z.string().max(260).optional() })).max(10).optional(),
};

export const createOfferSchema = z.object({
  applicationId: z.string().min(1),
  designation: z.string().min(1),
  departmentId: z.string().optional(),
  reportingToId: z.string().optional(),
  offeredCTC: z.number().min(0),
  joiningDate: z.string().min(1),
  joiningBonus: z.number().optional(),
  relocationBonus: z.number().optional(),
  equityGrant: z.string().optional(),
  expiresAt: z.string().optional(),
  ...offerWizardFields,
}).refine(
  (d) => !d.expiresAt || new Date(d.expiresAt) > new Date(d.joiningDate),
  { message: "Offer expiry date must be after the joining date", path: ["expiresAt"] },
);

export const updateOfferSchema = z.object({
  status: z.enum(["OfferDraft", "OfferPendingApproval", "OfferApproved", "OfferSent", "OfferAccepted", "OfferDeclined", "OfferNegotiating", "OfferRevoked", "OfferExpired"]).optional(),
  declineReason: z.string().optional(),
  counterOfferCTC: z.number().optional(),
  negotiationNotes: z.string().optional(),
  // Detail fields — the wizard edits an existing Draft before sending.
  designation: z.string().min(1).optional(),
  departmentId: z.string().optional(),
  reportingToId: z.string().optional(),
  offeredCTC: z.number().min(0).optional(),
  joiningDate: z.string().optional(),
  joiningBonus: z.number().optional(),
  relocationBonus: z.number().optional(),
  equityGrant: z.string().optional(),
  expiresAt: z.string().optional(),
  ...offerWizardFields,
});
