import { z } from "zod";

/**
 * The canonical role list tolerated by user-admin endpoints.
 *
 * The frontend currently offers a LEGACY 3-role menu (admin / manager /
 * member). The shared `ROLES` constant in @quikit/shared/constants
 * introduces the canonical 6-role set (super_admin / admin / executive /
 * manager / employee / coach). Existing rows in the database use either
 * vocabulary.
 *
 * Until the UI is migrated to the canonical set, the PUT and POST schemas
 * MUST accept BOTH so that round-tripping an existing user in the Edit
 * modal doesn't reject valid DB values. `member` is explicitly included
 * for back-compat with legacy org-setup/users rows.
 *
 * Flagged as tech debt: reconcile the frontend ROLES menu with
 * @quikit/shared/constants.ROLES and migrate legacy `member` rows to
 * `employee` (the closest canonical equivalent).
 */
const USER_ROLE_VALUES = [
  "super_admin",
  "admin",
  "executive",
  "manager",
  "employee",
  "coach",
  "member", // legacy — keep until frontend migration
] as const;

/**
 * Validation for PUT /api/org/users/[id].
 *
 * All fields are optional so partial updates (rename, role change, team
 * reassignment) work. `email` is validated for shape; `password` must meet
 * minimum length. `role`/`status` are constrained to the known values.
 */
export const updateOrgUserSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName:  z.string().min(1).max(100).optional(),
  email:     z.string().email("Invalid email").max(200).optional(),
  password:  z.string().min(8, "Password must be at least 8 characters").max(200).optional(),
  role:      z.enum(USER_ROLE_VALUES).optional(),
  status:    z.enum(["active", "invited", "inactive", "declined", "pending"]).optional(),
  teamIds:   z.array(z.string()).optional(),
  // Legacy single-team form — back-compat with older client payloads.
  teamId:    z.string().nullable().optional(),
});

export type UpdateOrgUserInput = z.infer<typeof updateOrgUserSchema>;

/**
 * POST /api/org/users — create a new member (or add existing user to tenant).
 */
export const createOrgUserSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(100),
  lastName:  z.string().min(1, "Last name is required").max(100),
  email:     z.string().email("Invalid email").max(200),
  password:  z.string().min(8, "Password must be at least 8 characters").max(200),
  role:      z.enum(USER_ROLE_VALUES).optional(),
  teamIds:   z.array(z.string()).optional(),
  teamId:    z.string().nullable().optional(),
});

export type CreateOrgUserInput = z.infer<typeof createOrgUserSchema>;
