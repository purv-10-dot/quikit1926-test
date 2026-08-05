import { z } from "zod";

// ─── Department ─────────────────────────────────────────

export const createDepartmentSchema = z.object({
  name: z.string().min(1, "Name required"),
  code: z.string().min(1, "Code required"),
  parentDepartmentId: z.string().optional(),
  headId: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(["Active", "Inactive"]).default("Active"),
});

export const updateDepartmentSchema = createDepartmentSchema.partial();

// ─── Team ───────────────────────────────────────────────

export const createTeamSchema = z.object({
  name: z.string().min(1, "Name required"),
  departmentId: z.string().min(1, "Department required"),
  leadId: z.string().optional(),
  description: z.string().optional(),
});

export const updateTeamSchema = createTeamSchema.partial();

// ─── Designation ────────────────────────────────────────

export const createDesignationSchema = z.object({
  title: z.string().min(1, "Title required"),
  level: z.number().int().default(0),
  departmentId: z.string().optional(),
});

export const updateDesignationSchema = createDesignationSchema.partial();

// ─── Grade ──────────────────────────────────────────────

const gradeBase = z.object({
  name: z.string().min(1, "Name required"),
  level: z.number().int().default(0),
  minSalary: z.number().optional(),
  maxSalary: z.number().optional(),
});

const gradeSalaryCheck = (d: { minSalary?: number; maxSalary?: number }, ctx: z.RefinementCtx) => {
  if (d.minSalary != null && d.maxSalary != null && d.minSalary > d.maxSalary) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Min salary can’t be greater than max salary", path: ["maxSalary"] });
  }
};

export const createGradeSchema = gradeBase.superRefine(gradeSalaryCheck);

export const updateGradeSchema = gradeBase.partial().superRefine(gradeSalaryCheck);

// ─── Office Location ────────────────────────────────────

export const createOfficeLocationSchema = z.object({
  name: z.string().min(1, "Name required"),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  zipCode: z.string().optional(),
  timezone: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  isHeadquarter: z.boolean().default(false),
});

export const updateOfficeLocationSchema = createOfficeLocationSchema.partial();
