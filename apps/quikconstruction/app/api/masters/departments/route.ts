import { createListRoutes } from "@/lib/api/masterFactory";
import { departmentCreateSchema } from "@/lib/schemas/masters-phase2";

export const { GET, POST } = createListRoutes({
  model: "cnDepartment",
  createSchema: departmentCreateSchema,
  orderBy: { name: "asc" },
  uniqueBy: "code",
  errorLabel: "Department",
});
