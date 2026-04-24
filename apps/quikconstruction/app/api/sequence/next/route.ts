import { NextResponse } from "next/server";
import { z } from "zod";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
import { nextNumber, fyKey } from "@/lib/sequence";

const withTenantAuth = withTenantAuthForModule("masters");

const q = z.object({
  prefix: z.string().min(1).max(20),
  useFy: z.enum(["true", "false"]).optional(),
});

/**
 * GET /api/sequence/next?prefix=INV&useFy=true
 * Returns { number: "INV/FY2526/000042" } — atomic, collision-free.
 *
 * Front-end forms should call this when opening "New <Doc>" to prefill the
 * number field, replacing the `Date.now().toString().slice(-6)` pattern.
 */
export const GET = withTenantAuth(async ({ tenantId }, req) => {
  const params = q.parse(Object.fromEntries(req.nextUrl.searchParams));
  const number = await nextNumber({
    tenantId,
    prefix: params.prefix.toUpperCase(),
    fy: params.useFy === "true" ? fyKey() : null,
  });
  return NextResponse.json({ success: true, data: { number } });
});
