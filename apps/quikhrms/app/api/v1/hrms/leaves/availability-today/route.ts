import { NextRequest } from "next/server";
import { withServiceAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";
import { getTodayAvailability, canSeeSensitiveAvailability } from "@/lib/services/availability";

export const GET = withServiceAuth(async (_req: NextRequest, ctx) => {
  try {
    // Sick/Parental identities + category only for HR (view-all-leave); everyone
    // else gets an anonymized "On leave" count. Shared with the home dashboard.
    const canSeeSensitive = canSeeSensitiveAvailability(ctx.permissions ?? []);
    const rows = await getTodayAvailability(ctx.orgId, canSeeSensitive);
    return successResponse(rows);
  } catch (e) {
    console.error("GET /leaves/availability-today error:", e);
    return internalError();
  }
});
