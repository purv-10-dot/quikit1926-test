/**
 * Client for the central member-deprovisioning endpoint
 * (`${QUIKIT_URL}/api/internal/members/deprovision`).
 *
 * Used as dual-write compensation: when HRMS provisioned a brand-new central
 * user but then failed to persist its own invite row, this undoes the central
 * provision so the admin can retry cleanly. Central's guarded DELETE only
 * removes accounts it created (existing/linked users are left untouched).
 *
 * Implemented locally (not in @quikit/auth) because the endpoint is
 * HRMS-specific. Mirrors @quikit/auth/verify-token-remote (`x-internal-secret`).
 */

export interface DeprovisionMemberArgs {
  orgId: string;
  userId: string;
  appSlug: string;
}

export interface DeprovisionMemberResult {
  ok: boolean;
  error?: string;
}

const QUIKIT_URL = process.env.QUIKIT_URL ?? process.env.NEXT_PUBLIC_QUIKIT_URL;
const INTERNAL_SECRET = process.env.INTERNAL_SECRET;

export async function deprovisionMemberRemote(
  args: DeprovisionMemberArgs,
): Promise<DeprovisionMemberResult> {
  if (!QUIKIT_URL || !INTERNAL_SECRET) {
    return {
      ok: false,
      error: "Central provisioning is not configured (QUIKIT_URL / INTERNAL_SECRET).",
    };
  }
  try {
    const res = await fetch(
      `${QUIKIT_URL.replace(/\/$/, "")}/api/internal/members/deprovision`,
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
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return {
        ok: false,
        error: typeof data.error === "string" ? data.error : `HTTP ${res.status}`,
      };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  }
}
