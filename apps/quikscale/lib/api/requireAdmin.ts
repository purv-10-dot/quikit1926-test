import { createRequireAdmin } from "@quikit/auth/require-admin";
import { authOptions } from "@/lib/auth";

export const requireAdmin = createRequireAdmin(authOptions);
