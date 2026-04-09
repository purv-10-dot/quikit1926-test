export const ROLES = {
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  EXECUTIVE: "executive",
  MANAGER: "manager",
  EMPLOYEE: "employee",
  COACH: "coach",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_HIERARCHY: Record<string, number> = {
  [ROLES.SUPER_ADMIN]: 6,
  [ROLES.ADMIN]: 5,
  [ROLES.EXECUTIVE]: 4,
  [ROLES.MANAGER]: 3,
  [ROLES.EMPLOYEE]: 2,
  [ROLES.COACH]: 1,
};

export const ROLE_LABELS: Record<string, string> = {
  [ROLES.SUPER_ADMIN]: "Super Admin",
  [ROLES.ADMIN]: "Admin",
  [ROLES.EXECUTIVE]: "Executive",
  [ROLES.MANAGER]: "Manager",
  [ROLES.EMPLOYEE]: "Employee",
  [ROLES.COACH]: "Coach",
};

export const MEMBERSHIP_STATUS = {
  ACTIVE: "active",
  INVITED: "invited",
  INACTIVE: "inactive",
  DECLINED: "declined",
} as const;

export const TENANT_PLANS = {
  STARTUP: "startup",
  GROWTH: "growth",
  ENTERPRISE: "enterprise",
} as const;

export const PATHS = {
  HOME: "/",
  LOGIN: "/login",
  SELECT_ORG: "/select-org",
  DASHBOARD: "/dashboard",
  ORGANISATIONS: "/dashboard/organisations",
  MEMBERS: "/dashboard/members",
  TEAMS: "/dashboard/teams",
  APPS: "/dashboard/apps",
  SETTINGS: "/dashboard/settings",
  ROLES: "/dashboard/roles",
} as const;
