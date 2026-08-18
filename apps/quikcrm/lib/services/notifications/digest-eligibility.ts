/**
 * Digest recipient ELIGIBILITY (Phase 5 recipient feature, Stage 1).
 *
 * Decides WHO can RECEIVE a digest. Single source of truth, used by:
 *   - the read API  (Settings → Users: render the toggle enabled/disabled + reason)
 *   - the write API  (reject toggling an ineligible user)
 *   - digest-run     (defense-in-depth: drop a since-ineligible recipient at send)
 *
 * Rules (spec 2026-08-11 — role restrictions REMOVED):
 *   - EVERY role is eligible to RECEIVE the daily digest. If a user's Daily
 *     Digest toggle is ON, they get the email regardless of their CRM role
 *     (SalesUser / SalesManager / MarketingUser / FinanceUser / TeamManager /
 *     Administrator all qualify).
 *
 * The toggle itself remains admin-only — that is a separate concern enforced at
 * the write boundary (app/api/settings/digest-recipients/route.ts), NOT here.
 * Receiving eligibility and toggle authorization are deliberately decoupled:
 * an admin turns the toggle on for anyone; anyone with it on receives.
 *
 * Each recipient is still SCOPED by their real role downstream
 * (buildRoleMetrics / getActivityFieldAggregates) — "who receives" is answered
 * here, "what they see" is answered by their role at render time. So a
 * SalesUser recipient gets a SalesUser-scoped digest, not org-wide data.
 *
 * The prior rules (Administrator-only + SalesManager-needs-a-team, with the
 * "no-team" / "not-eligible-role" reasons) are intentionally gone. The reason
 * type is retained so the read DTO and the toggle's tooltip map keep compiling
 * and can carry future non-role reasons.
 *
 * No CrmUserAppRole dependency (that was the silent-skip root cause).
 */

export type DigestIneligibleReason = "no-team" | "not-eligible-role";

export interface DigestEligibility {
  eligible: boolean;
  reason?: DigestIneligibleReason;
}

/** Caller identity needed to decide eligibility. */
interface EligibilityUser {
  userId: string;
  orgId: string;
  role: string;
}

/**
 * Every role can receive the daily digest. Kept async (and keeping its
 * signature) so all four call sites — read DTO, write API, send-time re-check —
 * stay unchanged.
 */
export async function isDigestEligible(_user: EligibilityUser): Promise<DigestEligibility> {
  return { eligible: true };
}
