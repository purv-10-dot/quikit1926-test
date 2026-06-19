/**
 * Audit log helper — append-only writes to VCAuditLog.
 *
 * Best-effort: never throws into business logic. Used for:
 *   - RBAC denials (403)
 *   - Privileged actions (allocation, ic-settle, term-sheet-generate, etc.)
 *   - Admin config changes (verticals, scoring criteria, fund profile)
 *
 * Pair with the existing VCTimelineEvent pattern — timeline is per-deal and
 * user-visible, audit log is tenant-wide and ops/compliance-visible.
 */
import { db } from "@/lib/db";
import type { NextRequest } from "next/server";

export type AuditAction =
  | "rbac.deny"
  | "allocation.create"
  | "ic.vote"
  | "ic.settle"
  | "term-sheet.generate"
  | "term-sheet-template.update"
  | "vertical.create"
  | "vertical.update"
  | "vertical.delete"
  | "scoring-criterion.create"
  | "scoring-criterion.update"
  | "scoring-criterion.delete"
  | "fund-profile.update"
  | "investor.create"
  | "commitment.create"
  | "repayment-schedule.create"
  | "repayment-payment.create"
  | "deal.advance"
  | "sourced.convert"
  | "sourced.score";

export interface AuditInput {
  orgId: string;
  userId: string | null;
  action: AuditAction;
  resource?: string;
  outcome?: "ok" | "denied" | "error";
  metadata?: Record<string, unknown>;
  req?: NextRequest;
}

export async function audit(input: AuditInput): Promise<void> {
  try {
    await db.vCAuditLog.create({
      data: {
        orgId: input.orgId,
        userId: input.userId,
        action: input.action,
        resource: input.resource,
        outcome: input.outcome ?? "ok",
        metadata: (input.metadata ?? null) as never,
        ipAddress: input.req?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        userAgent: input.req?.headers.get("user-agent") ?? null,
      },
    });
  } catch (err: unknown) {
    // eslint-disable-next-line no-console
    console.warn("[audit] failed", err instanceof Error ? err.message : err);
  }
}
