import { createGetTenantId } from "@quikit/auth/get-tenant-id";
import { authOptions } from "@/lib/auth";

export const getTenantId = createGetTenantId(authOptions, { appSlug: "quikscale" });
