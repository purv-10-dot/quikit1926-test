// ROLES
export const ROLES = {
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  EXECUTIVE: "executive",
  MANAGER: "manager",
  EMPLOYEE: "employee",
  COACH: "coach",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

// ROLE HIERARCHY (higher = more permissions)
export const ROLE_HIERARCHY = {
  [ROLES.SUPER_ADMIN]: 6,
  [ROLES.ADMIN]: 5,
  [ROLES.EXECUTIVE]: 4,
  [ROLES.MANAGER]: 3,
  [ROLES.EMPLOYEE]: 2,
  [ROLES.COACH]: 1,
} as const;

// MEMBERSHIPS STATUSES
export const MEMBERSHIP_STATUS = {
  ACTIVE: "active",
  INVITED: "invited",
  INACTIVE: "inactive",
} as const;

// KPI STATUSES
export const KPI_STATUS = {
  ACTIVE: "active",
  PAUSED: "paused",
  COMPLETED: "completed",
  ARCHIVED: "archived",
} as const;

// KPI HEALTH STATUSES
export const KPI_HEALTH_STATUS = {
  ON_TRACK: "on-track",
  BEHIND_SCHEDULE: "behind-schedule",
  CRITICAL: "critical",
  NOT_STARTED: "not-started",
  COMPLETE: "complete",
} as const;

export type KPIHealthStatus =
  (typeof KPI_HEALTH_STATUS)[keyof typeof KPI_HEALTH_STATUS];

// PRIORITY STATUSES
export const PRIORITY_STATUS = {
  ON_TRACK: "on-track",
  BEHIND_SCHEDULE: "behind-schedule",
  COMPLETE: "complete",
  NOT_STARTED: "not-started",
} as const;

// WWW ITEM STATUSES
export const WWW_STATUS = {
  NOT_STARTED: "not-started",
  IN_PROGRESS: "in-progress",
  COMPLETE: "complete",
  BLOCKED: "blocked",
} as const;

// MEETING CADENCES
export const MEETING_CADENCE = {
  DAILY: "daily",
  WEEKLY: "weekly",
  MONTHLY: "monthly",
  QUARTERLY: "quarterly",
  ANNUAL: "annual",
} as const;

// OPSP SECTION TYPES
export const OPSP_SECTION_TYPES = {
  CORE_VALUES: "core_values",
  PURPOSE: "purpose",
  BHAG: "bhag",
  TARGETS_3_5_YEAR: "3to5_targets",
  GOALS_1_YEAR: "1year_goals",
  QUARTERLY_PRIORITIES: "quarterly_priorities",
  SEVEN_STRATA: "7_strata",
  STAKEHOLDERS: "stakeholders",
} as const;

// TENANT PLANS
export const TENANT_PLANS = {
  STARTUP: "startup",
  GROWTH: "growth",
  ENTERPRISE: "enterprise",
} as const;

// NOTIFICATION TYPES
export const NOTIFICATION_TYPES = {
  KPI_ALERT: "kpi_alert",
  PRIORITY_UPDATE: "priority_update",
  WWW_DUE: "www_due",
  MEETING_REMINDER: "meeting_reminder",
  AI_INSIGHT: "ai_insight",
} as const;

// AUDIT LOG ACTIONS
export const AUDIT_LOG_ACTIONS = {
  CREATE: "create",
  UPDATE: "update",
  DELETE: "delete",
  VIEW: "view",
} as const;

// QUARTERS
export const QUARTERS = ["Q1", "Q2", "Q3", "Q4"] as const;

// 5F TAGS FOR PERSONAL PLANNING
export const FIVE_F_TAGS = {
  FAITH: "faith",
  FAMILY: "family",
  FRIENDS: "friends",
  FITNESS: "fitness",
  FINANCE: "finance",
} as const;

// ROCKEFELLER HABITS (10 habits)
export const HABITS = {
  VISION: 1,
  MEETINGS: 2,
  SCOREBOARDS: 3,
  ACCOUNTABILITY: 4,
  RHYTHM: 5,
  STICKING_POINTS: 6,
  CASCADING_MESSAGES: 7,
  RECOGNITION: 8,
  TRAINING: 9,
  INNOVATION: 10,
} as const;

// MEASUREMENT UNITS
export const MEASUREMENT_UNITS = {
  NUMBER: "Number",
  PERCENTAGE: "Percentage",
  CURRENCY: "Currency",
  RATIO: "Ratio",
} as const;

// PAGES & PATHS
export const PATHS = {
  HOME: "/",
  LOGIN: "/auth/login",
  REGISTER: "/auth/register",
  DASHBOARD: "/dashboard",
  KPI: "/dashboard/kpi",
  PRIORITY: "/dashboard/priority",
  WWW: "/dashboard/www",
  MEETINGS: "/dashboard/meetings",
  OPSP: "/dashboard/opsp",
  ORG_SETUP: "/dashboard/org-setup",
  OPPP: "/dashboard/oppp",
  HABITS: "/dashboard/habits",
  CASH: "/dashboard/cash",
  SETTINGS: "/dashboard/settings",
} as const;
