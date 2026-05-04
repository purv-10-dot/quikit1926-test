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
  PENDING: "pending",
} as const;

export type MembershipStatus = (typeof MEMBERSHIP_STATUS)[keyof typeof MEMBERSHIP_STATUS];

// ── v4 role split ──────────────────────────────────────────────────────────
// MEMBERSHIP_ROLES live on OrgMember.role (org-wide authority).
// Per-app authority lives on UserAppAccess.role (app-scoped, value depends
// on the app's domain — fetch from app schema).
//
// Migration plan: legacy ROLES (super_admin/admin/executive/manager/employee/
// coach) remain for backwards-compat with existing app code. New code should
// use MEMBERSHIP_ROLES + the app-specific AppRole values.

export const MEMBERSHIP_ROLES = {
  ORG_ADMIN: "org_admin",
  APP_ADMIN: "app_admin",
  MEMBER: "member",
} as const;

export type MembershipRole = (typeof MEMBERSHIP_ROLES)[keyof typeof MEMBERSHIP_ROLES];

export const MEMBERSHIP_ROLE_LABELS: Record<MembershipRole, string> = {
  [MEMBERSHIP_ROLES.ORG_ADMIN]: "Org Admin",
  [MEMBERSHIP_ROLES.APP_ADMIN]: "App Admin",
  [MEMBERSHIP_ROLES.MEMBER]: "Member",
};

// ── Domain status const-enums ──────────────────────────────────────────────
// These are TypeScript const objects (not Prisma enums) so they share the
// exact string literals used in the database without requiring a schema
// migration. Prefer these over magic strings in new code.

export const KPI_STATUS = {
  ACTIVE: "active",
  PAUSED: "paused",
  COMPLETED: "completed",
} as const;
export type KpiStatus = (typeof KPI_STATUS)[keyof typeof KPI_STATUS];

export const KPI_HEALTH_STATUS = {
  ON_TRACK: "on-track",
  AT_RISK: "at-risk",
  CRITICAL: "critical",
  COMPLETE: "complete",
} as const;
export type KpiHealthStatus = (typeof KPI_HEALTH_STATUS)[keyof typeof KPI_HEALTH_STATUS];

export const PRIORITY_STATUS = {
  NOT_APPLICABLE: "not-applicable",
  NOT_YET_STARTED: "not-yet-started",
  NOT_STARTED: "not-started",
  BEHIND_SCHEDULE: "behind-schedule",
  ON_TRACK: "on-track",
  COMPLETED: "completed",
} as const;
export type PriorityStatus = (typeof PRIORITY_STATUS)[keyof typeof PRIORITY_STATUS];

export const WWW_STATUS = {
  NOT_YET_STARTED: "not-yet-started",
  IN_PROGRESS: "in-progress",
  COMPLETED: "completed",
  BLOCKED: "blocked",
  NOT_APPLICABLE: "not-applicable",
} as const;
export type WwwStatus = (typeof WWW_STATUS)[keyof typeof WWW_STATUS];

export const REVIEW_STATUS = {
  DRAFT: "draft",
  SUBMITTED: "submitted",
  FINALIZED: "finalized",
} as const;
export type ReviewStatus = (typeof REVIEW_STATUS)[keyof typeof REVIEW_STATUS];

export const OPSP_STATUS = {
  DRAFT: "draft",
  FINALIZED: "finalized",
} as const;
export type OpspStatus = (typeof OPSP_STATUS)[keyof typeof OPSP_STATUS];

export const KPI_LEVEL = {
  INDIVIDUAL: "individual",
  TEAM: "team",
} as const;
export type KpiLevel = (typeof KPI_LEVEL)[keyof typeof KPI_LEVEL];

export const QUARTER = {
  Q1: "Q1",
  Q2: "Q2",
  Q3: "Q3",
  Q4: "Q4",
} as const;
export type Quarter = (typeof QUARTER)[keyof typeof QUARTER];

export const MEASUREMENT_UNIT = {
  NUMBER: "Number",
  PERCENTAGE: "Percentage",
  CURRENCY: "Currency",
  RATIO: "Ratio",
} as const;
export type MeasurementUnit = (typeof MEASUREMENT_UNIT)[keyof typeof MEASUREMENT_UNIT];

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
