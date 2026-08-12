export type ModuleAction =
  | "view"
  | "create"
  | "edit"
  | "delete"
  | "export"
  | "import"
  | "markComplete";

export interface ModulePermRow {
  module: string;
  actions: ModuleAction[];
  hiddenFields: string[];
  restrictedFields: string[];
}

export type PermissionMatrix = ModulePermRow[];

export interface SessionUser {
  userId: string;
  orgId: string;
  /** CRM role (Administrator | SalesManager | ...), mapped from `membershipRole`. */
  role: string;
  email: string;
  name: string;
  /**
   * RAW platform membership role (`org_admin`, `app_admin`, `member`, ...) as
   * stored on quikit.OrgMember, before mapRole() collapses it into the CRM
   * role above. The platform's own guards — requireAppAccess, ADMIN_TIER_ROLES
   * — are defined in terms of these values, so the unmapped role has to survive
   * for this app to participate in the shared access model.
   *
   * Optional so existing SessionUser literals (tests, fixtures) keep compiling.
   */
  membershipRole?: string | null;
  /** Platform super admin. Bypasses org/app access checks. */
  isSuperAdmin?: boolean;
}
