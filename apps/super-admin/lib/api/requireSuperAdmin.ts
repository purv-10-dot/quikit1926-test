import { createRequireSuperAdmin } from "@quikit/auth/require-super-admin";
import { authOptions } from "@/lib/auth";

export const requireSuperAdmin = createRequireSuperAdmin(authOptions);
