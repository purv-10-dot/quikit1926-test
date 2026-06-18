/**
 * Client for the central member-provisioning endpoint
 * (`${QUIKIT_URL}/api/internal/members/provision`).
 *
 * When an HRMS admin invites someone, this provisions them in central QuikIT as
 * an org "member" (so they can sign in via SSO). New central users get a temp
 * password emailed by central; existing QuikIT users are linked by email.
 *
 * Unlike the read-only member lookup, provisioning is a WRITE: on any
 * misconfiguration / network error / non-OK response it returns
 * `{ ok: false, error }` so the caller does NOT create a local invite with no
 * backing central account.
 *
 * Implemented locally (not in @quikit/auth) because the endpoint is
 * HRMS-specific. Mirrors @quikit/auth/verify-token-remote (`x-internal-secret`).
 */

export interface ProvisionMemberArgs {
  orgId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  appSlug: string;
  invitationMethod?: string;
}

export interface ProvisionMemberResult {
  ok: boolean;
  error?: string;
  /** Central user id (present on success). */
  userId?: string;
  /** True when central created a brand-new user (vs linked an existing one). */
  isNewUser?: boolean;
  /** Central accept-invite token for brand-new native users (resend links). */
  invitationToken?: string;
  /** Temp password central minted for a brand-new native user (emailed once). */
  tempPassword?: string;
}

const QUIKIT_URL = process.env.QUIKIT_URL ?? process.env.NEXT_PUBLIC_QUIKIT_URL;
const INTERNAL_SECRET = process.env.INTERNAL_SECRET;

export async function provisionMemberRemote(
  args: ProvisionMemberArgs,
): Promise<ProvisionMemberResult> {
  if (!QUIKIT_URL || !INTERNAL_SECRET) {
    return {
      ok: false,
      error: "Central provisioning is not configured (QUIKIT_URL / INTERNAL_SECRET).",
    };
  }
  try {
    const res = await fetch(
      `${QUIKIT_URL.replace(/\/$/, "")}/api/internal/members/provision`,
      {
        method: "POST",
        headers: {
          "x-internal-secret": INTERNAL_SECRET,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(args),
        cache: "no-store",
      },
    );
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        error: typeof data.error === "string" ? data.error : `HTTP ${res.status}`,
      };
    }
    return {
      ok: true,
      userId: typeof data.userId === "string" ? data.userId : undefined,
      isNewUser: Boolean(data.isNewUser),
      invitationToken:
        typeof data.invitationToken === "string" ? data.invitationToken : undefined,
      tempPassword:
        typeof data.tempPassword === "string" ? data.tempPassword : undefined,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  }
}
