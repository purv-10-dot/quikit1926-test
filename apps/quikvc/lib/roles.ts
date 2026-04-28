/**
 * QuikVC role / portal mapping.
 *
 * The platform has 5 internal roles mapped to 3 portals. Role comes from the
 * NextAuth session via `session.user.membershipRole`. The portal is derived
 * deterministically from the role — there's no portal switcher per user, only
 * a tenant/fund switcher within a portal.
 *
 * Sprint 2 will hook this into the real session; for now Sprint 1 ships a
 * `?role=` query-param dev hatch so we can preview the three portals without
 * an auth setup. Remove the dev hatch before Sprint 2.
 */

export type QuikVCRole =
  | "founder"
  | "analyst"
  | "partner"
  | "fund_admin"
  | "ic_member";

export type QuikVCPortal = "vc" | "founder" | "investor";

const ROLE_TO_PORTAL: Record<QuikVCRole, QuikVCPortal> = {
  founder: "founder",
  analyst: "vc",
  partner: "vc",
  fund_admin: "vc",
  ic_member: "vc",
};

export function portalForRole(role: QuikVCRole | undefined): QuikVCPortal {
  if (!role) return "founder"; // safest default — limited surface
  return ROLE_TO_PORTAL[role] ?? "founder";
}

export const ROLE_LABEL: Record<QuikVCRole, string> = {
  founder: "Founder",
  analyst: "Analyst",
  partner: "Partner",
  fund_admin: "Fund Admin",
  ic_member: "IC Member",
};

/** Display name for a portal. */
export const PORTAL_LABEL: Record<QuikVCPortal, string> = {
  vc: "VC / Fund",
  founder: "Startup",
  investor: "Investor",
};

/** Default landing path per portal. */
export function homePathForPortal(portal: QuikVCPortal): string {
  switch (portal) {
    case "vc":
      return "/home";
    case "founder":
      return "/dashboard";
    case "investor":
      return "/dashboard";
  }
}
