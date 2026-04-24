import { createListRoutes } from "@/lib/api/masterFactory";
import { assetCreateSchema } from "@/lib/schemas/masters-phase2";

export const { GET, POST } = createListRoutes({
  model: "cnAsset",
  createSchema: assetCreateSchema,
  orderBy: { code: "asc" },
  uniqueBy: "code",
  errorLabel: "Asset",
});
