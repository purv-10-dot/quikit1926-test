import { createIdRoutes } from "@/lib/api/masterFactory";
import { assetUpdateSchema } from "@/lib/schemas/masters-phase2";

export const { GET, PATCH, DELETE } = createIdRoutes({
  model: "cnAsset",
  updateSchema: assetUpdateSchema,
  uniqueBy: "code",
  errorLabel: "Asset",
});
