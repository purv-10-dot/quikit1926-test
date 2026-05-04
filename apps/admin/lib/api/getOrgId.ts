import { createGetOrgId } from "@quikit/auth/get-tenant-id";
import { authOptions } from "@/lib/auth";

export const getOrgId = createGetOrgId(authOptions, { appSlug: "admin-portal" });
