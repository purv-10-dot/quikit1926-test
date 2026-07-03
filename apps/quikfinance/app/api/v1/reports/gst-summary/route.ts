import { requireApiContext } from "@/lib/api/auth";
import { fail, ok } from "@/lib/api/responses";
import { buildGstSummaryReport } from "@/lib/report-data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireApiContext();
  if (!auth.ok) {
    return fail(auth.status, { code: auth.code, message: auth.message });
  }

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") ?? "2026-01-01";
  const to = searchParams.get("to") ?? new Date().toISOString().slice(0, 10);

  const report = await buildGstSummaryReport(auth.context, from, to);
  return ok(report);
}
