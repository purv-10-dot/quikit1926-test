/**
 * Rollout switch for RBAC-authoritative permission resolution.
 *
 * Background: QuikScale / QuikTrack / QuikInfra resolve permissions purely from
 * their `AppRole` / `RolePermission` / `UserAppRole` tables — no row, no
 * permission (default-deny). CrmExpress historically unioned an IN-CODE role
 * baseline (`roleBaselineMatrix`) on top of those tables, which meant a role
 * could only ever ADD permissions: demoting someone, or editing a role to
 * remove an action, had no effect. This switch is how we cross to the
 * platform's model without a flag-day.
 *
 * Modes (env `CRMEXPRESS_RBAC_MODE`):
 *
 *   shadow  — DEFAULT. Serves the legacy union exactly as before, but also
 *             computes the authoritative matrix and logs any user whose two
 *             matrices differ. Zero behaviour change; it only produces the
 *             evidence needed to decide whether `on` is safe. Run this until
 *             the log is quiet.
 *
 *   on      — Authoritative: RBAC grants ∪ permission templates. The legacy
 *             baseline is dropped and the Administrator short-circuit in
 *             `assertModule` is disabled, so roles can finally restrict.
 *
 *   off     — Legacy only, no shadow computation. Escape hatch if the shadow
 *             pass ever costs more than it's worth.
 *
 * Deliberately an env var and not a DB row: a persisted flag would need a model
 * in `packages/database`, and this app's changes stay inside `apps/quikcrmexpress`.
 */
export type RbacMode = "shadow" | "on" | "off";

export function rbacMode(): RbacMode {
  const raw = (process.env.CRMEXPRESS_RBAC_MODE ?? "").trim().toLowerCase();
  if (raw === "on" || raw === "authoritative") return "on";
  if (raw === "off" || raw === "legacy") return "off";
  return "shadow";
}

/** True when RBAC tables are the sole source of truth for permissions. */
export function isRbacAuthoritative(): boolean {
  return rbacMode() === "on";
}
