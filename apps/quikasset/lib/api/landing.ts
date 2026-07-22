/**
 * Post-login landing policy — shared by the marketing (`/`) redirect and the
 * /dashboard route gate so both agree on where a user belongs.
 *
 * The dashboard is admin / asset-manager facing (gated on `Dashboard:view`).
 * Plain Members don't hold that permission, so they land on /employee-view
 * ("My Assets"). Resolving this from the permission set BEFORE navigating
 * avoids sending a Member to /dashboard, whose API 403s into a dead spinner.
 */

/** The slice of loadMyPermissions() this policy needs. */
export type LandingPerms = { isAdmin: boolean; permissions: string[] };

/** True when the user may view the dashboard (admin or explicit Dashboard:view). */
export function canSeeDashboard(perms: LandingPerms): boolean {
  return perms.isAdmin || perms.permissions.includes("Dashboard:view");
}

/** Where a freshly-authenticated user should land, based on their permissions. */
export function postLoginLanding(perms: LandingPerms): "/dashboard" | "/employee-view" {
  return canSeeDashboard(perms) ? "/dashboard" : "/employee-view";
}
