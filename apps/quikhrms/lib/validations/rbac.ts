import { z } from "zod";

/**
 * RBAC v2 schemas — match AppRole / RolePermission / UserAppRole columns.
 *
 * AppRole identity is `name` (unique per orgId+appId). Old `code` field
 * dropped; `name` doubles as both display + lookup key (e.g. "super_admin").
 *
 * Permission codes still use "hrms.<domain>.<action>" wire format; split
 * to (resource, action) at storage boundary via lib/rbac/registry.
 */

// Strict slug used on Create (identity). PATCH relaxes to any printable string
// since rename to display labels (e.g. "Site Manager") is a common admin op.
const slugRegex = /^[a-z][a-z0-9_]*$/;

// Accept either `name` or legacy `code` on create — UI still sends `code`.
export const createRoleSchema = z.object({
  name: z.string().min(2).max(100).regex(slugRegex).optional(),
  code: z.string().min(2).max(100).regex(slugRegex).optional(),
  description: z.string().max(500).optional(),
  isDefault: z.boolean().default(false),
  permissions: z.array(z.string()).default([]),
}).transform((v, ctx) => {
  const name = v.name ?? v.code;
  if (!name) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "name is required", path: ["name"] });
    return z.NEVER;
  }
  return { name, description: v.description, isDefault: v.isDefault, permissions: v.permissions };
});

export const updateRoleSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).optional(),
  isDefault: z.boolean().optional(),
});

export const setRolePermissionsSchema = z.object({
  permissions: z.array(z.string()).min(0),
});

export const assignRoleSchema = z.object({
  roleId: z.string().nullable(),
  expiresAt: z.string().datetime().nullable().optional(),
});

export const setUserExtrasSchema = z.object({
  grants: z.array(z.string()).default([]),
  denies: z.array(z.string()).default([]),
});
