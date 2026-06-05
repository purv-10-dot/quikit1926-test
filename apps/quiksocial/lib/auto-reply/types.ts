/**
 * Shared zod schemas + TypeScript types for the auto-reply feature.
 *
 * Used by:
 *   - User-facing routes under /api/auto-reply/* (session auth)
 *   - Internal routes under /api/internal/auto-reply/* (X-QS-Internal-Token)
 *   - The AI service client (apps/ai-service/auto_reply/internal_client.py)
 *     consumes the same JSON shapes — keep Pydantic models in
 *     apps/ai-service/schemas/auto_reply.py in sync if you edit this file.
 *
 * QuikIT note: internal routes accept BOTH `orgId` (canonical) and the
 * legacy `tenantId` field name from the Python service. Schemas below
 * keep `tenantId` as an alias on internal request shapes — the route
 * handlers fall back to `tenantId` when `orgId` is absent. Wire-format
 * compatibility is preserved during the org-id migration window.
 */

import { z } from "zod";

// ─── Enums ──────────────────────────────────────────────────────────────────

export const TriggerType = z.enum(["ANY_COMMENT", "KEYWORD_MATCH"]);
export const ReplyMode = z.enum(["TEMPLATE", "AI"]);
export const KeywordMatch = z.enum(["ANY", "ALL"]);
export const LogStatus = z.enum(["PENDING", "SENT", "FAILED", "SKIPPED"]);

export type TriggerType = z.infer<typeof TriggerType>;
export type ReplyMode = z.infer<typeof ReplyMode>;
export type KeywordMatch = z.infer<typeof KeywordMatch>;
export type LogStatus = z.infer<typeof LogStatus>;

// ─── Rule CRUD ──────────────────────────────────────────────────────────────

const cuid = z.string().min(1).max(64);

const ruleShape = {
  brandId: cuid,
  socialAccountId: cuid,
  name: z.string().trim().min(1).max(200),
  triggerType: TriggerType,
  replyMode: ReplyMode,
  isActive: z.boolean().default(true),
  priority: z.number().int().min(0).default(0),

  templateBody: z.string().max(4000).nullish(),
  keywords: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
  keywordMatch: KeywordMatch.default("ANY"),
  caseSensitive: z.boolean().default(false),

  toneGuidance: z.string().max(2000).nullish(),

  cooldownMinutes: z.number().int().min(0).max(10080).default(0),
  maxRepliesPerDay: z.number().int().min(0).max(10000).default(0),
};

/** Enforce: TEMPLATE → templateBody required; AI → toneGuidance required;
 *  KEYWORD_MATCH → at least one keyword. */
function crossFieldCheck(
  data: {
    replyMode: ReplyMode;
    triggerType: TriggerType;
    templateBody?: string | null;
    toneGuidance?: string | null;
    keywords?: string[];
  },
  ctx: z.RefinementCtx,
) {
  if (data.replyMode === "TEMPLATE") {
    if (!data.templateBody || !data.templateBody.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["templateBody"],
        message: "templateBody is required when replyMode is TEMPLATE",
      });
    }
  }
  if (data.replyMode === "AI") {
    if (!data.toneGuidance || !data.toneGuidance.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["toneGuidance"],
        message: "toneGuidance is required when replyMode is AI",
      });
    }
  }
  if (data.triggerType === "KEYWORD_MATCH") {
    if (!data.keywords || data.keywords.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["keywords"],
        message: "keywords must be non-empty when triggerType is KEYWORD_MATCH",
      });
    }
  }
}

export const CreateRuleSchema = z.object(ruleShape).superRefine(crossFieldCheck);
export type CreateRuleInput = z.infer<typeof CreateRuleSchema>;

export const UpdateRuleSchema = z
  .object({
    name: ruleShape.name.optional(),
    triggerType: ruleShape.triggerType.optional(),
    replyMode: ruleShape.replyMode.optional(),
    isActive: ruleShape.isActive.optional(),
    priority: ruleShape.priority.optional(),
    templateBody: ruleShape.templateBody,
    keywords: ruleShape.keywords.optional(),
    keywordMatch: ruleShape.keywordMatch.optional(),
    caseSensitive: ruleShape.caseSensitive.optional(),
    toneGuidance: ruleShape.toneGuidance,
    cooldownMinutes: ruleShape.cooldownMinutes.optional(),
    maxRepliesPerDay: ruleShape.maxRepliesPerDay.optional(),
  })
  .superRefine((data, ctx) => {
    // Only run cross-field check if all relevant fields are present.
    if (data.replyMode && data.triggerType) {
      crossFieldCheck(
        {
          replyMode: data.replyMode,
          triggerType: data.triggerType,
          templateBody: data.templateBody,
          toneGuidance: data.toneGuidance,
          keywords: data.keywords,
        },
        ctx,
      );
    }
  });
export type UpdateRuleInput = z.infer<typeof UpdateRuleSchema>;

export const ToggleRuleSchema = z.object({ isActive: z.boolean() });

// ─── Post control ───────────────────────────────────────────────────────────

export const UpsertPostControlSchema = z.object({
  postId: cuid,
  autoReplyEnabled: z.boolean(),
});

// ─── Logs query ─────────────────────────────────────────────────────────────

export const ListLogsQuerySchema = z.object({
  brandId: cuid.optional(),
  ruleId: cuid.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// ─── Internal: monitor batch ────────────────────────────────────────────────
//
// Internal schemas accept BOTH `orgId` (canonical) and `tenantId` (legacy
// wire-format from the Python service). At least one must be present.
// Route handlers reconcile to a single `orgId` via `body.orgId ?? body.tenantId`.

export const MonitorBatchRequestSchema = z.object({
  orgId: cuid.optional(),
  tenantId: cuid.optional(),
  socialAccountId: cuid,
});

// ─── Internal: log reserve / finalize ───────────────────────────────────────

export const ReserveLogSchema = z.object({
  orgId: cuid.optional(),
  tenantId: cuid.optional(),
  ruleId: cuid,
  postId: cuid,
  socialAccountId: cuid,
  platformCommentId: z.string().min(1).max(128),
  commentAuthor: z.string().max(200).nullish(),
  commentAuthorId: z.string().max(128).nullish(),
  commentText: z.string().max(8000).nullish(),
  replyText: z.string().max(4000).nullish(),
  replyMode: ReplyMode,
});

export const FinalizeLogSchema = z.object({
  status: z.enum(["SENT", "FAILED", "SKIPPED"]),
  platformReplyId: z.string().max(128).nullish(),
  failureReason: z.string().max(2000).nullish(),
  latencyMs: z.number().int().min(0).nullish(),
  providerUsed: z.string().max(64).nullish(),
  replyText: z.string().max(4000).nullish(),
  // Phase 2 — populated for AI replies. Float USD, observability only.
  // Null for template replies (no provider call) or when the provider
  // couldn't compute cost (cost.py logs a warning and returns 0.0).
  costUsd: z.number().min(0).nullish(),
});

// ─── Platform toggle (user-facing) ──────────────────────────────────────────

export const PlatformToggleSchema = z.object({
  socialAccountId: cuid,
  autoReplyEnabled: z.boolean(),
});

// ─── Internal: responder-context ────────────────────────────────────────────

export const ResponderContextRequestSchema = z.object({
  orgId: cuid.optional(),
  tenantId: cuid.optional(),
  postId: cuid,
});

export type ResponderContextResponse = {
  brandName: string;
  brandVoice: string | null;
  brandTone: string[];
  brandValues: string[];
  thingsToAvoid: string[];
  postCaption: string;
  originalPrompt: string | null;
  /** Phase 2: single offering replaces v1's product/service split.
   *  `type` is the free-string slug from Offering.type — the Python
   *  responder branches its prompt template on this. */
  offering: {
    type: string;
    name: string;
    description: string | null;
    price: string | null;
    duration: string | null;
    category: string | null;
    tags: string[];
    features: string[];
    problemsSolved: string[];
  } | null;
};

// ─── Internal: cursor upsert ────────────────────────────────────────────────

export const UpsertCursorSchema = z.object({
  orgId: cuid.optional(),
  tenantId: cuid.optional(),
  socialAccountId: cuid,
  postId: cuid,
  platformPostId: z.string().min(1).max(128),
  // {offset: true} accepts both "Z" and numeric offsets ("+00:00"). The
  // Python monitor produces "+00:00" via datetime.isoformat(); Zod's
  // default datetime() is Z-only and 422s. See auto_reply/internal_client.py.
  lastPolledAt: z.string().datetime({ offset: true }),
  lastCommentTimestamp: z.string().datetime({ offset: true }).nullish(),
  consecutiveErrors: z.number().int().min(0).default(0),
  lastPollError: z.string().max(2000).nullish(),
});

// ─── Stale-PENDING sweep ────────────────────────────────────────────────────

export const SweepStaleSchema = z.object({
  orgId: cuid.optional(),
  tenantId: cuid.optional(),
  socialAccountId: cuid,
  olderThanMinutes: z.number().int().min(1).max(60).default(3),
});

// ─── Monitor batch response shape (typed for the cron / Python consumer) ────

export type MonitorBatchResponse = {
  /** Phase 2 — true when SocialAccount.autoReplyEnabled is false. When
   *  present and true, all other fields are empty arrays / minimal — the
   *  monitor short-circuits and skips polling for this tick. */
  platformDisabled?: boolean;
  socialAccount: {
    id: string;
    platform: string;
    accountId: string;
    pageId: string | null;
    accessToken: string;
    tokenExpiresAt: string | null;
  };
  posts: Array<{
    id: string;
    platformPostId: string;
    publishedAt: string | null;
    autoReplyEnabled: boolean;
  }>;
  rules: Array<{
    id: string;
    brandId: string;
    name: string;
    triggerType: TriggerType;
    replyMode: ReplyMode;
    priority: number;
    templateBody: string | null;
    keywords: string[];
    keywordMatch: KeywordMatch;
    caseSensitive: boolean;
    toneGuidance: string | null;
    cooldownMinutes: number;
    maxRepliesPerDay: number;
    updatedAt: string;
  }>;
  cursorsByPostId: Record<
    string,
    { lastCommentTimestamp: string | null; consecutiveErrors: number }
  >;
  /** Last 24h of SENT logs under this socialAccount. Python derives both
   *  the cooldown check (per ruleId+commentAuthorId) and the daily cap
   *  check (per ruleId) from this list. */
  recentSends: Array<{
    ruleId: string;
    commentAuthorId: string | null;
    sentAt: string;
  }>;
};

/**
 * Helper: reconcile `orgId` / `tenantId` aliases on internal request bodies.
 * Internal callers (the Python service) may use either field name; routes
 * must accept both during the migration window. Returns the resolved orgId
 * or `null` when neither is set / non-empty.
 */
export function resolveOrgId(body: {
  orgId?: string | null;
  tenantId?: string | null;
}): string | null {
  const raw = body.orgId ?? body.tenantId;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}
