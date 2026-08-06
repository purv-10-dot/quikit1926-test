import { z } from "zod";

export const userRoleEnum = z.enum(["Administrator", "SalesManager", "SalesUser", "MarketingUser", "FinanceUser"]);
export const userStatusEnum = z.enum(["Active", "Inactive"]);

/**
 * Accept status in any case ("active"/"Active") and normalize to canonical.
 * The DB stores it lowercase, so request bodies that echo a fetched user back
 * would otherwise fail the strict enum. The downstream service maps the
 * canonical value, so normalizing here keeps that mapping correct.
 */
const userStatusInput = z.preprocess((v) => {
  if (typeof v !== "string") return v;
  const s = v.trim().toLowerCase();
  if (s === "active") return "Active";
  if (s === "inactive") return "Inactive";
  return v;
}, userStatusEnum);

/**
 * Legacy/alias role strings (DB-seeded "admin", SSO "org_admin", free-text
 * "sales manager", …) mapped to the canonical enum. Keys are normalized by
 * lower-casing and stripping spaces/underscores/hyphens. Mirrors the alias
 * sets already trusted elsewhere (lib/auth/is-crm-admin.ts,
 * lib/services/settings/invite-helpers.ts).
 */
const ROLE_ALIASES: Record<string, z.infer<typeof userRoleEnum>> = {
  administrator: "Administrator",
  admin: "Administrator",
  orgadmin: "Administrator",
  appadmin: "Administrator",
  superadmin: "Administrator",
  owner: "Administrator",
  salesmanager: "SalesManager",
  manager: "SalesManager",
  salesuser: "SalesUser",
  sales: "SalesUser",
  marketinguser: "MarketingUser",
  marketing: "MarketingUser",
  financeuser: "FinanceUser",
  finance: "FinanceUser",
};

/** Canonicalize a stored/alias role string, or return it unchanged when unknown. */
export function normalizeUserRole(role: string): string {
  const key = role.trim().toLowerCase().replace(/[\s_-]+/g, "");
  return ROLE_ALIASES[key] ?? role;
}

/**
 * Accept role as a canonical enum value OR a known legacy alias. The DB stores
 * legacy values like "admin", so a request body that echoes a fetched user back
 * would otherwise fail the strict enum (the same trap the status field hit).
 */
const userRoleInput = z.preprocess((v) => {
  if (typeof v !== "string") return v;
  return normalizeUserRole(v);
}, userRoleEnum);

export const createUserSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  email: z.string().email().toLowerCase().trim(),
  phone: z.string().optional().nullable(),
  role: userRoleInput.default("SalesUser"),
  status: userStatusInput.default("Active"),
  /** Required for brand-new native users unless omitted → system default (Quikit123). */
  password: z.string().min(8).max(128).optional(),
  permissionTemplateIds: z.array(z.string().trim().min(1)).default([]),
  allowedAccountIds: z.array(z.string().trim().min(1)).default([]),
  reportingManagerId: z.string().trim().min(1).optional().nullable(),
  /** Link an existing org member into QuikCRM — skips auth.User create. */
  linkExistingUserId: z.string().trim().min(1).optional(),
  invitationMethod: z.enum(["native", "sso"]).default("native"),
});

export const updateUserSchema = createUserSchema.partial().extend({
  // Password updates go through /reset-password — strip from PATCH
  password: z.undefined().optional(),
});

export const listUsersQuerySchema = z.object({
  q: z.string().optional(),
  status: userStatusEnum.optional(),
  role: userRoleEnum.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
