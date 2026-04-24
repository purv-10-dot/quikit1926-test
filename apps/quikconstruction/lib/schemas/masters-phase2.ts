import { z } from "zod";

// Phase 2 continuation — 12 additional master types.
// Pattern note: "simple" masters (code+name+status) share the same zod/ui shape.

export const bankCreateSchema = z.object({
  companyId: z.string().min(1, "Company is required"),
  bankName: z.string().min(1).max(200),
  branchName: z.string().optional().nullable(),
  accountNo: z.string().min(1).max(50),
  ifscCode: z.string().min(11, "IFSC must be 11 chars").max(11),
  accountType: z.enum(["current", "savings"]).default("current"),
  status: z.enum(["active", "inactive"]).default("active"),
});
export type BankCreateInput = z.infer<typeof bankCreateSchema>;
export const bankUpdateSchema = bankCreateSchema.partial();

export const departmentCreateSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  headUserId: z.string().optional().nullable(),
  status: z.enum(["active", "inactive"]).default("active"),
});
export type DepartmentCreateInput = z.infer<typeof departmentCreateSchema>;
export const departmentUpdateSchema = departmentCreateSchema.partial();

export const workCategoryCreateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional().nullable(),
  status: z.enum(["active", "inactive"]).default("active"),
});
export type WorkCategoryCreateInput = z.infer<typeof workCategoryCreateSchema>;
export const workCategoryUpdateSchema = workCategoryCreateSchema.partial();

export const costCenterCreateSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  projectId: z.string().optional().nullable(),
  status: z.enum(["active", "inactive"]).default("active"),
});
export type CostCenterCreateInput = z.infer<typeof costCenterCreateSchema>;
export const costCenterUpdateSchema = costCenterCreateSchema.partial();

export const locationCreateSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  type: z.enum(["site", "warehouse", "head_office", "yard"]),
  projectId: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  inCharge: z.string().optional().nullable(),
  status: z.enum(["active", "inactive"]).default("active"),
});
export type LocationCreateInput = z.infer<typeof locationCreateSchema>;
export const locationUpdateSchema = locationCreateSchema.partial();

export const gstCodeCreateSchema = z.object({
  code: z.string().min(1).max(20),
  description: z.string().min(1).max(200),
  rate: z.number().min(0).max(100),
  cgstRate: z.number().min(0).max(100),
  sgstRate: z.number().min(0).max(100),
  igstRate: z.number().min(0).max(100),
  status: z.enum(["active", "inactive"]).default("active"),
});
export type GstCodeCreateInput = z.infer<typeof gstCodeCreateSchema>;
export const gstCodeUpdateSchema = gstCodeCreateSchema.partial();

export const tdsCodeCreateSchema = z.object({
  section: z.string().min(1).max(20),
  description: z.string().min(1).max(200),
  rate: z.number().min(0).max(100),
  thresholdAmount: z.number().min(0).optional().nullable(),
  status: z.enum(["active", "inactive"]).default("active"),
});
export type TdsCodeCreateInput = z.infer<typeof tdsCodeCreateSchema>;
export const tdsCodeUpdateSchema = tdsCodeCreateSchema.partial();

export const termsCreateSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1),
  applicableTo: z.enum(["po", "wo", "rfq", "general"]),
  isDefault: z.boolean().default(false),
  status: z.enum(["active", "inactive"]).default("active"),
});
export type TermsCreateInput = z.infer<typeof termsCreateSchema>;
export const termsUpdateSchema = termsCreateSchema.partial();

export const financialYearCreateSchema = z
  .object({
    companyId: z.string().min(1),
    label: z.string().min(1).max(50),
    startDate: z.string().min(1),
    endDate: z.string().min(1),
    isCurrent: z.boolean().default(false),
    status: z.enum(["active", "inactive"]).default("active"),
  })
  .refine((d) => new Date(d.endDate) > new Date(d.startDate), {
    message: "endDate must be after startDate",
    path: ["endDate"],
  });
export type FinancialYearCreateInput = z.infer<typeof financialYearCreateSchema>;
export const financialYearUpdateSchema = z
  .object({
    companyId: z.string().min(1).optional(),
    label: z.string().min(1).max(50).optional(),
    startDate: z.string().min(1).optional(),
    endDate: z.string().min(1).optional(),
    isCurrent: z.boolean().optional(),
    status: z.enum(["active", "inactive"]).optional(),
  });

export const projectCreateSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  description: z.string().optional().nullable(),
  companyId: z.string().min(1),
  clientId: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(),
  expectedEndDate: z.string().optional().nullable(),
  actualEndDate: z.string().optional().nullable(),
  projectValue: z.number().min(0).optional().nullable(),
  projectManagerId: z.string().optional().nullable(),
  status: z.enum(["active", "inactive", "completed", "on-hold"]).default("active"),
});
export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;
export const projectUpdateSchema = projectCreateSchema.partial();

export const machineryCreateSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  type: z.string().min(1).max(50),
  make: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  registrationNo: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  locationId: z.string().optional().nullable(),
  fuelType: z.string().optional().nullable(),
  capacity: z.string().optional().nullable(),
  status: z.enum(["active", "inactive", "under-maintenance"]).default("active"),
});
export type MachineryCreateInput = z.infer<typeof machineryCreateSchema>;
export const machineryUpdateSchema = machineryCreateSchema.partial();

export const assetCreateSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  category: z.string().optional().nullable(),
  purchaseDate: z.string().optional().nullable(),
  purchaseValue: z.number().min(0).optional().nullable(),
  locationId: z.string().optional().nullable(),
  assignedTo: z.string().optional().nullable(),
  status: z.enum(["active", "inactive", "disposed"]).default("active"),
});
export type AssetCreateInput = z.infer<typeof assetCreateSchema>;
export const assetUpdateSchema = assetCreateSchema.partial();
