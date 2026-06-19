/**
 * QuikVC role / portal mapping.
 *
 * Role comes from `session.user.membershipRole` (set by the QuikIT IdP from
 * Membership.role). Portal is derived deterministically — there's no portal
 * switcher per user, only a tenant/fund switcher within a portal.
 *
 * Role naming: hyphenated kebab-case (`fund-admin`, `ic-member`). This matches
 * Membership.role values seeded by seed-quikvc.ts and the role groups in
 * lib/rbac.ts. Older code used underscores — those are gone.
 */

export type QuikVCRole =
  | "founder"
  | "investor"
  | "analyst"
  | "partner"
  | "fund-admin"
  | "ic-member"
  /// Tenant-level admin (inherited from QuikIT). Treated as VC + fund-admin.
  | "admin";

export type QuikVCPortal = "vc" | "founder" | "investor";

const ROLE_TO_PORTAL: Record<QuikVCRole, QuikVCPortal> = {
  founder: "founder",
  investor: "investor",
  analyst: "vc",
  partner: "vc",
  "fund-admin": "vc",
  "ic-member": "vc",
  admin: "vc",
};

export function portalForRole(role: QuikVCRole | string | undefined): QuikVCPortal {
  if (!role) return "founder"; // safest default — limited surface
  return ROLE_TO_PORTAL[role as QuikVCRole] ?? "founder";
}

export const ROLE_LABEL: Record<QuikVCRole, string> = {
  founder: "Founder",
  investor: "Investor",
  analyst: "Analyst",
  partner: "Partner",
  "fund-admin": "Fund Admin",
  "ic-member": "IC Member",
  admin: "Admin",
};

/** Display name for a portal. */
export const PORTAL_LABEL: Record<QuikVCPortal, string> = {
  vc: "VC / Fund",
  founder: "Startup",
  investor: "Investor",
};

/** Default landing path per portal.
 *
 * Investor home is `/summary`, not `/dashboard`, because Next.js doesn't
 * allow two parallel route groups (`(founder)` + `(investor)`) to resolve
 * to the same URL. See app/(investor)/summary/page.tsx for the actual page.
 */
export function homePathForPortal(portal: QuikVCPortal): string {
  switch (portal) {
    case "vc":
      return "/home";
    case "founder":
      return "/dashboard";
    case "investor":
      return "/summary";
  }
}
