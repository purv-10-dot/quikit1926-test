import { z } from "zod";
import { MEMBERSHIP_ROLES, INVITE_METHOD } from "@quikit/shared";

/**
 * Roles an Org Admin can hand out via the invite form (FRD FR-OA-001 / §5.2).
 * Org Admin / Super Admin are NOT selectable here — Org Admin is created by
 * the Superadmin org-onboarding flow (FR-SA-003), Super Admin is platform-only.
 */
const orgInviteRoleEnum = z.enum([
  MEMBERSHIP_ROLES.APP_ADMIN,
  MEMBERSHIP_ROLES.MEMBER,
]);

/**
 * Roles accepted for member CRUD updates. Wider than the invite enum because
 * an admin may legitimately upgrade a member to Org Admin via the management UI.
 * The legacy "admin" string is kept for backwards compat with pre-2026-05-04
 * rows seeded under the old role naming.
 */
const memberUpdateRoleEnum = z.enum([
  MEMBERSHIP_ROLES.SUPER_ADMIN,
  MEMBERSHIP_ROLES.ORG_ADMIN,
  MEMBERSHIP_ROLES.APP_ADMIN,
  MEMBERSHIP_ROLES.MEMBER,
  // Legacy values still in the DB for backwards compat.
  "admin",
  "executive",
  "manager",
  "employee",
  "coach",
]);

const inviteMethodEnum = z.enum([INVITE_METHOD.SSO, INVITE_METHOD.NATIVE]);

export const inviteMemberSchema = z
  .object({
    email: z.string().email("Invalid email address"),
    firstName: z
      .string()
      .min(1, "First name is required")
      .max(50, "First name max 50 characters")
      .regex(/^[A-Za-z\s'\-]+$/, "First name may contain only letters, spaces, apostrophes, and hyphens"),
    lastName: z
      .string()
      .min(1, "Last name is required")
      .max(50, "Last name max 50 characters")
      .regex(/^[A-Za-z\s'\-]+$/, "Last name may contain only letters, spaces, apostrophes, and hyphens"),
    role: orgInviteRoleEnum.default(MEMBERSHIP_ROLES.APP_ADMIN),
    inviteMethod: inviteMethodEnum,
    appIds: z.array(z.string().min(1)).default([]),
  })
  .superRefine((data, ctx) => {
    // FR-OA-002 — App Admin must have at least one application.
    if (data.role === MEMBERSHIP_ROLES.APP_ADMIN && data.appIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["appIds"],
        message: "Select at least one application for the App Admin",
      });
    }
  });

export const updateMemberSchema = z.object({
  role: memberUpdateRoleEnum.optional(),
  status: z.enum(["active", "inactive", "pending"]).optional(),
  teamIds: z.array(z.string()).optional(),
  customPermissions: z.record(z.boolean()).optional(),
});
