// Core constants imported from shared package (single source of truth)
export {
  ROLES,
  type Role,
  ROLE_HIERARCHY,
  ROLE_LABELS,
  MEMBERSHIP_STATUS,
  TENANT_PLANS,
} from "@quikit/shared";

// PAGES & PATHS (app-specific)
export const PATHS = {
  HOME: "/",
  LOGIN: "/login",
  SELECT_ORG: "/select-org",
  DASHBOARD: "/dashboard",

  MEMBERS: "/dashboard/members",
  TEAMS: "/dashboard/teams",
  APPS: "/dashboard/apps",
  SETTINGS: "/dashboard/settings",
  ROLES: "/dashboard/roles",
} as const;
