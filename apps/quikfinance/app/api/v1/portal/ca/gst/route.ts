import type { NextRequest } from "next/server";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { prisma } from "@/lib/prisma";
import { db } from "@/lib/db";
import { portalRoute } from "@/lib/portal/api";
import { buildGstr1Report, buildGstr3bReport } from "@/lib/report-data";
import type { ApiContext } from "@/lib/api/auth";

export const dynamic = "force-dynamic";

/**
 * CA portal GST returns, scoped to the selected company (client switcher).
 * Reuses the finance app's exact GSTR-1 / GSTR-3B builders by handing them a
 * context whose orgId is the selected company. ?type=gstr-1|gstr-3b&from&to
 */
export async function GET(request: NextRequest) {
  const guard = await portalRoute("ca", "view");
  if (!guard.ok) return guard.response;
  const { userId, orgId, role } = guard.context;

  const sp = request.nextUrl.searchParams;
  const type = sp.get("type") ?? "gstr-1";
  const from = sp.get("from") ?? `${new Date().getUTCFullYear()}-01-01`;
  const to = sp.get("to") ?? new Date().toISOString().slice(0, 10);

  // Synthetic finance context bound to the selected company.
  const ctx: ApiContext = { db, prisma, userId, orgId, role };

  try {
    const report = type === "gstr-3b" ? await buildGstr3bReport(ctx, from, to) : await buildGstr1Report(ctx, from, to);
    return ok({ ...report, period: { from, to } });
  } catch (error) {
    return fail(500, { code: "CA_GST_FAILED", message: errorMessage(error) });
  }
}
