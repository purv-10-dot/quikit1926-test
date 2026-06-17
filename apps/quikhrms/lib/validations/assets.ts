import { z } from "zod";

export const AssetCategoryEnum = z.string().min(1, "Category required");

export const AssetStatusEnum = z.enum(["Available", "Assigned", "InRepair", "Retired", "AssetLost"]);
export const AssetConditionEnum = z.enum(["New", "Good", "Fair", "Poor"]);

export const createAssetSchema = z.object({
  assetCode: z.string().min(1, "Asset code required"),
  name: z.string().min(1, "Name required"),
  category: AssetCategoryEnum.default("AssetOther"),
  quantity: z.number().int().min(1).default(1),
  serialNumber: z.string().optional(),
  brand: z.string().optional(),
  model: z.string().optional(),
  purchaseDate: z.string().optional().nullable(),
  purchasePrice: z.number().min(0).optional().nullable(),
  warrantyExpiry: z.string().optional().nullable(),
  status: AssetStatusEnum.default("Available"),
  condition: AssetConditionEnum.default("New"),
  location: z.string().optional(),
  specs: z.record(z.string(), z.unknown()).optional(),
  notes: z.string().optional(),
  trackIndividually: z.boolean().optional(),
});

export const updateAssetSchema = createAssetSchema.partial().omit({ assetCode: true });

export const assignAssetSchema = z.object({
  employeeId: z.string().min(1, "Employee required"),
  expectedReturnDate: z.string().optional().nullable(),
  notes: z.string().optional(),
  force: z.boolean().optional(),
});

export const returnAssetSchema = z.object({
  returnCondition: AssetConditionEnum.default("Good"),
  markLost: z.boolean().default(false),
  notes: z.string().optional(),
});

export const scrapAssetSchema = z.object({
  quantity: z.number().int().min(1, "Quantity must be at least 1"),
  disposalReason: z.string().min(1, "Reason required"),
  disposalDate: z.string().optional().nullable(),
  scrapValue: z.number().min(0).optional().nullable(),
  markLost: z.boolean().optional(),
  notes: z.string().optional(),
});

export type CreateAssetInput = z.infer<typeof createAssetSchema>;
export type AssignAssetInput = z.infer<typeof assignAssetSchema>;
export type ReturnAssetInput = z.infer<typeof returnAssetSchema>;
export type ScrapAssetInput = z.infer<typeof scrapAssetSchema>;
