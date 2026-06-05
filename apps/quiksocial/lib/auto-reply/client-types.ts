/**
 * Frontend-facing types for the Auto-Reply dashboard UI.
 *
 * These mirror the server response shapes of /api/auto-reply/* routes.
 * Keep in sync with lib/auto-reply/types.ts (which holds the zod request
 * schemas — those have stricter validation; these are the loose response
 * shapes the UI consumes).
 */

import type {
  TriggerType,
  ReplyMode,
  KeywordMatch,
  LogStatus,
} from "./types";

export type { TriggerType, ReplyMode, KeywordMatch, LogStatus };

export type RuleRow = {
  id: string;
  brandId: string;
  socialAccountId: string;
  name: string;
  triggerType: TriggerType;
  replyMode: ReplyMode;
  isActive: boolean;
  priority: number;
  templateBody: string | null;
  keywords: string[];
  keywordMatch: KeywordMatch;
  caseSensitive: boolean;
  toneGuidance: string | null;
  cooldownMinutes: number;
  maxRepliesPerDay: number;
  createdAt: string;
  updatedAt: string;
};

export type LogRow = {
  id: string;
  ruleId: string;
  postId: string;
  socialAccountId: string;
  platformCommentId: string;
  commentAuthor: string | null;
  commentAuthorId: string | null;
  commentText: string | null;
  replyText: string | null;
  replyMode: ReplyMode;
  status: LogStatus;
  failureReason: string | null;
  providerUsed: string | null;
  latencyMs: number | null;
  platformReplyId: string | null;
  sentAt: string;
  // Phase 1B enrichment — joined in by GET /api/auto-reply/logs.
  ruleName: string | null;
  platform: string | null;
  postTitle: string | null;
};

export type StatsResponse = {
  repliesSent: number;
  successRate: number | null;
  avgResponseMs: number | null;
  activeRules: number;
  windowDays: number;
};

export type SocialAccountRow = {
  id: string;
  platform: "instagram" | "facebook" | string;
  accountName: string;
  accountId: string;
  pageId: string | null;
  isActive: boolean;
  /** Phase 2 — platform-level master switch. When false the monitor
   *  skips this account entirely. */
  autoReplyEnabled: boolean;
};

export type PostWithControlRow = {
  id: string;
  title: string | null;
  content: string;
  platform: string;
  publishedAt: string | null;
  imageUrls: string[];
  aiImageUrl: string | null;
  /** undefined while loading; defaults to true on the server when no control row exists. */
  autoReplyEnabled: boolean;
};

/** Standard contract returned by every data hook. */
export type HookResult<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
};
