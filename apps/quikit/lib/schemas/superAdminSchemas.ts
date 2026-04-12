import { z } from "zod";

// ─── Organizations ────────────────────────────────────────────────────────────

export const createOrgSchema = z.object({
  name: z.string().min(1, "Organization name is required").max(100),
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only"),
  plan: z.enum(["startup", "growth", "enterprise"]).default("startup"),
  billingEmail: z.string().email("Invalid email").optional().nullable(),
  description: z.string().max(500).optional().nullable(),
});

export const updateOrgSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  plan: z.enum(["startup", "growth", "enterprise"]).optional(),
  status: z.enum(["active", "suspended", "archived"]).optional(),
  billingEmail: z.string().email().optional().nullable(),
  description: z.string().max(500).optional().nullable(),
});

// ─── App Registry ─────────────────────────────────────────────────────────────

export const createAppSchema = z.object({
  name: z.string().min(1, "App name is required").max(100),
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only"),
  description: z.string().max(500).optional().nullable(),
  baseUrl: z.string().url("Invalid URL"),
  status: z.enum(["active", "coming_soon", "disabled"]).default("active"),
});

export const updateAppSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  baseUrl: z.string().url().optional(),
  status: z.enum(["active", "coming_soon", "disabled"]).optional(),
});

// ─── Platform Users ───────────────────────────────────────────────────────────

export const createUserSchema = z.object({
  email: z.string().email("Invalid email"),
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  password: z.string().min(8, "Password must be at least 8 characters"),
  isSuperAdmin: z.boolean().default(false),
});

export const updateUserSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  isSuperAdmin: z.boolean().optional(),
});
