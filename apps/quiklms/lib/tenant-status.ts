/**
 * Tenant status ↔ platform Org status.
 *
 * `LmsTenant` used to carry its own `status` column (`Active` / `Paused` /
 * `Trial`), independent of `quikit.Org.status`. That was a second source of
 * truth for the same fact: baseline §3 makes an active membership require
 * `Org.status === "active"`, so pausing a tenant in the LMS suspended nothing
 * platform-wide — the tenant's users kept working everywhere, including in
 * QuikLMS, because the real gate never looked at this column.
 *
 * The column is gone. The super-admin pause/reactivate toggle now writes
 * `Org.status`, which is the value the platform actually enforces. These helpers
 * are the ONLY place the two vocabularies are translated, so the mapping cannot
 * drift between the read path and the write path.
 *
 * The API still speaks `Active` / `Paused`, so the super-admin screens
 * (system-health, platform-analytics, tenants) need no change.
 *
 * `Trial` is deliberately not represented. It had no `Org` equivalent — a trial
 * is expressed by `Subscription.status = "trialing"` and
 * `OrgAppAccess.trialEndsAt`, not by the org being in a third state — and no
 * tenant row had ever used the value.
 */

/** The vocabulary the LMS API and its super-admin screens speak. */
export type TenantStatus = 'Active' | 'Paused';

/** `quikit.Org.status` values observed in the platform: active | suspended. */
const ORG_ACTIVE = 'active';
const ORG_SUSPENDED = 'suspended';

/**
 * Platform → LMS. Anything that is not explicitly `active` reads as Paused:
 * erring toward "shown as paused" is the safe direction for an admin screen —
 * it flags an org that needs attention rather than hiding a problem.
 */
export function toTenantStatus(orgStatus: string | null | undefined): TenantStatus {
  return orgStatus === ORG_ACTIVE ? 'Active' : 'Paused';
}

/** LMS → platform. */
export function toOrgStatus(status: TenantStatus): string {
  return status === 'Active' ? ORG_ACTIVE : ORG_SUSPENDED;
}
