import { z } from "zod";
// Single source of truth for the per-upload row cap (shared with employee bulk import).
import { MAX_BULK_UPLOAD_ROWS } from "./gap-fill";

/** Admin creates an invitation. firstName/lastName required so the
 *  employee account can be created cleanly when the invite is consumed. */
export const createInvitationSchema = z.object({
  email: z.string().email("Valid email required"),
  firstName: z.string().min(1, "First name required").max(80),
  lastName: z.string().min(1, "Last name required").max(80),
  // Empty = "Use org default" — provisioning falls back to the tenant default role.
  roleIds: z.array(z.string().min(1)).default([]),
  // How the invitee signs in to QuikIT: "native" (temp password emailed) or
  // "sso" (Google/Microsoft). Drives central provisioning + the email.
  invitationMethod: z.enum(["native", "sso"]).default("native"),
  departmentId: z.string().min(1).optional().nullable(),
  designationId: z.string().min(1).optional().nullable(),
  managerId: z.string().min(1).optional().nullable(),
});

/** One parsed CSV row for bulk invite. `roles` is a comma-separated list of
 *  role NAMES (resolved to ids server-side); empty falls back to defaultRoleIds. */
const bulkInvitationRowSchema = z.object({
  email: z.string().trim().email("Valid email required"),
  firstName: z.string().trim().min(1, "First name required").max(80),
  lastName: z.string().trim().min(1, "Last name required").max(80),
  roles: z.string().trim().optional().default(""),
});

export const bulkInvitationSchema = z.object({
  fileName: z.string().min(1).max(255),
  rows: z
    .array(bulkInvitationRowSchema)
    .min(1, "No rows found")
    .max(
      MAX_BULK_UPLOAD_ROWS,
      `You can invite at most ${MAX_BULK_UPLOAD_ROWS} users at a time`,
    ),
  /** Roles applied to any row that has no `roles` column value. */
  defaultRoleIds: z.array(z.string().min(1)).default([]),
  // How every invitee signs in to QuikIT — mirrors the single-invite default.
  // "native" (temp password emailed) or "sso" (Google/Microsoft). Drives the
  // per-row central provisioning + the accept link in the email.
  invitationMethod: z.enum(["native", "sso"]).default("native"),
});
